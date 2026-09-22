-- ============================================================
-- Migration: Stereo Types boombox identity — color + sticker unlocks
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
-- Safe to run once on your existing project — additive only.
--
-- Boombox COLOR reuses players.color as-is (sql/add-player-color.sql —
-- already a generic, game-type-agnostic column) rather than adding a
-- second color field just for this game type.
--
-- equipped_sticker is new: which unlocked sticker (if any) a player has
-- chosen to show on their boombox THIS season. Nullable — "no sticker
-- equipped" is the normal, common state, not an error case.
--
-- stereo_types_sticker_unlocks is the permanent, cross-season ledger of
-- which stickers a person has actually earned — profile-scoped
-- (user_id), not season-scoped, since winning once should keep that
-- sticker available in every future Stereo Types season, not just the
-- one it was won in.
--
-- Deliberately NO insert/update/delete policy for the authenticated
-- role on that ledger table. Unlocks are only ever meant to be granted
-- by a future SECURITY DEFINER function, once a real win-detection
-- mechanic exists (a later phase — On Blast's scoring isn't built yet,
-- so nothing can actually "win" a Stereo Types game today). A client-
-- writable insert policy here would let any player grant themselves
-- every sticker for free before that even exists; leaving it
-- read-only-to-self now and adding the granting function later is
-- strictly safer than opening it up now and locking it down after.
-- ============================================================

alter table players add column if not exists equipped_sticker text;

create table if not exists stereo_types_sticker_unlocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  sticker_id text not null,
  unlocked_at timestamptz not null default now(),
  unique (user_id, sticker_id)
);

alter table stereo_types_sticker_unlocks enable row level security;

create policy "read own sticker unlocks"
on stereo_types_sticker_unlocks for select
using (user_id = auth.uid());
