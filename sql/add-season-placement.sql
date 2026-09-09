-- ============================================================
-- Migration: season-wide elimination order + placement, for both
-- game types.
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
-- Run AFTER sql/add-game-type.sql and sql/add-traitors-tables.sql.
--
-- elimination_order is a single, shared "how many people finished
-- behind you" counter — one flat pool per game_id, assigned as
-- (current max + 1) the moment a player leaves, regardless of WHICH
-- exit path did it (Project B's Exile Vote or inactivity removal,
-- Traitors' murder or banish, or either game type's own quit/host-
-- removal — see lib/seasonPlacement.js, the one shared place that
-- assigns it). A still-alive winner or non-winning finalist never gets
-- one at all — see placementFor() in lib/profiles.js for how null vs.
-- a real number is read.
--
-- Not folded into elimination_round: Project B's own round number
-- isn't fine-grained enough on its own (a double elimination can put
-- two people out in the same round) and Traitors never had a
-- round-scoped elimination concept for this at all (murder/banish
-- aren't tied to a "round" the way Project B's Exile is) — a single
-- monotonic counter is the one scheme that works identically for both.
-- ============================================================

alter table players add column if not exists elimination_order integer;

-- ============================================================
-- Traitors' own "who won" marker, parallel to Project B's pb:finale
-- game_state key (see lib/gameState.js's KEY_FINALE) but written by a
-- single host click (see TraitorsAdminHost.jsx's "Declare Winner"
-- card) rather than a jury vote — Traitors never had a finale/jury
-- mechanic at all, and building one is well beyond what this migration
-- is for. Shape: { winnerId, winnerName, finalistIds, finalistNames,
-- declaredAt }. No schema change needed for this part — game_state is
-- already a generic key/value table (sql/schema.sql) — noted here only
-- because public_season_history/public_season_roster below now read
-- this same key by name.
-- ============================================================

-- create or replace can't change a function's return columns — same
-- constraint sql/add-profiles-v2.sql hit adding is_host, so the old
-- versions are dropped first rather than replaced in place.
drop function if exists public.public_season_history(uuid);
drop function if exists public.public_season_roster(uuid);

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
  elimination_order integer,
  total_players integer,
  is_host boolean
)
language sql
security definer
set search_path = public
stable
as $$
  -- Seasons played, exactly as before, with is_host always false.
  -- The finale game_state key differs by game type (Project B's own
  -- jury-vote finale vs. Traitors' single-click winner declaration —
  -- see this file's own header comment) but both store `winnerId` at
  -- the top level, so the "did I win" check below reads identically
  -- either way once the right key's picked.
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
    p.elimination_order,
    (select count(*)::integer from players p2 where p2.game_id = p.game_id and p2.approved = true) as total_players,
    false as is_host
  from players p
  join games g on g.id = p.game_id
  left join game_state gs on gs.game_id = p.game_id
    and gs.key = (case when g.game_type = 'traitors' then 'traitors:finale' else 'pb:finale' end)
  where p.user_id = p_user_id and p.approved = true

  union all

  -- Seasons hosted — no character/placement makes sense for a host
  -- (they're not competing), so those columns are simply null rather
  -- than a placeholder value pretending otherwise.
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
    null as elimination_order,
    null as total_players,
    true as is_host
  from games g
  where g.host_id = p_user_id

  order by season_date desc;
$$;

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
  elimination_order integer,
  total_players integer,
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
    p.elimination_order,
    (select count(*)::integer from players p2 where p2.game_id = p.game_id and p2.approved = true) as total_players,
    false as is_host
  from players p
  left join profiles prof on prof.user_id = p.user_id
  join games g on g.id = p.game_id
  left join game_state gs on gs.game_id = p.game_id
    and gs.key = (case when g.game_type = 'traitors' then 'traitors:finale' else 'pb:finale' end)
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
    null as elimination_order,
    null as total_players,
    true as is_host
  from games g
  left join profiles prof on prof.user_id = g.host_id
  where g.id = p_game_id;
$$;
