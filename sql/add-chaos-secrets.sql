-- ============================================================
-- Migration: secret Power of Chaos picks
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
--
-- Why this needs its own table rather than just another key in
-- game_state: game_state's RLS is game-wide (any host or player can
-- read ANY key for their own game), which is fine for almost everything
-- in this app — but "who did the Power of Chaos holder nullify" needs
-- to be genuinely unreadable by other players until the reveal, not just
-- hidden in the UI (a player who opened dev tools could otherwise read
-- it straight out of the table). This table's own RLS policies restrict
-- reading it to the host and whoever currently holds the Power of Chaos.
--
-- `context` distinguishes which vote this pick belongs to:
--   'exile:<round>'  — a given round's Exile Vote
--   'finale'         — the finale vote (only ever happens once)
-- ============================================================

create table if not exists chaos_secrets (
  game_id uuid references games(id) on delete cascade not null,
  context text not null,
  nullified_player_id uuid,
  set_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (game_id, context)
);

alter table chaos_secrets enable row level security;
alter publication supabase_realtime add table chaos_secrets;

-- Checks (via a definer function, so this doesn't need its own broad
-- read access to game_state) whether the CURRENT user is whoever
-- game_state currently says holds the Power of Chaos for this context.
--
-- chaosHolderId (stored in game_state) is a players.id, not an auth user
-- id — so this has to join players to translate it to that player's
-- user_id before comparing to auth.uid(). (This was wrong in an earlier
-- version of this file — see sql/fix-chaos-holder-check.sql if you already
-- ran the old one.)
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

-- Only the host, or whoever the pick actually belongs to, can ever read
-- it. Every other player in the game — including the other two fate
-- nominees — genuinely cannot see this value at all.
create policy "host and chaos holder read chaos secrets"
on chaos_secrets for select
using (is_game_host(game_id) or is_current_chaos_holder(game_id, context));

create policy "chaos holder or host writes chaos secrets"
on chaos_secrets for insert
with check (is_current_chaos_holder(game_id, context) or is_game_host(game_id));

create policy "chaos holder or host updates chaos secrets"
on chaos_secrets for update
using (is_current_chaos_holder(game_id, context) or is_game_host(game_id))
with check (is_current_chaos_holder(game_id, context) or is_game_host(game_id));
