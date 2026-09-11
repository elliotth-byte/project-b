-- ============================================================
-- Migration: native push tokens (iOS/Android app, not the web)
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
--
-- The companion table to push_subscriptions (see
-- sql/add-push-subscriptions.sql) for the wrapped native app — same
-- shape, same per-device-not-per-player granularity, same three
-- notify_* preference flags, but storing a native device token +
-- platform instead of a Web Push endpoint/p256dh/auth triple, since
-- native push is delivered through Firebase Cloud Messaging (see
-- lib/nativePush.js/lib/sendPush.js), an entirely different delivery
-- mechanism from the browser Push API the web version already uses.
-- Kept as a separate table rather than trying to force both shapes
-- into one, so neither delivery path has to carry columns that are
-- meaningless for the other.
-- ============================================================

create table if not exists native_push_tokens (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references players(id) on delete cascade not null,
  game_id uuid references games(id) on delete cascade not null,
  token text not null,
  platform text not null check (platform in ('ios', 'android')),
  notify_rounds boolean not null default true,
  notify_public_messages boolean not null default false,
  notify_private_messages boolean not null default true,
  created_at timestamptz not null default now(),
  unique (player_id, token)
);

alter table native_push_tokens enable row level security;

create policy "players manage their own native push tokens"
on native_push_tokens for all
using (exists (select 1 from players where players.id = native_push_tokens.player_id and players.user_id = auth.uid()))
with check (exists (select 1 from players where players.id = native_push_tokens.player_id and players.user_id = auth.uid()));

-- No broad-read policy here either, for the exact same reason as
-- push_subscriptions — the actual sending code uses the service-role
-- key and bypasses RLS entirely.
