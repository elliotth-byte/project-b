-- ============================================================
-- Migration: host push notification subscriptions
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
--
-- Separate from push_subscriptions (players) rather than reusing it,
-- because hosts aren't players — they're auth.users directly (either
-- the primary host via games.host_id, or a co-host via game_hosts, see
-- sql/add-game-hosts.sql), with no players row to key off of. Keyed by
-- (user_id, endpoint) rather than (player_id, endpoint): a co-host is a
-- different person from the primary host, and each host's device/
-- preferences are their own, same "one row per device, not per person"
-- shape as the player table, recognizing multiple hosts on one season
-- are genuinely different people who each want their own settings.
-- ============================================================

create table if not exists host_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references games(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  -- A new confessional (a private, host-only channel — the host is the
  -- only reader) and a new player waiting on approval are the two clear,
  -- bounded "needs your attention" events for a host. Deliberately no
  -- "any chat activity" option — with the host able to read every
  -- thread in the game, that would be far too noisy to be useful as a
  -- push notification.
  notify_new_confessional boolean not null default true,
  notify_pending_player boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

alter table host_push_subscriptions enable row level security;

-- A host (primary or co-) manages only their own subscriptions, and only
-- for a game they actually host.
create policy "hosts manage their own push subscriptions"
on host_push_subscriptions for all
using (user_id = auth.uid() and is_game_host(game_id))
with check (user_id = auth.uid() and is_game_host(game_id));
