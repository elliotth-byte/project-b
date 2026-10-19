-- ============================================================
-- Migration: Secret Deal or No Deal for the Traitor factions
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
-- Safe to run once — additive only. Run AFTER sql/add-traitors-tables.sql
-- and sql/add-confessionals.sql (it reuses my_traitor_faction() and
-- owns_player() from those).
--
-- The game lives in traitor_state under one key per faction:
--   'dond:traitor-red' and 'dond:traitor-black'
-- (see lib/traitorDondData.js). The host creates and deletes those rows
-- through the existing host policies on traitor_state. These policies add
-- exactly two things for players:
--
-- 1. READ: a living Traitor can read only their OWN faction's row. A
--    Faithful matches nothing (my_traitor_faction() is null for them), and
--    a Red Traitor never matches the Black row or vice versa, so the
--    other faction's player name is never sent to them. Realtime respects
--    the same RLS, so nothing leaks over the live channel either.
--
-- 2. WRITE: only the ONE player the host picked for that faction (the
--    row's playerId) can update it. Their faction-mates can watch, but
--    the database refuses any move from them. Nobody but the host can
--    insert or delete these rows.
-- ============================================================

create policy "traitors read own faction's deal or no deal"
on traitor_state for select
using (key = 'dond:' || my_traitor_faction(game_id));

create policy "chosen traitor plays own faction's deal or no deal"
on traitor_state for update
using (
  key = 'dond:' || my_traitor_faction(game_id)
  and owns_player(nullif(value->>'playerId', '')::uuid)
)
with check (
  key = 'dond:' || my_traitor_faction(game_id)
  and owns_player(nullif(value->>'playerId', '')::uuid)
);
