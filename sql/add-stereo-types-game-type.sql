-- ============================================================
-- Migration: add 'stereo_types' as a third game_type
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
-- Safe to run once on your existing project — additive only.
--
-- Third game pillar alongside Project B (Panopticon) and Traitors — a
-- superlative-guessing party game, "Stereo Types." See sql/add-game-
-- type.sql for the original two-value constraint and its own reasoning;
-- this just widens the same check constraint rather than replacing the
-- whole migration. A check constraint can't be altered in place, so
-- this drops and recreates it — safe, since dropping a CHECK constraint
-- doesn't touch any existing row's actual data, and every existing row
-- already satisfies the new (wider) constraint since it's a superset of
-- the old one.
-- ============================================================

alter table games drop constraint if exists games_game_type_check;

alter table games add constraint games_game_type_check
  check (game_type in ('project_b', 'traitors', 'stereo_types'));

-- Stereo Types deliberately does NOT get its own version of
-- sql/add-traitors-tables.sql's dedicated tables yet — this migration
-- is just the schema-level "this game_type is now legal" switch; the
-- actual game_state-backed round data (superlatives, rankings, bids,
-- boombox colors/stickers) lands in later migrations as each round
-- gets built, same incremental order Traitors itself followed.

-- Season history and the relationship web are both explicit, this-game-
-- only features — Stereo Types is deliberately excluded from both (see
-- pages/profile.jsx's own history and the relationship-web functions),
-- so no roster/history function here needs a game_type filter added:
-- those already start from "which seasons is this person actually in,"
-- and a Stereo Types season simply never becomes one of the rows they
-- aggregate over once the exclusion filter lands in the next migration.
