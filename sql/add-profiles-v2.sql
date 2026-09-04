-- ============================================================
-- Migration: profile system v2 — quotes, host status, season
-- browsing, and a from-scratch season history rewrite.
-- Run this in Supabase SQL Editor, AFTER sql/add-profiles.sql,
-- sql/add-profiles-admin.sql, and sql/add-profile-dms.sql.
--
-- Rewrites public_season_history from scratch rather than patching it
-- — a real report came in that a non-finalist's season wasn't showing
-- up in their own history at all, and close reading of the original
-- version didn't turn up an obvious cause. Since this needed a
-- substantial rewrite anyway (to union in hosted seasons, which the
-- original never touched at all — it only ever queried players, so an
-- account that hosted a season without ever joining as a player had
-- zero rows for it, which is likely what "not listed" actually meant
-- half the time), doing that rewrite carefully is what actually
-- resolves this, rather than a targeted one-line fix to code whose
-- exact fault couldn't be pinned down with certainty.
--
-- ⚠ IF YOU'RE RUNNING THIS ON A PROJECT THAT ALREADY HAS
-- sql/add-season-placement.sql APPLIED (which itself already replaces
-- both public_season_history and public_season_roster with a newer,
-- wider shape — elimination_order/total_players added on top of
-- everything below, plus sql/exclude-stereo-types-from-history.sql on
-- top of THAT for public_season_history specifically): the two
-- `create or replace function` blocks below for public_season_history
-- and public_season_roster will fail with "cannot change return type
-- of existing function" (42P13), because your database's copies
-- already have a different, newer column list than what's defined
-- here, and `create or replace` can't reconcile that (only DROP +
-- CREATE can, which would be a genuine regression here — it'd throw
-- away the elimination_order/total_players columns your app already
-- depends on). This migration predates that one; its own versions of
-- those two functions are simply obsolete by now.
--
-- If that's your situation, don't run this whole file — just run the
-- two statements that are STILL new relative to everything else in
-- this repo's sql/ folder and don't conflict with anything later:
--
--   alter table profiles add column if not exists quote text;
--
--   create or replace function public.search_seasons(p_query text)
--   returns table (game_id uuid, season_name text, season_date timestamptz, player_count bigint)
--   language sql security definer set search_path = public stable as $$
--     select g.id as game_id, g.name as season_name, g.created_at as season_date,
--       (select count(*) from players p where p.game_id = g.id and p.approved = true) as player_count
--     from games g where g.name ilike '%' || p_query || '%'
--     order by g.created_at desc limit 25;
--   $$;
--
-- (search_seasons is untouched by any later migration, so it's always
-- safe to run as-is regardless of where the rest of your database's
-- schema history stands.)
-- ============================================================

alter table profiles add column if not exists quote text;

-- create or replace can't change a function's return columns (only
-- create or replace is normally needed for a body-only change) — this
-- one adds is_host on top of the original 9 columns, so Postgres
-- requires the old version dropped first rather than replaced in place.
--
-- ⚠ Getting a 42P13 here (or on public_season_roster further down)
-- anyway? Your database already has sql/add-season-placement.sql's
-- newer versions of these two functions — see this file's own header
-- comment for what to run instead of this whole file.
drop function if exists public.public_season_history(uuid);

create or replace function public.public_season_history(p_user_id uuid)
returns table (
  game_id uuid,
  season_name text,
  season_date timestamptz,
  character_name text,
  real_name text,
  won boolean,
  reached_finale boolean,
  alive boolean,
  elimination_type text,
  elimination_round integer,
  is_host boolean
)
language sql
security definer
set search_path = public
stable
as $$
  -- Seasons played, exactly as before, with is_host always false.
  select
    p.game_id,
    g.name as season_name,
    g.created_at as season_date,
    p.alias as character_name,
    p.display_name as real_name,
    coalesce((gs.value ->> 'winnerId') = p.id::text, false) as won,
    (gs.value is not null) as reached_finale,
    p.alive,
    p.elimination_type,
    p.elimination_round,
    false as is_host
  from players p
  join games g on g.id = p.game_id
  left join game_state gs on gs.game_id = p.game_id and gs.key = 'pb:finale'
  where p.user_id = p_user_id and p.approved = true

  union all

  -- Seasons hosted — this account never has a players row for these at
  -- all if they didn't ALSO join as a player, so this was previously
  -- invisible here no matter what. No character/placement makes sense
  -- for a host (they're not competing), so those columns are simply
  -- null rather than a placeholder value pretending otherwise.
  select
    g.id as game_id,
    g.name as season_name,
    g.created_at as season_date,
    null as character_name,
    null as real_name,
    false as won,
    false as reached_finale,
    null as alive,
    null as elimination_type,
    null as elimination_round,
    true as is_host
  from games g
  where g.host_id = p_user_id

  order by season_date desc;
$$;

-- Lets anyone find a season by name to browse its roster, the same
-- openness already established for finding a person (search_people_to_dm)
-- — games' own RLS (sql/schema.sql) only lets you read a season you
-- actually host or played in, which would make browsing someone else's
-- season history impossible to follow through on otherwise.
create or replace function public.search_seasons(p_query text)
returns table (game_id uuid, season_name text, season_date timestamptz, player_count bigint)
language sql
security definer
set search_path = public
stable
as $$
  select g.id as game_id, g.name as season_name, g.created_at as season_date,
    (select count(*) from players p where p.game_id = g.id and p.approved = true) as player_count
  from games g
  where g.name ilike '%' || p_query || '%'
  order by g.created_at desc
  limit 25;
$$;

-- The other half of "click a season, see who was in it" — every
-- approved player in that season, plus the host themselves (who may or
-- may not also be a player). Same security-definer exception as
-- search_seasons, for the same reason: this needs to work for someone
-- who never played in or hosted the season being looked up.
--
-- No `drop function` guard here the way public_season_history above
-- has one — fine on a fresh install (this is the very first thing that
-- ever defines public_season_roster, so `create or replace` behaves as
-- a plain `create`), but see this file's own header comment if you're
-- hitting 42P13 here: it means sql/add-season-placement.sql's own
-- later, wider version is already installed, and this file's version
-- is the one that's obsolete now, not the other way around.
create or replace function public.public_season_roster(p_game_id uuid)
returns table (
  user_id uuid,
  display_name text,
  character_name text,
  won boolean,
  reached_finale boolean,
  alive boolean,
  elimination_type text,
  elimination_round integer,
  is_host boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select
    p.user_id,
    coalesce(prof.display_name, p.display_name) as display_name,
    p.alias as character_name,
    coalesce((gs.value ->> 'winnerId') = p.id::text, false) as won,
    (gs.value is not null) as reached_finale,
    p.alive,
    p.elimination_type,
    p.elimination_round,
    false as is_host
  from players p
  left join profiles prof on prof.user_id = p.user_id
  left join game_state gs on gs.game_id = p.game_id and gs.key = 'pb:finale'
  where p.game_id = p_game_id and p.approved = true

  union all

  -- The host, once, EVEN IF they're also a player in this same season
  -- (both rows are legitimate — hosting and playing are different
  -- roles) — deliberately not deduplicated against the players query
  -- above, since collapsing them would hide one of the two true things
  -- about that person's involvement in this specific season.
  select
    g.host_id as user_id,
    coalesce(prof.display_name, 'Host') as display_name,
    null as character_name,
    false as won,
    false as reached_finale,
    null as alive,
    null as elimination_type,
    null as elimination_round,
    true as is_host
  from games g
  left join profiles prof on prof.user_id = g.host_id
  where g.id = p_game_id;
$$;
