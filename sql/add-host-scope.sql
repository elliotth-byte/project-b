-- ============================================================
-- Migration: host scoping — restrict self-serve hosts to one game type
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
-- Safe to run once on your existing project — it only replaces the
-- games table's own insert policy, additive otherwise.
--
-- Context: pages/login.jsx's new "Host a game instead" self-serve
-- signup (lib/auth.js's signUpHost) creates a real host account without
-- needing a Supabase dashboard step first — but by default that gave a
-- brand-new host exactly the same access as any hand-provisioned one:
-- able to create a Panopticon or Traitors season just as easily as a
-- Stereo Types one. lib/auth.js's signUpHost now tags every self-serve
-- account with `hostScope: "stereo_types"` in its own user_metadata
-- (dashboard-created accounts are untouched and have no hostScope key
-- at all). pages/host.jsx's own game-type picker already filters on
-- this (see canHostGameType in lib/auth.js) — but that's just the UI;
-- this policy is the actual enforcement, since a client-side filter
-- alone can be bypassed by anyone calling supabase.from("games").insert
-- directly.
--
-- ─── The check, in words ───
-- A game row can only be inserted if EITHER the inserting user's own
-- hostScope metadata is absent entirely (every pre-existing,
-- unrestricted host account keeps working exactly as before), OR it's
-- present and matches the game_type actually being inserted. auth.jwt()
-- reads straight from the session's own JWT (which already embeds
-- user_metadata at the time it was issued) — no extra table lookup
-- needed, same zero-round-trip approach this schema's other
-- auth.jwt()-based checks already use.
--
-- ─── A separate, pre-existing gap this ALSO closes (flagged, not
-- silently bundled in) ───
-- The original policy this replaces (`host_id = auth.uid()`, from
-- sql/schema.sql) never actually checked role = "host" at all — only
-- the app's own client-side isHost() gate stood between a plain player
-- account and being able to insert a games row directly (e.g. via the
-- browser console). No legitimate code path in this app ever does
-- that, so this shouldn't change anything for real usage, but it's a
-- genuine tightening beyond what was asked for this phase, worth
-- knowing about rather than leaving unmentioned.
-- ============================================================

drop policy if exists "create your own game" on games;

create policy "create your own game"
on games for insert
with check (
  host_id = auth.uid()
  and (auth.jwt() -> 'user_metadata' ->> 'role') = 'host'
  and (
    (auth.jwt() -> 'user_metadata' ->> 'hostScope') is null
    or (auth.jwt() -> 'user_metadata' ->> 'hostScope') = game_type
  )
);
