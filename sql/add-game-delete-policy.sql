-- ============================================================
-- Migration: add missing delete policy on games
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
-- Safe to run once on your existing project — additive only.
--
-- Context: the games table had select/insert/update policies but no
-- delete policy at all. With RLS enabled and no delete policy, a
-- DELETE from a disallowed (or, in this case, any) caller matches
-- zero rows and returns no error from Supabase — it just silently
-- deletes nothing. That's what made pages/host.jsx's "Delete forever"
-- button look like it worked (the row vanished from local state) but
-- reappear after a refresh (it was never actually removed server-side).
--
-- Mirrors the existing update policy's scope (sql/add-game-hosts.sql):
-- the primary host or any co-host can delete the season.
-- ============================================================

create policy "host deletes their own game"
on games for delete
using (is_game_host(id));
