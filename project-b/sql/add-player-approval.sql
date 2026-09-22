-- ============================================================
-- Migration: player approval
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
--
-- New column defaults to false, which would normally mean every EXISTING
-- player in every game suddenly becomes "unapproved" the moment this runs.
-- That's not what we want for games already in progress — the backfill
-- below immediately marks every player who already exists as approved,
-- since they already effectively went through the (previously nonexistent)
-- approval step by already being in the game. Only players who join AFTER
-- this migration runs will actually land in the pending state.
-- ============================================================

alter table players add column if not exists approved boolean not null default false;
update players set approved = true where approved = false;
