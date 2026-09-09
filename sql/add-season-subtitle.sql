-- ============================================================
-- Migration: optional subtitle per season/game
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
-- Safe to run once on your existing project — additive only.
-- ============================================================

-- Nullable by design: most seasons won't need one, it's just a way for
-- the host to tell seasons apart at a glance ("Summer Offsite 2026",
-- "Q3 Team Retreat", etc.) when running more than one at a time.
alter table games add column if not exists subtitle text;

-- Lets the /join/<code> page show "Joining <name>..." before the visitor
-- has actually joined (and therefore before the normal RLS-protected
-- `games` read would allow them to see anything about it). SECURITY
-- DEFINER, and deliberately returns only the name/subtitle — nothing else
-- about the game (host, players, state, etc.) is exposed by this.
create or replace function public.game_preview_by_code(p_code text)
returns table (name text, subtitle text)
language sql
security definer
set search_path = public
stable
as $$
  select name, subtitle from games where join_code = upper(trim(p_code));
$$;
