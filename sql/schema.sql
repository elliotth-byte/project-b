-- ============================================================
-- Project B — core schema
-- Run this whole file once in Supabase: Dashboard → SQL Editor → New query → paste → Run
-- ============================================================

-- One row per game (a single "season" / play session)
create table if not exists games (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Project B',
  host_id uuid references auth.users(id) not null,
  created_at timestamptz default now()
);

-- One row per player, tied to a specific game
create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references games(id) on delete cascade not null,
  user_id uuid references auth.users(id) not null,
  display_name text not null,
  alive boolean not null default true,
  created_at timestamptz default now(),
  unique (game_id, user_id)
);

-- The generic key/value store. This is the direct replacement for
-- window.storage.get/set/delete/update from the original artifact.
-- "version" is what lets us do a safe, atomic update instead of the
-- artifact's write-a-stamp-and-hope-nobody-else-wrote race-avoidance hack.
create table if not exists game_state (
  game_id uuid references games(id) on delete cascade not null,
  key text not null,
  value jsonb not null,
  version bigint not null default 1,
  updated_at timestamptz not null default now(),
  primary key (game_id, key)
);

-- Turn on Realtime so subscribers get pushed updates instead of polling.
-- (Safe to re-run; Supabase will just no-op if it's already added.)
alter publication supabase_realtime add table game_state;

-- ============================================================
-- Row Level Security
-- ============================================================
alter table games enable row level security;
alter table players enable row level security;
alter table game_state enable row level security;

-- Helper functions that check game membership WITHOUT triggering a policy
-- loop. The naive version (games checks players, players checks games)
-- causes Postgres to report "infinite recursion detected in policy" as a
-- 500 error the moment either table is queried. SECURITY DEFINER lets these
-- run with the function owner's privileges, answering the membership
-- question directly instead of re-triggering the surrounding policy.
create or replace function public.is_game_host(p_game_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from games where id = p_game_id and host_id = auth.uid());
$$;

create or replace function public.is_game_player(p_game_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from players where game_id = p_game_id and user_id = auth.uid());
$$;

-- Anyone signed in can see games they host or are a player in.
create policy "read games you belong to"
on games for select
using (host_id = auth.uid() or is_game_player(id));

-- Only a signed-in user can create a game, and only as themselves as host.
create policy "create your own game"
on games for insert
with check (host_id = auth.uid());

-- Players can see other players in the same game as them (needed for rosters/leaderboards).
create policy "read players in your game"
on players for select
using (is_game_host(game_id) or is_game_player(game_id));

-- A signed-in user can add themselves as a player to a game (self-serve "join").
create policy "join a game as yourself"
on players for insert
with check (user_id = auth.uid());

-- The host can update player rows in their own game (e.g. mark eliminated/banished).
create policy "host manages players"
on players for update
using (is_game_host(game_id));

-- Anyone in the game (host or player) can read the shared game state.
create policy "read game state in your game"
on game_state for select
using (is_game_host(game_id) or is_game_player(game_id));

-- Anyone in the game can write game state (players need to write their own
-- progress/times/votes; tighten this per-key later if you want stricter control).
create policy "write game state in your game"
on game_state for insert
with check (is_game_host(game_id) or is_game_player(game_id));

create policy "update game state in your game"
on game_state for update
using (is_game_host(game_id) or is_game_player(game_id));

create policy "delete game state in your game"
on game_state for delete
using (is_game_host(game_id));
