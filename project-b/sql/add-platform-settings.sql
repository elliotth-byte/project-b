-- ============================================================
-- Migration: platform-wide settings
-- Run this in Supabase SQL Editor, AFTER sql/add-profiles.sql (this
-- reuses is_platform_admin() defined there).
--
-- Same key-value shape as game_state (lib/gameState.js), but with no
-- game_id — these settings apply across every season on this
-- deployment, not one specific game. First (and, for now, only) use:
-- a platform-wide list of challenge game types turned off everywhere,
-- for when a game turns out broken and needs pulling before every
-- individual host thinks to disable it themselves in their own
-- season's setup (see lib/gameState.js's settings.disabledChallenges
-- for the per-season equivalent, and lib/challengeSelection.js for
-- how the two combine). Public read (any season's challenge selection
-- needs to check this), write restricted to platform admins only.
-- ============================================================

create table if not exists platform_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table platform_settings enable row level security;

create policy "anyone can read platform settings"
on platform_settings for select
using (true);

create policy "only platform admins can write platform settings"
on platform_settings for all
using (is_platform_admin())
with check (is_platform_admin());
