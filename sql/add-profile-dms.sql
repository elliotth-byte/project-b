-- ============================================================
-- Migration: cross-season DMs + reporting
-- Run this in Supabase SQL Editor, AFTER sql/add-profiles.sql and
-- sql/add-profiles-admin.sql.
--
-- The existing dm_threads/dm_messages (see sql/add-dms.sql) can't be
-- reused here — they're keyed to players.id, which only exists inside
-- one specific season, and their moderation policy is is_game_host(),
-- which has no meaning for a conversation that was never tied to any
-- one season's host in the first place. This is a parallel system,
-- not an extension: profile_dm_threads/profile_dm_messages, keyed by
-- auth.users.id on both sides, with is_platform_admin() taking the
-- read-for-moderation role a season's host plays in the original.
--
-- One thing done differently from the original design, having learned
-- from it: dm_threads' own unique constraint is order-sensitive
-- (game_id, player_a_id, player_b_id) — nothing at the database level
-- stops two rows existing for the same pair with the participants
-- swapped, only the application code choosing to always insert them
-- in a consistent order. Since this is a fresh design, the check
-- constraint below (participant_a < participant_b) makes a duplicate
-- thread between the same two people structurally impossible instead
-- of just a convention lib/profileDms.js has to remember to follow —
-- see that file's own comment on how it sorts the pair before every
-- lookup or insert to satisfy this.
-- ============================================================

create table if not exists profile_dm_threads (
  id uuid primary key default gen_random_uuid(),
  participant_a uuid references auth.users(id) on delete cascade not null,
  participant_b uuid references auth.users(id) on delete cascade not null,
  created_at timestamptz not null default now(),
  constraint profile_dm_threads_ordered check (participant_a < participant_b),
  unique (participant_a, participant_b)
);

create table if not exists profile_dm_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references profile_dm_threads(id) on delete cascade not null,
  sender_id uuid references auth.users(id) on delete cascade not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists profile_dm_messages_thread_idx on profile_dm_messages(thread_id, created_at);

alter table profile_dm_threads enable row level security;
alter table profile_dm_messages enable row level security;

create policy "read own cross-season dm threads"
on profile_dm_threads for select
using (participant_a = auth.uid() or participant_b = auth.uid() or is_platform_admin());

-- Matches "anyone can DM anyone" exactly as decided — no check here
-- that the two people have ever shared a season, or any other
-- relationship requirement. The only thing enforced is that the
-- caller is actually one of the two people the thread claims to be
-- between, not an arbitrary third party opening a thread for others.
create policy "create own cross-season dm threads"
on profile_dm_threads for insert
with check (participant_a = auth.uid() or participant_b = auth.uid());

create policy "read own cross-season dm messages"
on profile_dm_messages for select
using (
  exists (
    select 1 from profile_dm_threads t
    where t.id = profile_dm_messages.thread_id
    and (t.participant_a = auth.uid() or t.participant_b = auth.uid() or is_platform_admin())
  )
);

-- A platform admin can READ every cross-season DM (the policy above)
-- but never SEND as someone else — sender_id must be the caller's own
-- id, and that id has to actually be one of the thread's two
-- participants. Same shape as the original system's host-can-read-
-- never-send rule, just with is_platform_admin() standing in for
-- is_game_host().
create policy "send own cross-season dm messages"
on profile_dm_messages for insert
with check (
  sender_id = auth.uid()
  and exists (
    select 1 from profile_dm_threads t
    where t.id = profile_dm_messages.thread_id
    and (t.participant_a = auth.uid() or t.participant_b = auth.uid())
  )
);

alter publication supabase_realtime add table profile_dm_threads;
alter publication supabase_realtime add table profile_dm_messages;

-- Reports a specific message, not a whole thread or person — gives an
-- admin the exact content in question rather than a vague complaint
-- with no context. reviewed/reviewed_at let the admin queue (built in
-- lib/adminModeration.js) distinguish an open report from one already
-- handled, without ever deleting the report itself.
create table if not exists dm_reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references profile_dm_messages(id) on delete cascade not null,
  reporter_id uuid references auth.users(id) on delete cascade not null,
  reason text not null,
  created_at timestamptz not null default now(),
  reviewed boolean not null default false,
  reviewed_at timestamptz
);

alter table dm_reports enable row level security;

-- Deliberately no "read your own reports" policy — a report is a
-- message TO platform admins, not a record the reporter needs to look
-- back at inside the app. Keeps this table's read access to exactly
-- one policy, one purpose: the admin review queue below.
create policy "report a message you can actually see"
on dm_reports for insert
with check (
  reporter_id = auth.uid()
  and exists (
    select 1 from profile_dm_messages m
    join profile_dm_threads t on t.id = m.thread_id
    where m.id = dm_reports.message_id
    and (t.participant_a = auth.uid() or t.participant_b = auth.uid())
  )
);

create policy "platform admins review reports"
on dm_reports for select
using (is_platform_admin());

create policy "platform admins mark reports reviewed"
on dm_reports for update
using (is_platform_admin())
with check (is_platform_admin());

-- Lets a regular player find someone to DM in the first place — the
-- non-admin counterpart to admin_search_people (see
-- sql/add-profiles-admin.sql). No is_platform_admin() gate: this is
-- meant to be usable by anyone, matching the same openness "anyone can
-- DM anyone" already established. Excludes the caller's own
-- record (p_query matching your own name would just show yourself in
-- your own search results, which is never useful) and, unlike the
-- admin version, deliberately does NOT expose elimination_type/alive/
-- anything else about a season — a person searching for someone to
-- message has no business seeing that.
create or replace function public.search_people_to_dm(p_query text)
returns table (user_id uuid, matched_name text, profile_display_name text, photo_url text)
language sql
security definer
set search_path = public
stable
as $$
  select distinct on (pl.user_id)
    pl.user_id,
    pl.display_name as matched_name,
    prof.display_name as profile_display_name,
    prof.photo_url
  from players pl
  left join profiles prof on prof.user_id = pl.user_id
  where pl.display_name ilike '%' || p_query || '%' and pl.user_id != auth.uid()
  order by pl.user_id, pl.created_at desc
  limit 25;
$$;
