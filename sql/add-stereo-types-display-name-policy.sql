-- ============================================================
-- Migration: let a player set their OWN display name
-- Run this in Supabase SQL Editor (New query -> paste -> Run), any
-- time after sql/add-player-color-policy.sql (this doesn't touch or
-- replace that policy, just adds a sibling one — see below).
--
-- The original spec's own wording: "Players should have the option to
-- Set your display name in Stereotypes." Same starting problem
-- sql/add-player-color-policy.sql already solved for `color`: the only
-- self-serve UPDATE policy on `players` besides that one is still
-- host-only ("host manages players" in sql/schema.sql), and that
-- color policy's own WITH CHECK deliberately locks display_name to its
-- CURRENT stored value — "not self-approve, revive themselves, or
-- rename themselves by crafting their own request" was the right call
-- at the time this had no legitimate use case; now it does, for this
-- one game type's own onboarding-adjacent feature.
--
-- Deliberately a SEPARATE, narrowly-scoped policy rather than editing
-- the color one in place, matching that migration's own established
-- pattern (one policy per self-serve mutable column, each locking
-- every OTHER tracked column to its current value). Postgres combines
-- multiple permissive UPDATE policies with OR on both USING and WITH
-- CHECK, so a rename-only request satisfies THIS policy's WITH CHECK
-- (color/equipped_sticker/approved/alive/elimination_type all
-- unchanged) even though it fails the color policy's own check
-- (display_name changed) — and a color-only request still passes via
-- that existing policy, unaffected by this one. Neither policy needs
-- to know about the other.
--
-- Judgment calls:
--   1. Length capped at 40 chars in the WITH CHECK itself, not just
--      client-side (components/StereoTypesPlayerPanels.jsx's own
--      DisplayNameEditor already enforces the same 40 before ever
--      sending the request) — same "don't trust the client alone"
--      reasoning sql/add-stereo-types-superlative-submissions.sql
--      already applies to its own 140-char submission limit.
--   2. Non-empty after trimming whitespace — an all-blank name would
--      still technically satisfy `is not null`, but would render as a
--      blank boombox label everywhere (roster, rankings, chat) with no
--      way for anyone else to tell who that even is.
--   3. Not scoped to Stereo Types games specifically (games.game_type
--      isn't checked at all here) — a player renaming themselves
--      mid-season isn't a Stereo-Types-specific risk severe enough to
--      justify branching this policy per game type, and every other
--      game type already lets a player pick their own alias/color the
--      same way.
-- ============================================================

create policy "players set their own display name"
on players for update
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and char_length(trim(display_name)) between 1 and 40
  and color is not distinct from (select p2.color from players p2 where p2.id = players.id)
  and equipped_sticker is not distinct from (select p2.equipped_sticker from players p2 where p2.id = players.id)
  and approved = (select p2.approved from players p2 where p2.id = players.id)
  and alive = (select p2.alive from players p2 where p2.id = players.id)
  and elimination_type is not distinct from (select p2.elimination_type from players p2 where p2.id = players.id)
);
