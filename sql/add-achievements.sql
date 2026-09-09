-- ============================================================
-- Migration: player achievements
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
--
-- One row per (user, achievement) EVER earned — badges are "have it or
-- don't," not stackable, so re-earning something in a later season
-- (winning as Zeus twice, say) is a no-op, not a second row. earned_at
-- and game_id record the FIRST time it happened; if it matters which
-- season a re-earn happened in later, that's not tracked here, on
-- purpose — keeps the model simple and matches how every other
-- account-wide badge system works.
--
-- No insert/update/delete policy for regular users at all — same
-- "not directly writable by players" shape chaos_secrets already has.
-- Every write goes through lib/achievements/evaluate.js, running
-- server-side with the service-role client; a player can never grant
-- themselves an achievement by calling the API directly.
-- ============================================================

create table if not exists player_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_key text not null,
  game_id uuid references games(id) on delete set null,
  earned_at timestamptz not null default now(),
  unique (user_id, achievement_key)
);

create index if not exists player_achievements_user_id_idx on player_achievements(user_id);

alter table player_achievements enable row level security;

-- Public read, same openness as the rest of the profile system
-- (sql/add-profiles.sql) — achievements are meant to be seen on
-- anyone's profile, not just your own.
drop policy if exists "anyone can read achievements" on player_achievements;
create policy "anyone can read achievements"
on player_achievements for select
using (true);
