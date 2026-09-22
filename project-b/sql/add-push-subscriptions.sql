-- ============================================================
-- Migration: push notification subscriptions
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
--
-- One row per device/browser a player has enabled notifications on, not
-- one row per player — someone playing from both their phone and a
-- laptop has two independent subscriptions, each with its own
-- preferences (matches how each device's Settings screen only knows
-- about that device's own subscription anyway).
-- ============================================================

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references players(id) on delete cascade not null,
  game_id uuid references games(id) on delete cascade not null,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  -- "Round changes" covers a new Battle, Exile Vote, or Fates Ceremony
  -- starting. "Public" is Panopticon (group chat); "private" is DMs —
  -- kept as two separate flags since a player might want one without
  -- the other (e.g. DMs feel more urgent than group chatter).
  notify_rounds boolean not null default true,
  notify_public_messages boolean not null default false,
  notify_private_messages boolean not null default true,
  created_at timestamptz not null default now(),
  unique (player_id, endpoint)
);

alter table push_subscriptions enable row level security;

-- A player manages only their own subscriptions.
create policy "players manage their own push subscriptions"
on push_subscriptions for all
using (exists (select 1 from players where players.id = push_subscriptions.player_id and players.user_id = auth.uid()))
with check (exists (select 1 from players where players.id = push_subscriptions.player_id and players.user_id = auth.uid()));

-- No policy granting the server broad read access here on purpose — the
-- actual sending routes (pages/api/push/*.js) use the service-role key,
-- which bypasses RLS entirely, the same way every other privileged
-- server route in this app already works.
