-- ============================================================
-- Migration: multi-host support (co-hosts per season)
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
-- Safe to run once on your existing project — additive only.
-- ============================================================

-- One row per (game, co-host). The season's original creator stays in
-- games.host_id as the "primary" host (can manage co-hosts, archive,
-- delete); everyone in this table gets full run-the-game access to that
-- one season (roster, challenges, Slack posting) but not those three
-- primary-only actions. A co-host must already be a "host"-role account
-- (see lib/auth.js signUpHost) — this table doesn't turn a player account
-- into a host, it just extends an existing host's reach to another game.
create table if not exists game_hosts (
  game_id uuid references games(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  added_at timestamptz not null default now(),
  primary key (game_id, user_id)
);

alter table game_hosts enable row level security;

-- is_game_host now means "primary host OR co-host" everywhere it's
-- already used (games/players/game_state policies all call this function),
-- so every existing policy picks up co-host access automatically — no
-- other policy in schema.sql needs to change.
create or replace function public.is_game_host(p_game_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from games where id = p_game_id and host_id = auth.uid())
      or exists (select 1 from game_hosts where game_id = p_game_id and user_id = auth.uid());
$$;

-- games' original select policy only let the primary host (host_id) or a
-- player read the row — a co-host is neither, so extend it.
drop policy if exists "read games you belong to" on games;
create policy "read games you belong to"
on games for select
using (host_id = auth.uid() or is_game_player(id) or is_game_host(id));

-- Same for updates (editing name/subtitle) — co-hosts can do this too.
drop policy if exists "host updates their own game" on games;
create policy "host updates their own game"
on games for update
using (is_game_host(id));

-- Any host (primary or co-) can see who else co-hosts this season.
create policy "hosts read co-host list"
on game_hosts for select
using (is_game_host(game_id));

-- Only the PRIMARY host (games.host_id) can add or remove co-hosts —
-- deliberately not is_game_host(), so a co-host can't add further
-- co-hosts or remove themselves/others.
create policy "primary host adds co-hosts"
on game_hosts for insert
with check (exists (select 1 from games where id = game_id and host_id = auth.uid()));

create policy "primary host removes co-hosts"
on game_hosts for delete
using (exists (select 1 from games where id = game_id and host_id = auth.uid()));

-- Invite by email — needed because clients can't query auth.users
-- directly. Returns a short status code the UI can show a message for:
-- 'ok' | 'not_found' | 'not_a_host' | 'already_host' | 'not_authorized'.
create or replace function public.invite_co_host(p_game_id uuid, p_email text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id uuid;
  target_role text;
begin
  if not exists (select 1 from games where id = p_game_id and host_id = auth.uid()) then
    return 'not_authorized';
  end if;

  select id, raw_user_meta_data->>'role' into target_id, target_role
  from auth.users where lower(email) = lower(trim(p_email));

  if target_id is null then
    return 'not_found';
  end if;
  if target_role is distinct from 'host' then
    return 'not_a_host';
  end if;
  if target_id = auth.uid() then
    return 'already_host';
  end if;

  insert into game_hosts (game_id, user_id) values (p_game_id, target_id)
  on conflict (game_id, user_id) do nothing;
  return 'ok';
end;
$$;

-- Lets the UI show co-hosts by email (game_hosts alone only has user_id).
create or replace function public.list_co_hosts(p_game_id uuid)
returns table (user_id uuid, email text, added_at timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select gh.user_id, u.email, gh.added_at
  from game_hosts gh
  join auth.users u on u.id = gh.user_id
  where gh.game_id = p_game_id and is_game_host(p_game_id);
$$;
