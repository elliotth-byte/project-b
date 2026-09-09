-- ============================================================
-- Migration: onboarding checklist for new players
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
--
-- Three per-player flags: sent a message in the main group chat, sent
-- a DM, and opened their own mini profile to see their power. All
-- three need to be true before that player can take part in a Battle
-- (see pages/play.jsx's own gating logic).
--
-- Existing players are backfilled to true on ALL THREE, immediately,
-- as part of this migration — this feature is only ever meant to walk
-- a brand new player through the app when they first join a NEW
-- season, never to retroactively lock out someone already mid-season
-- who joined before this existed. The column defaults (false) only
-- apply to players who join AFTER this migration runs.
-- ============================================================

alter table players add column if not exists onboarding_chat_sent boolean not null default false;
alter table players add column if not exists onboarding_dm_sent boolean not null default false;
alter table players add column if not exists onboarding_profile_viewed boolean not null default false;

update players set onboarding_chat_sent = true, onboarding_dm_sent = true, onboarding_profile_viewed = true
where onboarding_chat_sent = false or onboarding_dm_sent = false or onboarding_profile_viewed = false;
