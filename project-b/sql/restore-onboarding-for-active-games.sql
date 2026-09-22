-- ============================================================
-- Migration: un-stick the onboarding checklist for anyone already
-- playing in a season that's already underway.
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
--
-- sql/apply-onboarding-to-active-games.sql reset these three flags back
-- to false for every player in every not-yet-finished game, so the
-- checklist would also reach players already mid-season. That's been
-- reconsidered again: the checklist is a brand-new-player walkthrough
-- and should only ever apply to a game that hasn't started yet (see
-- pages/play.jsx's own gameAlreadyStarted check at player-insert time,
-- which now handles this correctly for anyone joining going forward).
-- This migration is the one-time catch-up for players who are already
-- stuck under the old rule.
--
-- Sets all three flags back to true for every player in a standard
-- (non-Traitors, non-StereoTypes) game whose round has already moved
-- past PHASES.LOBBY — i.e. the host has already clicked "Start Round 1"
-- (see lib/gameState.js's startSeason). A game still sitting in Lobby
-- is left untouched, since that's exactly the "new game, not started
-- yet" case the checklist is still meant to cover. Traitors/StereoTypes
-- never gated on this at all (see pages/play.jsx), so they're
-- naturally excluded here too, since neither ever writes a 'pb:round'
-- row in the first place.
-- ============================================================

update players
set onboarding_chat_sent = true, onboarding_dm_sent = true, onboarding_profile_viewed = true
where game_id in (
  select gs.game_id
  from game_state gs
  where gs.key = 'pb:round'
    and coalesce(gs.value->>'phase', 'lobby') <> 'lobby'
)
and (onboarding_chat_sent = false or onboarding_dm_sent = false or onboarding_profile_viewed = false);
