-- ============================================================
-- Migration: Traitors-only tables (player roles, host secrets, murder vote,
-- scheduled Slack posts)
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
-- Safe to run once on your existing project — additive only.
-- Run AFTER sql/add-game-type.sql.
--
-- Ported from the standalone "Traitors" app being folded into this one
-- (see sql/add-game-type.sql for why). These tables are only ever written
-- to by games where game_type = 'traitors' — nothing enforces that at the
-- database level (same reasoning as game_type itself: the app layer is
-- the practical place for it), a Project B season just never touches them.
--
-- Ported as the FINAL state of what was originally two sequential
-- migrations in the source app (an initial "any Traitor shares one vote"
-- version, then a fix scoping votes to the player's own faction) — no
-- reason to replay the superseded intermediate state here.
--
-- NOT ported: a separate confessionals table. This app's own
-- sql/add-confessionals.sql already created a `confessionals` table with
-- the exact same schema and RLS shape (same owns_player() helper, even) —
-- it was forked from the same original code. Traitors seasons write into
-- that existing table directly, scoped by game_id like everything else;
-- a second, redundant table would just be duplication.
-- ============================================================

-- One row per player, one role each — Faithful, or one of two Traitor
-- factions. Mirrors the roles already tracked in host_state's private
-- JSON blob (below); this is what lets a player's OWN client know their
-- own role without the host's private bookkeeping ever being exposed.
create table if not exists player_roles (
  game_id uuid references games(id) on delete cascade not null,
  player_id uuid references players(id) on delete cascade not null,
  role text not null default 'faithful',
  updated_at timestamptz not null default now(),
  primary key (game_id, player_id)
);

alter table player_roles enable row level security;
alter publication supabase_realtime add table player_roles;

create policy "host reads player_roles"
on player_roles for select
using (is_game_host(game_id));

create policy "player reads own role"
on player_roles for select
using (owns_player(player_id));

create policy "host writes player_roles"
on player_roles for insert
with check (is_game_host(game_id));

create policy "host updates player_roles"
on player_roles for update
using (is_game_host(game_id));

create policy "host deletes player_roles"
on player_roles for delete
using (is_game_host(game_id));

-- Is the CURRENTLY AUTHENTICATED USER a living Traitor in this game,
-- right now? Checked live against player_roles + players every time —
-- never a static snapshot, so a recruit or a merge takes effect
-- immediately, and a murdered/banished former Traitor loses access the
-- instant they're marked not alive.
create or replace function public.is_traitor_player(p_game_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from player_roles pr
    join players p on p.id = pr.player_id
    where pr.game_id = p_game_id
      and p.user_id = auth.uid()
      and p.alive = true
      and pr.role in ('traitor-red', 'traitor-black')
  );
$$;

-- Returns the CURRENT authenticated user's own Traitor faction in this
-- game (e.g. 'traitor-red'), or null if they're not a living Traitor.
create or replace function public.my_traitor_faction(p_game_id uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select pr.role from player_roles pr
  join players p on p.id = pr.player_id
  where pr.game_id = p_game_id
    and p.user_id = auth.uid()
    and p.alive = true
    and pr.role in ('traitor-red', 'traitor-black')
  limit 1;
$$;

-- Host-only private bookkeeping (who's a Traitor before it's revealed,
-- shields, etc.) — same generic key/value shape as game_state, but with
-- RLS that never checks is_game_player(): only the host can read or write
-- it, full stop.
create table if not exists host_state (
  game_id uuid references games(id) on delete cascade not null,
  key text not null,
  value jsonb not null,
  version bigint not null default 1,
  updated_at timestamptz not null default now(),
  primary key (game_id, key)
);

alter table host_state enable row level security;

-- Safe to include in realtime: Supabase enforces RLS on realtime changes
-- too, so this still never reaches anyone but the host.
alter publication supabase_realtime add table host_state;

create policy "host reads own host_state"
on host_state for select
using (is_game_host(game_id));

create policy "host writes own host_state"
on host_state for insert
with check (is_game_host(game_id));

create policy "host updates own host_state"
on host_state for update
using (is_game_host(game_id));

create policy "host deletes own host_state"
on host_state for delete
using (is_game_host(game_id));

-- The murder vote itself. Same generic key/value shape again, but a
-- THIRD RLS shape: readable/writable by the host, or by a Traitor — but
-- only for the key tagged with THEIR OWN faction (e.g.
-- 'murder-vote:traitor-red'). A Red Traitor's RLS never matches the
-- Black-tagged row at all, not just hidden in the UI — each faction has
-- its own private vote, and never sees the other's.
create table if not exists traitor_state (
  game_id uuid references games(id) on delete cascade not null,
  key text not null,
  value jsonb not null,
  version bigint not null default 1,
  updated_at timestamptz not null default now(),
  primary key (game_id, key)
);

alter table traitor_state enable row level security;
alter publication supabase_realtime add table traitor_state;

create policy "host reads traitor_state"
on traitor_state for select
using (is_game_host(game_id));

create policy "host writes traitor_state"
on traitor_state for insert
with check (is_game_host(game_id));

create policy "host updates traitor_state"
on traitor_state for update
using (is_game_host(game_id));

create policy "host deletes traitor_state"
on traitor_state for delete
using (is_game_host(game_id));

create policy "traitors read own faction's traitor_state"
on traitor_state for select
using (key = 'murder-vote:' || my_traitor_faction(game_id));

create policy "traitors write own faction's traitor_state"
on traitor_state for insert
with check (key = 'murder-vote:' || my_traitor_faction(game_id));

create policy "traitors update own faction's traitor_state"
on traitor_state for update
using (key = 'murder-vote:' || my_traitor_faction(game_id));

-- ============================================================
-- Scheduled Slack posts (Traitors' self-contained Slack integration —
-- see lib/slackClient.js, lib/slackScheduling.js, pages/api/post-to-slack.js,
-- pages/api/cron/post-scheduled.js).
-- ============================================================
create table if not exists scheduled_slack_posts (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references games(id) on delete cascade not null,
  text text not null,
  post_at timestamptz not null,
  posted_at timestamptz,
  cancelled boolean not null default false,
  error text,
  created_by uuid references auth.users(id) not null,
  created_at timestamptz not null default now()
);

alter table scheduled_slack_posts enable row level security;

-- Any host or co-host of the game can create/view/cancel its scheduled
-- posts. The cron job itself uses the service-role key and bypasses RLS
-- entirely, so this policy is purely for the host-facing UI.
create policy "hosts manage their scheduled posts"
on scheduled_slack_posts for all
using (is_game_host(game_id))
with check (is_game_host(game_id) and created_by = auth.uid());
