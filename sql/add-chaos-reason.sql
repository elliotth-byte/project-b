-- ============================================================
-- Migration: optional comment on a Power of Chaos pick
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
--
-- Lets the Power of Chaos holder leave an optional "why" alongside their
-- nullify pick, the same way voters already can (see
-- components/ExileVotePlayer.jsx's "reason" field). Reuses the existing
-- chaos_secrets table/RLS (sql/add-chaos-secrets.sql) — only the host or
-- the current holder can ever read it, same secrecy as the pick itself,
-- until the reveal surfaces it alongside everything else.
-- ============================================================

alter table chaos_secrets add column if not exists reason text;
