-- ============================================================
-- Migration: hide character aliases until the season has actually
-- ended
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
--
-- Two functions had this same leak — both were returning a player's
-- real display_name right next to their character alias (p.alias)
-- unconditionally, including for a season that's still actively being
-- played:
--   public_season_roster (pages/season.jsx) — anyone signed in can
--   view this for any game (it's a security-definer function
--   specifically so profile browsing works across seasons you weren't
--   part of), so any player, or anyone with the link, could see
--   exactly who's playing which god mid-season, not just after it
--   wrapped.
--   public_season_history (pages/profile.jsx's own Season History
--   list) — the same leak, just reached by viewing another player's
--   profile instead: if you and someone else are both in the same
--   still-active season, their profile's history list would already
--   show their alias for it.
--
-- Both fixes reuse the SAME signal each function already computes for
-- reached_finale (gs.value is not null, i.e. a pb:finale/traitors:finale
-- row exists for this game) rather than adding a new column or check:
-- no finale recorded yet means the season is still live, so
-- character_name comes back null instead. This is a database-level
-- fix, not just hiding it in the UI, specifically so it can't be seen
-- by inspecting the network response either.
--
-- No application code needs to change: both pages/season.jsx and
-- pages/profile.jsx already render the character suffix conditionally
-- ({p.character && ...} / {s.character ? ... : "Played"}), so a null
-- character_name here just makes that text not show, the same as it
-- already does for a host (who has no alias in the first place).
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
    case when gs.value is not null then p.alias else null end as character_name,
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
    case when gs.value is not null then p.alias else null end as character_name,
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
  -- about that person's involvement in this specific season. Unchanged
  -- by this migration — a host never has a character alias to begin
  -- with, character_name was already null here.
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
