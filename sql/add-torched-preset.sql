-- ============================================================
-- Migration: Torched preset placement
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
--
-- torched_preset: a player's own saved starting-cell preference for
-- Torched, settable any time (not just while a Torched battle is
-- actually running — see the Help tab) so placement doesn't bottleneck
-- the start of a battle waiting on everyone to show up and manually
-- place. Stored as FRACTIONS (0 to 1), not raw row/col numbers, because
-- Torched's grid size varies with participant count (see
-- lib/games/torchedData.js's gridSizeFor) — a fraction scales cleanly
-- to whatever grid size a future battle actually ends up using, where a
-- raw coordinate set for one grid size could easily fall out of bounds
-- on a different one.
-- ============================================================

alter table players add column if not exists torched_preset jsonb;
