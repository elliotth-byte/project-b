-- ============================================================
-- Migration: player game preferences
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
--
-- One JSONB column rather than separate booleans-per-preference — same
-- reasoning as gameConfig elsewhere in this app: new preferences can be
-- added later (lib/gamePrefs.js) without another migration.
-- ============================================================

alter table players add column if not exists game_prefs jsonb not null default '{}'::jsonb;

-- No new RLS policy needed: the existing "players set their own color"
-- policy (sql/add-player-color-policy.sql) only pins display_name/
-- approved/alive/elimination_type to their previous values, leaving
-- every other column on a player's own row — color, alias, avatar_url,
-- and now game_prefs — open for them to set themselves, the same way
-- those additions worked without a new policy either.
