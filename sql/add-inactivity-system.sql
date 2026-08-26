-- ============================================================
-- Migration: Inactivity system
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
--
-- inactivity_strikes: 0-3, three strikes removes a player (elimination
-- type "removed_inactivity" — see the round engine changes for how this
-- gets applied). Decays by 1 automatically every 3 rounds, season-wide,
-- for every player who has any — not per-player timing off their own
-- most recent strike.
--
-- inactivity_shielded: a host-controlled per-player toggle. A shielded
-- player is fully immune to every PUNITIVE consequence in this system —
-- no strikes, no battle-ban-for-inactivity, never eligible for the
-- instant-removal rule — for as long as the shield is on. Deliberately
-- does NOT exempt them from the underlying GAME-INTEGRITY guarantees
-- that exist independent of punishment (a nominee always gets picked
-- for Fates, the Power of Khaos is always exercised) — those still
-- auto-resolve on a shielded player's behalf exactly the same way, the
-- shield only removes what would otherwise happen TO them for it.
-- ============================================================

alter table players add column if not exists inactivity_strikes integer not null default 0;
alter table players add column if not exists inactivity_shielded boolean not null default false;
