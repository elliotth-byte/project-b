-- ============================================================
-- Migration: Floor specialty placement
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
--
-- floor_specialty: a player's own saved area-of-expertise choice for
-- The Floor, settable any time (not just while a Floor battle is
-- actually running — see the Options tab), same "don't bottleneck the
-- start of a battle waiting on everyone to show up and choose"
-- reasoning as torched_preset (sql/add-torched-preset.sql). Stored as
-- plain text — one of lib/games/triviaData.js's own existing category
-- names — rather than inventing a whole separate content bank: a
-- player picking "their expertise" and the game later asking them a
-- question from that same category IS the mechanic, and this app
-- already has 90+ curated categories to draw from.
-- ============================================================

alter table players add column if not exists floor_specialty text;
