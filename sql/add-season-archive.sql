-- ============================================================
-- Migration: archive seasons instead of only being able to delete them
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
-- Safe to run once on your existing project — additive only.
-- ============================================================

-- Archived seasons are hidden from the host's default season switcher but
-- not deleted — nothing about their players/state/history changes. This
-- is deliberately separate from actually deleting a game (which the host
-- can still do, and which cascades via the existing FKs in schema.sql).
alter table games add column if not exists archived boolean not null default false;
