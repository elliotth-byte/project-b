-- ============================================================
-- Migration: fix the polarity of sql/hide-alias-until-season-ends.sql
-- for public_season_roster specifically
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
--
-- The previous migration hid the wrong field on the Season Roster
-- (pages/season.jsx). What that page actually needs is the OPPOSITE of
-- what it shipped with: while a season is still active, players
-- legitimately identify each other by ALIAS the entire time they're
-- playing (that's the whole point of the character system — every
-- other in-game surface already shows aliases, not real names, during
-- play). What needed hiding was never the alias — it was the mapping
-- from alias back to a real account, until the season's actually over.
--
-- Two changes, together:
--   display_name now returns the ALIAS while the season is active
--   (instead of the real name), and the real name only once a finale
--   is on record — the reverse of the previous migration's mapping.
--   user_id ALSO comes back null for a still-hidden identity, not just
--   the display text — pages/season.jsx links each roster row to
--   /profile?userId=<id>, and merely hiding the text in the UI while
--   still handing back the real user_id in the API response would
--   have let anyone determined enough to open dev tools follow that
--   id straight to the person's real profile. Nulling it here means
--   there's genuinely nothing to click through to, not just nothing
--   shown.
--
-- A player with NO alias at all (character powers off, or this game
-- type doesn't use them) has nothing to protect in the first place —
-- p.alias is null in that case, and both fields fall through to the
-- normal, always-visible real-name behavior regardless of season
-- state, same as the host row already does.
--
-- public_season_history (the OTHER function the previous migration
-- touched, backing pages/profile.jsx's own Season History list) is
-- UNCHANGED here — its existing behavior (hide the alias for an
-- ongoing OTHER season, once you're already looking at someone whose
-- real identity you know because you navigated to their profile) was
-- already correct and didn't have this same polarity problem.
--
-- No application code needs to change beyond pages/season.jsx's own
-- render logic for the Link/no-Link distinction — see that file's own
-- updated comment on user_id === null.
-- ============================================================

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
    case when p.alias is null or gs.value is not null then p.user_id else null end as user_id,
    case
      when p.alias is null or gs.value is not null then coalesce(prof.display_name, p.display_name)
      else p.alias
    end as display_name,
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
  -- by either migration — a host never has a character alias and was
  -- never hidden to begin with; there's nothing about "hosting" that
  -- needs to stay secret during a season the way playing under an
  -- alias does.
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
