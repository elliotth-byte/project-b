-- ============================================================
-- Migration: let a player set their OWN color
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
--
-- The only existing UPDATE policy on `players` ("host manages players")
-- is host-only — there was never a policy letting a player update their
-- own row at all, which is what components/ColorPicker.jsx needs to do.
-- This adds one, but keeps it narrow on purpose: the WITH CHECK below
-- re-reads every OTHER tracked column from the row's current stored
-- value and requires it to stay exactly the same, so a player can only
-- ever change `color` on their own row — not self-approve, revive
-- themselves, or rename themselves by crafting their own request.
-- ============================================================

create policy "players set their own color"
on players for update
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and display_name = (select p2.display_name from players p2 where p2.id = players.id)
  and approved = (select p2.approved from players p2 where p2.id = players.id)
  and alive = (select p2.alive from players p2 where p2.id = players.id)
  and elimination_type is not distinct from (select p2.elimination_type from players p2 where p2.id = players.id)
);
