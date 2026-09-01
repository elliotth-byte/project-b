-- ============================================================
-- Migration: player friendships (for the profile relationship web)
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
--
-- Deliberately one-directional and private, not a mutual "friend
-- request" system: this is a personal annotation ("I consider this
-- person a friend"), the same framing The Sims' own relationship panel
-- uses for its "Outgoing Relationships: how YOU feel about other sims"
-- view (see components/RelationshipWeb.jsx). There's no reciprocity
-- check, no notification to the other person, and no way for anyone
-- else — including the person being friended — to read your outgoing
-- list. Select/insert/delete are all scoped to user_id = auth.uid()
-- only; nobody, not even a platform admin, gets a broader read policy
-- here, since this is meant to stay a private view into how one person
-- feels, not a public or moderated social graph.
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

create policy "a person reads only their own outgoing friendships"
on player_friendships for select
using (user_id = auth.uid());

create policy "a person adds only their own outgoing friendships"
on player_friendships for insert
with check (user_id = auth.uid());

create policy "a person removes only their own outgoing friendships"
on player_friendships for delete
using (user_id = auth.uid());
