-- ============================================================
-- Migration: elimination_round
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
--
-- Previously only a normal vote-exile's round was ever recorded
-- anywhere (in the exile_history/challenge records, not on the player
-- row itself) — a player who quit, was host-removed, or was removed
-- for inactivity had no round recorded at all, so the voting sheet
-- could show WHEN a vote-exile happened but nothing for any other kind
-- of departure. This one column is set uniformly by every removal
-- path (lib/roundEngine.js's setPlayerAlive and
-- checkInstantInactivityRemoval, applyInactivityStrike's 3-strike
-- removal, lib/playerRemoval.js's quit/host-removal) and cleared back
-- to null on re-entry, so it's a single reliable source for "what
-- round did this player leave" regardless of how they left.
-- ============================================================

alter table players add column if not exists elimination_round integer;
