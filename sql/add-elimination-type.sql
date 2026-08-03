-- ============================================================
-- Migration: elimination type tracking
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
-- Adds one column; no RLS changes needed — the existing "host manages
-- players" UPDATE policy already covers any column, this one included.
-- ============================================================

alter table players add column if not exists elimination_type text;
-- Expected values in Project B: 'exiled' | null.
--   null      = alive and currently in the game, OR returned from exile.
--   'exiled'  = voted out at an Exile Vote. They still get exactly one
--               re-entry attempt (see lib/reentryLogic.js) — a player
--               with elimination_type = 'exiled' and alive = false may
--               still come back. Once they use (and lose) that attempt,
--               they stay alive = false / elimination_type = 'exiled'
--               forever; lib/gameState.js's pb:reentry list is what
--               actually tracks whether their one shot is still pending.
