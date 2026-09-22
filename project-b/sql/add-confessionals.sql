-- ============================================================
-- Migration: player confessionals
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
--
-- WHY THIS IS ITS OWN TABLE WITH ITS OWN RLS SHAPE:
-- Confessionals need a THIRD access pattern this project hasn't needed
-- before. Traitor Roles' host_state is host-only, full stop. Everything
-- else in game_state is readable by every player in the game. Confessionals
-- are neither: the host should read everyone's, each player should be able
-- to read back their OWN past confessionals, but no player should ever be
-- able to read anyone else's. That needs a dedicated table with a policy
-- that checks "do you own this specific row," not just "are you in this game."
-- ============================================================

create table if not exists confessionals (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references games(id) on delete cascade not null,
  player_id uuid references players(id) on delete cascade not null,
  player_name text not null,
  round int,
  text text not null,
  tags jsonb not null default '[]'::jsonb,
  prompt_id uuid,
  created_at timestamptz not null default now(),
  read_by_host boolean not null default false,
  starred boolean not null default false,
  archived boolean not null default false
);

alter table confessionals enable row level security;
alter publication supabase_realtime add table confessionals;

-- "Do I own this player_id?" — i.e. is the row's player_id linked to a
-- players row whose user_id is me. SECURITY DEFINER so it can check that
-- without needing its own separate RLS grant to read the players table.
create or replace function public.owns_player(p_player_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from players where id = p_player_id and user_id = auth.uid());
$$;

create policy "host reads all confessionals"
on confessionals for select
using (is_game_host(game_id));

create policy "player reads own confessionals"
on confessionals for select
using (owns_player(player_id));

create policy "player inserts own confessional"
on confessionals for insert
with check (owns_player(player_id));

-- Read/star/archive are host actions only — players don't edit a
-- confessional after submitting it.
create policy "host updates confessionals"
on confessionals for update
using (is_game_host(game_id));
