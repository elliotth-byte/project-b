-- ============================================================
-- Migration: scheduled GroupMe posts
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
-- Safe to run once on your existing project — additive only.
--
-- This only stores WHAT to post and WHEN. Actually posting it happens
-- server-side on a cron schedule (see pages/api/cron/post-scheduled.js)
-- because the GroupMe bot ID is a secret that must never reach the
-- browser — see the notes in pages/api/post-to-groupme.js for why.
-- ============================================================

create table if not exists scheduled_groupme_posts (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references games(id) on delete cascade not null,
  text text not null,
  post_at timestamptz not null,
  posted_at timestamptz,
  cancelled boolean not null default false,
  error text,
  created_by uuid references auth.users(id) not null,
  created_at timestamptz not null default now()
);

alter table scheduled_groupme_posts enable row level security;

-- Any host or co-host of the game can create/view/cancel its scheduled
-- posts. The cron job itself uses the service-role key and bypasses RLS
-- entirely, so this policy is purely for the host-facing UI.
create policy "hosts manage their scheduled posts"
on scheduled_groupme_posts for all
using (is_game_host(game_id))
with check (is_game_host(game_id) and created_by = auth.uid());
