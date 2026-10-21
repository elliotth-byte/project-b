-- ============================================================
-- Migration: Traitors host notifications — Traitor decisions, Pandora's
-- Box, and player votes
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
-- Safe to run once — additive only, adds columns to the table created by
-- sql/add-host-push-subscriptions.sql.
--
-- notify_traitor_decisions: a Traitor casts (or changes) a murder vote, a
--   player answers a secret recruitment offer, or a secret Deal or No
--   Deal board finishes. Host-only, like every host push.
-- notify_pandora: someone opens Pandora's Box.
-- notify_player_votes: a player casts (or changes) a Roundtable vote.
-- All on by default for existing and new subscriptions.
-- ============================================================

alter table host_push_subscriptions
  add column if not exists notify_traitor_decisions boolean not null default true,
  add column if not exists notify_pandora boolean not null default true,
  add column if not exists notify_player_votes boolean not null default true;
