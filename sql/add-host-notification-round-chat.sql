-- ============================================================
-- Migration: round-change and chat-activity notifications for hosts
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
-- Safe to run once on your existing project — additive only, adds
-- columns to the table created by sql/add-host-push-subscriptions.sql.
--
-- notify_round_changes: a new Battle, Exile Vote, Fates Ceremony, or
-- Finale starting — reuses the exact same trigger points players'
-- round-change notifications already use (see lib/roundEngine.js's
-- notifyRoundChange), since the cron job can auto-advance a phase
-- without the host doing anything, and they may want to know that
-- happened even though they didn't trigger it themselves.
--
-- notify_chat_activity: any new message, group or DM. Defaults to false
-- (like players' own public-message option) given a host can read every
-- thread in the game — this is opt-in specifically because it's the
-- noisiest option on offer, not because it isn't useful.
-- ============================================================

alter table host_push_subscriptions
  add column if not exists notify_round_changes boolean not null default true,
  add column if not exists notify_chat_activity boolean not null default false;
