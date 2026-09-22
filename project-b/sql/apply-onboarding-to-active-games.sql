-- ============================================================
-- Migration: apply the onboarding checklist to players already in an
-- ongoing season, not just players joining a season going forward
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
--
-- sql/add-onboarding-checklist.sql grandfathered every player who
-- already existed at the time it ran past all three checklist items,
-- on the reasoning that this should be a new-player walkthrough, not
-- something that retroactively locks someone out mid-season. That
-- default has been reconsidered: the requirement should also reach
-- players already in a season that's currently in progress.
--
-- Resets all three flags back to false, but ONLY for players in games
-- that haven't ended yet — same "does a pb:finale/traitors:finale row
-- exist for this game" signal used throughout
-- sql/add-season-placement.sql and lib/achievements/evaluate.js.
-- Players in a season that's already wrapped are left alone: there's
-- no Battle left for the requirement to gate for them, so resetting
-- their flags would do nothing but create a stale, meaningless
-- "incomplete" mark on a finished season's history.
-- ============================================================

update players
set onboarding_chat_sent = false, onboarding_dm_sent = false, onboarding_profile_viewed = false
where game_id in (
  select g.id
  from games g
  left join game_state gs on gs.game_id = g.id
    and gs.key = (case when g.game_type = 'traitors' then 'traitors:finale' else 'pb:finale' end)
  where gs.game_id is null
);
