-- ============================================================
-- Migration: player friendships (for the profile relationship web)
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
--
-- One-directional, not a mutual "friend request" system: this is a
-- personal annotation ("I consider this person a friend"), the same
-- framing The Sims' own relationship panel uses for its "Outgoing
-- Relationships: how YOU feel about other sims" view (see
-- components/RelationshipWeb.jsx). There's no reciprocity check and no
-- notification to the other person. INSERT/DELETE are scoped to
-- user_id = auth.uid() — you can only ever manage your OWN outgoing
-- list. SELECT, unlike the first version of this migration, is public:
-- anyone's relationship web is now viewable by anyone (see
-- pages/profile.jsx), and who someone's friended carries no spoiler
-- risk the way vote history does (see
-- sql/add-relationship-adversaries-function.sql for the contrast) — so
-- there's no reason to keep this read-restricted to just the person who
-- did the friending.
--
-- If you already ran an earlier version of this file (SELECT scoped to
-- user_id = auth.uid()), run sql/fix-player-friendships-select-policy.sql
-- once to pick up the wider policy below — the create table/insert/
-- delete statements here are unchanged and safe to leave as-is.
-- ============================================================

create table if not exists player_friendships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  friended_user_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamptz not null default now(),
  unique (user_id, friended_user_id),
  check (user_id != friended_user_id)
);

alter table player_friendships enable row level security;

create policy "anyone can read anyone's outgoing friendships"
on player_friendships for select
using (true);

create policy "a person adds only their own outgoing friendships"
on player_friendships for insert
with check (user_id = auth.uid());

create policy "a person removes only their own outgoing friendships"
on player_friendships for delete
using (user_id = auth.uid());
