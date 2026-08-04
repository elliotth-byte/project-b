-- ============================================================
-- Migration: player removal
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
--
-- schema.sql never added a DELETE policy on `players` at all — with RLS
-- enabled, no policy for a given command means that command is denied
-- for EVERYONE, including the host, even though components/AdminHost.jsx
-- already had a "Remove" button (for players still pending approval)
-- that calls `.delete()`. That delete has always silently failed against
-- Postgres, which is why removing a pending player never actually worked.
--
-- This adds the missing policy, covering both directions:
--   - the host removing anyone in their own game (pending or approved)
--   - a player removing their own row (self-serve "quit"/"cancel join")
-- ============================================================

create policy "host or player removes player"
on players for delete
using (is_game_host(game_id) or user_id = auth.uid());
