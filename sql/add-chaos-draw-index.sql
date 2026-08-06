-- ============================================================
-- Migration: Power of Chaos button-draw index
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
--
-- The Power of Chaos draw now shows players a row of N mystery buttons
-- (N = however many players are actually in the draw that round) with
-- exactly one secretly correct — this column holds which one (0-based),
-- written and read only by pages/api/chaos-draw.js via the service-role
-- key. Reuses the existing chaos_secrets table/RLS (see
-- sql/add-chaos-secrets.sql) rather than a new table: those policies
-- already keep every "draw:" context row unreadable to ordinary players
-- (chaosHolderId isn't set yet at that point, so is_current_chaos_holder
-- is false for everyone), which is exactly the protection this needs too.
-- ============================================================

alter table chaos_secrets add column if not exists draw_index int;
