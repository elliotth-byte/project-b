-- ============================================================
-- Migration: let a player quit their own game
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
--
-- The ONLY existing policy letting a player update their own `players`
-- row at all is "players set their own color" (see
-- sql/add-player-color-policy.sql), and its WITH CHECK explicitly
-- requires `alive` and `elimination_type` to stay UNCHANGED — written
-- that way on purpose, to stop a player from reviving themselves or
-- tampering with their own status. But lib/playerRemoval.js's
-- quitOrRemoveApprovedPlayer needs to change EXACTLY those two fields
-- (alive -> false, elimination_type -> 'quit') when a player quits
-- themselves — so that policy was blocking the one legitimate case that
-- needs to touch them. This was why quitting has been failing outright
-- with "new row violates row-level security policy for table players".
--
-- This adds a second, separate, narrowly-scoped policy rather than
-- loosening the existing one: a player may update their own row ONLY if
-- the result is exactly alive=false, elimination_type='quit', and
-- nothing else sensitive on the row changes. Multiple permissive
-- policies on the same command are OR'd together in Postgres, so this
-- and the existing color policy coexist fine — an update passes if
-- EITHER policy's WITH CHECK is satisfied, so a color change still only
-- needs the color policy, and a quit still only needs this one.
-- ============================================================

create policy "players quit their own game"
on players for update
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and alive = false
  and elimination_type = 'quit'
  and display_name = (select p2.display_name from players p2 where p2.id = players.id)
  and approved = (select p2.approved from players p2 where p2.id = players.id)
);
