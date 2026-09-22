-- ============================================================
-- Migration: player aliases
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
--
-- Nullable, same pattern as color (sql/add-player-color.sql): a player
-- has no alias until they choose one, and "unique per game" is enforced
-- in application code (lib/aliases.js), not a DB constraint, for the
-- same reason color's isn't — it's a composite (game_id, alias)
-- condition, not a simple column constraint.
--
-- No new RLS policy needed: the existing "players set their own color"
-- policy (sql/add-player-color-policy.sql) only pins display_name,
-- approved, alive, and elimination_type to their previous values in its
-- WITH CHECK — everything else on a player's own row, color included,
-- is left open for them to change. That was written before this column
-- existed, but the same logic already covers it: a player can set their
-- own alias through that policy without any changes to it.
-- ============================================================

alter table players add column if not exists alias text;
