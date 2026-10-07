-- ============================================================
-- One-time grandfather for the Traitors Oath gate (see
-- components/TraitorsOathGate.jsx, pages/play.jsx's needsTraitorsOath).
-- Run this ONCE in Supabase SQL Editor, right after deploying the fix
-- that drops the oath gate's dependency on `approved`.
--
-- Why that dependency had to go: the gate used to require
-- `!myPlayer.approved`, on the theory that an approved player must
-- already be safely past it. In practice this let approval and signing
-- race each other — if a host approved a pending player (a single,
-- very fast click) before that player's own screen got through the
-- oath gate, `approved` flipped to true first and the oath requirement
-- just evaporated, so "won't enter the game until they sign" didn't
-- actually hold. The gate now blocks any player who hasn't signed,
-- full stop, regardless of approval state.
--
-- Without this backfill, that change would also newly trap every
-- already-approved player in a live season who joined before the oath
-- existed at all. This stamps them as already signed, exactly once, so
-- they're never asked retroactively — same reasoning
-- sql/apply-onboarding-to-active-games.sql used for the onboarding
-- checklist, just grandfathering players IN instead of resetting them.
-- ============================================================

update players
set game_prefs = coalesce(game_prefs, '{}'::jsonb) || '{"oathSigned": true}'::jsonb
where approved = true
  and game_id in (select id from games where game_type = 'traitors')
  and coalesce((game_prefs->>'oathSigned')::boolean, false) = false;
