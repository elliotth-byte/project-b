-- ============================================================
-- Migration: battle winner nomination timeout punishment
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
--
-- battle_ban_round: which round's Battle this player is barred from
-- competing in, or null if they're not currently barred. Set by
-- lib/roundEngine.js's advanceFromFates when a battle winner hasn't
-- submitted their Fates nomination within the ceremony's own configured
-- time limit (settings.fatesDurationSec)
-- starting — the game auto-nominates on their behalf and bars them from
-- the NEXT round's Battle as the stated consequence. Stores a round
-- NUMBER rather than a plain boolean specifically so the ban naturally
-- stops applying once that round's Battle has come and gone (a future
-- round's number will never match), without needing an explicit
-- clear-the-flag step anywhere.
-- ============================================================

alter table players add column if not exists battle_ban_round integer;
