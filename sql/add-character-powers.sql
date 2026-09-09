-- ============================================================
-- Migration: Character Powers — player-level state
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
--
-- ONE flexible jsonb column rather than a new column per power. This
-- feature is landing in phases across many turns (see lib/
-- characterPowers.js's own comment for the full roadmap) — a dedicated
-- column per power would mean a new migration nearly every phase, for
-- fields that are each read/written by exactly one power's own logic
-- and nothing else. Shape (all keys optional, absent = not set):
--   {
--     assignedPower: "Zeus" | ... | null   -- only set when settings.
--       characterPowersMode is "random"; in "by_character" mode a
--       player's power is just their own .alias directly, no separate
--       field needed for that case at all.
--     aphroditeTarget: playerId | null
--     zeusUsedThisChallenge: does not need storage — computed live from
--       placements each time, nothing to persist.
--     poseidonUsed: true | absent          -- once-per-season flag
--     poseidonRound: number | null         -- which round DMs are off for
--   }
-- Future phases add their own keys to this same object rather than new
-- columns or a new migration each time.
--
-- RLS: the ONLY existing policies letting a player touch their own
-- `players` row are narrowly scoped to color (add-player-color-
-- policy.sql) and quitting (add-player-quit-policy.sql) specifically —
-- see those files for why a missing or overly-narrow policy here has
-- broken a real feature before (the quit button). Adding this one
-- proactively, before any power that needs it ships, rather than
-- waiting for a bug report. Host-initiated writes (e.g. rolling random
-- power assignments for every player at once) don't need this at all —
-- "host manages players" (schema.sql) already covers the host
-- unrestricted.
-- ============================================================

alter table players add column if not exists power_state jsonb default '{}'::jsonb;

create policy "players manage their own power state"
on players for update
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and display_name = (select p2.display_name from players p2 where p2.id = players.id)
  and approved = (select p2.approved from players p2 where p2.id = players.id)
  and alive = (select p2.alive from players p2 where p2.id = players.id)
  and elimination_type is not distinct from (select p2.elimination_type from players p2 where p2.id = players.id)
);
