-- ============================================================
-- Migration: group chat, exile room, unread tracking
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
-- Requires sql/add-dms.sql to have already been run.
--
-- Generalizes the fixed-pair DM design (dm_threads: player_a_id/
-- player_b_id) into an actual multi-member model: chat_threads +
-- chat_thread_members (a normal many-to-many). A 1:1 DM is now just a
-- thread with exactly two members — same table, same policies, no
-- special-casing needed anywhere.
--
-- Existing DM data is preserved: chat_threads reuses dm_threads' own ids
-- (so dm_messages.thread_id values stay valid with zero rewriting),
-- chat_thread_members is populated from player_a_id/player_b_id, and
-- dm_messages is renamed to chat_messages in place.
-- ============================================================

create table if not exists chat_threads (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references games(id) on delete cascade not null,
  name text, -- null for a plain DM (the UI derives a name from the other member(s)); set for a named group
  is_group boolean not null default false,
  is_exile_room boolean not null default false, -- see get_or_create_exile_room() below — at most one true row per game_id
  created_by uuid references players(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists chat_thread_members (
  thread_id uuid references chat_threads(id) on delete cascade not null,
  player_id uuid references players(id) on delete cascade not null,
  joined_at timestamptz not null default now(),
  primary key (thread_id, player_id)
);

create index if not exists chat_thread_members_player_idx on chat_thread_members(player_id);

-- Migrate existing 1:1 DM threads, reusing their ids.
insert into chat_threads (id, game_id, is_group, created_at)
select id, game_id, false, created_at from dm_threads
on conflict (id) do nothing;

insert into chat_thread_members (thread_id, player_id)
select id, player_a_id from dm_threads
on conflict do nothing;
insert into chat_thread_members (thread_id, player_id)
select id, player_b_id from dm_threads
on conflict do nothing;

alter table dm_messages rename to chat_messages;

-- The two dm_messages policies carry over through the rename (a rename
-- doesn't touch a table's policies) — but they still reference
-- dm_threads by name in their USING/WITH CHECK clauses, which is exactly
-- what's blocking the drop below ("cannot drop table dm_threads because
-- other objects depend on it"). They have to go BEFORE dm_threads does,
-- not after — this order was the actual bug.
drop policy if exists "read own dm messages" on chat_messages;
drop policy if exists "send own dm messages" on chat_messages;

-- Same "rename doesn't rewrite what's inside" issue as the policies
-- above, but for the foreign key: chat_messages.thread_id was still
-- formally pinned to dm_threads(id) (a rename doesn't touch a column's
-- existing constraints), which is what a SECOND attempt at the drop
-- below failed on even after the policies were cleared. Repoint it at
-- chat_threads instead — safe because chat_threads was seeded with the
-- exact same id values a few statements up, so every existing
-- chat_messages.thread_id still resolves to a real row under the new
-- constraint.
alter table chat_messages drop constraint if exists dm_messages_thread_id_fkey;
alter table chat_messages add constraint chat_messages_thread_id_fkey foreign key (thread_id) references chat_threads(id) on delete cascade;

drop table if exists dm_threads;

-- ---------------- Helpers (SECURITY DEFINER — see sql/schema.sql's note
-- on is_game_host for why: a policy on chat_thread_members that queried
-- chat_thread_members itself to check membership would hit Postgres'
-- "infinite recursion detected in policy" error) ----------------

create or replace function public.is_thread_member(p_thread_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from chat_thread_members m
    join players p on p.id = m.player_id
    where m.thread_id = p_thread_id and p.user_id = auth.uid()
  );
$$;

create or replace function public.thread_game_id(p_thread_id uuid)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select game_id from chat_threads where id = p_thread_id;
$$;

-- ---------------- RLS ----------------

alter table chat_threads enable row level security;
alter table chat_thread_members enable row level security;
alter table chat_messages enable row level security; -- carries the dm_messages RLS state across the rename automatically; re-declared explicitly for clarity

create policy "read own chat threads" on chat_threads
for select
using (is_thread_member(id) or is_game_host(game_id));

-- Thread creation itself goes through create_chat_thread() below (a
-- SECURITY DEFINER function), not a direct client insert — see that
-- function for why. This policy exists only so the function's own insert
-- (which runs as its own privileges, but Postgres still checks policies
-- unless the function explicitly bypasses RLS) succeeds for a caller who
-- legitimately owns one of the members being added.
create policy "create chat threads" on chat_threads
for insert
with check (true);

create policy "read own chat thread members" on chat_thread_members
for select
using (is_thread_member(thread_id) or is_game_host(thread_game_id(thread_id)));

create policy "insert chat thread members" on chat_thread_members
for insert
with check (true); -- same reasoning as "create chat threads" — done via create_chat_thread()

create policy "read own chat messages" on chat_messages
for select
using (is_thread_member(thread_id) or is_game_host(thread_game_id(thread_id)));

-- The host can READ every thread (see above) but never SEND as a player —
-- sender_id must be a player the caller actually owns, and that player
-- has to actually be a member of the thread.
create policy "send own chat messages" on chat_messages
for insert
with check (
  owns_player(sender_id)
  and exists (select 1 from chat_thread_members m where m.thread_id = chat_messages.thread_id and m.player_id = sender_id)
);

-- ---------------- Thread creation (RPC) ----------------
-- Handles both "start/reuse a 1:1 DM" and "create a named group" in one
-- atomic call — doing this as a plain client-side multi-step insert would
-- need an INSERT policy on chat_thread_members that can tell "I'm
-- bootstrapping a brand new thread" apart from "I'm adding someone to an
-- existing one," which is exactly the kind of policy that's easy to get
-- subtly wrong. A SECURITY DEFINER function sidesteps that: it does its
-- own authorization check up front (the caller must own one of the
-- members) and then just performs the inserts directly.
create or replace function public.create_chat_thread(p_game_id uuid, p_member_ids uuid[], p_name text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_player_id uuid;
  v_thread_id uuid;
  v_is_group boolean;
  v_sorted uuid[];
begin
  select id into v_caller_player_id
  from players
  where user_id = auth.uid() and game_id = p_game_id and id = any(p_member_ids);

  if v_caller_player_id is null then
    raise exception 'not authorized to create a thread with these members';
  end if;

  v_is_group := coalesce(array_length(p_member_ids, 1), 0) > 2;
  select array_agg(x order by x) into v_sorted from unnest(p_member_ids) x;

  -- 1:1 DMs are deduplicated — reopening a conversation with the same
  -- person returns the existing thread instead of creating a new one.
  if not v_is_group then
    select t.id into v_thread_id
    from chat_threads t
    where t.game_id = p_game_id and t.is_group = false
    and (
      select array_agg(m.player_id order by m.player_id)
      from chat_thread_members m
      where m.thread_id = t.id
    ) = v_sorted
    limit 1;
  end if;

  if v_thread_id is not null then
    return v_thread_id;
  end if;

  insert into chat_threads (game_id, name, is_group, created_by)
  values (p_game_id, p_name, v_is_group, v_caller_player_id)
  returning id into v_thread_id;

  insert into chat_thread_members (thread_id, player_id)
  select v_thread_id, unnest(p_member_ids);

  return v_thread_id;
end;
$$;

-- ---------------- The Exile room ----------------
-- One auto-managed group per game (is_exile_room = true), membership
-- kept in sync by lib/roundEngine.js the moment someone's actually
-- exiled — see get_or_create_exile_room() below, which the app calls
-- right before adding that player. SECURITY DEFINER because this runs
-- from the server-side round-advance flow (service-role), not as any
-- particular player.
create or replace function public.get_or_create_exile_room(p_game_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thread_id uuid;
begin
  select id into v_thread_id from chat_threads where game_id = p_game_id and is_exile_room = true limit 1;
  if v_thread_id is not null then
    return v_thread_id;
  end if;
  insert into chat_threads (game_id, name, is_group, is_exile_room)
  values (p_game_id, 'Exile Room', true, true)
  returning id into v_thread_id;
  return v_thread_id;
end;
$$;

-- Called from lib/roundEngine.js at the moment a player is actually
-- exiled — server-side (service-role), not as any particular player, so
-- this deliberately has NO caller-ownership check the way
-- create_chat_thread does. It's only ever invoked from trusted
-- server-side code, never exposed as something a client calls directly.
create or replace function public.add_to_exile_room(p_game_id uuid, p_player_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thread_id uuid;
begin
  v_thread_id := get_or_create_exile_room(p_game_id);
  insert into chat_thread_members (thread_id, player_id)
  values (v_thread_id, p_player_id)
  on conflict do nothing;
  return v_thread_id;
end;
$$;

-- ---------------- Unread tracking ----------------
-- One row per (thread, player) — updated whenever that player actually
-- has the thread open. Badging just compares each thread's latest
-- message timestamp against this.
create table if not exists chat_thread_reads (
  thread_id uuid references chat_threads(id) on delete cascade not null,
  player_id uuid references players(id) on delete cascade not null,
  last_read_at timestamptz not null default now(),
  primary key (thread_id, player_id)
);

alter table chat_thread_reads enable row level security;

create policy "manage own chat reads" on chat_thread_reads
for all
using (owns_player(player_id))
with check (owns_player(player_id));

alter publication supabase_realtime add table chat_threads;
alter publication supabase_realtime add table chat_thread_members;
-- chat_messages is NOT added here on purpose — it's the renamed
-- dm_messages table, and a rename preserves a table's publication
-- membership (Postgres tracks it by OID, not name), so it's already in
-- supabase_realtime from sql/add-dms.sql. Adding it again would error
-- ("relation is already member of publication") and, since Supabase's
-- SQL editor runs a pasted script as one transaction, roll back
-- everything else in this file along with it.
alter publication supabase_realtime add table chat_thread_reads;
