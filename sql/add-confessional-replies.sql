-- ============================================================
-- Migration: private host replies on confessionals
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
--
-- Lets the host leave a single private reply on a player's confessional.
-- No new table/RLS needed: this reuses the existing `confessionals`
-- policies from sql/add-confessionals.sql — "player reads own
-- confessionals" already exposes every column (including these two new
-- ones) to just that player, and "host updates confessionals" already
-- lets the host write them.
-- ============================================================

alter table confessionals add column if not exists host_reply text;
alter table confessionals add column if not exists host_reply_at timestamptz;
