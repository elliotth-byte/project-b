-- ============================================================
-- Migration: exclude Stereo Types from season history / relationship web
-- Run this in Supabase SQL Editor, AFTER sql/add-stereo-types-game-type.sql
-- and sql/add-season-placement.sql.
--
-- Stereo Types is deliberately NOT reflected on a player's profile
-- history tab, nor in the relationship web (pages/profile.jsx,
-- lib/relationshipWeb.js) — it's a lighter party game, not a season in
-- the same sense the other two are, and its rounds don't produce the
-- kind of placement/elimination/vote data those features are built
-- around anyway.
--
-- public_season_history is the single source both features are built
-- on: pages/profile.jsx's own "Season History" card calls it directly,
-- and lib/relationshipWeb.js's ring-building starts from its own call
-- to fetchSeasonHistory before it ever looks up a roster for any
-- specific game — so excluding stereo_types games HERE, at the root,
-- is suffient to keep them out of both features; neither
-- public_season_roster nor anything downstream needs its own separate
-- filter, since they're only ever reached for a game_id this function
-- already decided to surface.
--
-- (Same reasoning applies to the relationship-web-specific functions on
-- the still-unmerged feature/relationship-web branch,
-- public_relationship_adversaries and public_most_recent_avatars —
-- once that branch lands, they're each worth a look to confirm they
-- don't independently surface a stereo_types game some other way; this
-- migration only touches what already exists on main.)
--
-- create or replace is fine here (no drop needed) — the return table
-- shape is identical to sql/add-season-placement.sql's own version,
-- this only narrows the WHERE clauses of both halves of the union.
-- ============================================================

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
  -- Seasons played — same as before, just excluding stereo_types.
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
    and g.game_type != 'stereo_types'

  union all

  -- Seasons hosted — same as before, just excluding stereo_types.
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
    and g.game_type != 'stereo_types'

  order by season_date desc;
$$;
