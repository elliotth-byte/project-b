-- ============================================================
-- Fix: is_current_chaos_holder() compared the wrong id.
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
--
-- The original version (in add-chaos-secrets.sql) compared
-- game_state.value->>'chaosHolderId' — which is a `players.id` — directly
-- against auth.uid() — which is the *auth user's* id from auth.users.
-- Those are two different UUIDs for the same person (see players.user_id
-- in schema.sql), so that comparison was never true for the actual chaos
-- holder. In practice this meant the RLS policies on chaos_secrets (see
-- add-chaos-secrets.sql) worked correctly for the HOST, but the player who
-- actually held the Power of Chaos could never read their own secret pick
-- — the one thing that table exists to let them see.
--
-- This corrects it by joining players to translate chaosHolderId (a
-- players.id) into that player's actual user_id before comparing to
-- auth.uid(). `create or replace function` — safe to run even if you've
-- already run add-chaos-secrets.sql; this just replaces the broken body.
-- ============================================================

create or replace function public.is_current_chaos_holder(p_game_id uuid, p_context text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select case
    when p_context = 'finale' then
      coalesce(
        (select p.user_id = auth.uid()
         from game_state gs
         join players p on p.id = (gs.value->>'chaosHolderId')::uuid
         where gs.game_id = p_game_id and gs.key = 'pb:finale'),
        false
      )
    else
      coalesce(
        (select p.user_id = auth.uid()
         from game_state gs
         join players p on p.id = (gs.value->>'chaosHolderId')::uuid
         where gs.game_id = p_game_id and gs.key = 'pb:exile'
           and (gs.value->>'round') = split_part(p_context, ':', 2)),
        false
      )
  end;
$$;
