-- ============================================================
-- Migration: player color assignment
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
-- Safe to run once on your existing project — additive only.
-- ============================================================

alter table players add column if not exists color text;
-- Nullable: a player who joined before this migration (or hasn't picked
-- yet) simply has no color until they choose one — see
-- components/ColorPicker.jsx and lib/playerColors.js. Uniqueness (no two
-- players in the same game sharing a color) is enforced in application
-- code at pick time, not by a DB constraint, since "unique per game" is a
-- composite condition across (game_id, color) rather than a simple column
-- constraint, and the existing "join a game as yourself" / "host manages
-- players" policies already cover who's allowed to write this column.
