-- ============================================================
-- Fix: widen player_friendships' SELECT policy to public read.
-- Run this in Supabase SQL Editor ONLY IF you already ran the original
-- sql/add-player-friendships.sql (the one whose SELECT policy was
-- scoped to user_id = auth.uid()) before this fix existed. A fresh
-- install running the current sql/add-player-friendships.sql already
-- gets this policy directly and does not need to also run this file.
--
-- See sql/add-player-friendships.sql's own header comment for why:
-- relationship webs are no longer self-only (pages/profile.jsx now
-- shows anyone's), and who someone's friended carries no spoiler risk,
-- unlike vote history — so there's no reason to keep this read-
-- restricted to just the person who did the friending.
-- ============================================================

drop policy if exists "a person reads only their own outgoing friendships" on player_friendships;

create policy "anyone can read anyone's outgoing friendships"
on player_friendships for select
using (true);
