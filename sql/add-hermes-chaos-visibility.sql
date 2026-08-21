-- ============================================================
-- Migration: Hermes reads chaos_secrets early
-- Run this AFTER sql/add-chaos-secrets.sql and sql/add-character-powers.sql.
--
-- Hermes's character power (see lib/characterPowers.js): "Can see and
-- discuss the player saved by the Power of Chaos ahead of the vote
-- reveal." chaos_secrets' existing read policy (add-chaos-secrets.sql)
-- only ever allows the host or the actual current holder — this adds
-- Hermes as a third, narrowly-scoped case, via the same is_game_host-OR
-- pattern the existing policy already uses, rather than loosening
-- anything that's already there.
--
-- Deliberately checks NAME (alias, or power_state.assignedPower) rather
-- than trusting anything from the client — same reasoning as
-- pages/api/chaos-draw.js's own server-side Hestia check. Reads
-- characterPowersMode out of game_state's pb:settings key to know which
-- of the two to check; "off" means nobody ever qualifies as Hermes,
-- full stop.
-- ============================================================

create or replace function public.is_current_hermes(p_game_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select case
    when (select (gs.value->>'characterPowersMode') from game_state gs where gs.game_id = p_game_id and gs.key = 'pb:settings') = 'by_character' then
      coalesce(
        (select true from players p where p.game_id = p_game_id and p.user_id = auth.uid() and p.alias = 'Hermes'),
        false
      )
    when (select (gs.value->>'characterPowersMode') from game_state gs where gs.game_id = p_game_id and gs.key = 'pb:settings') = 'random' then
      coalesce(
        (select true from players p where p.game_id = p_game_id and p.user_id = auth.uid() and p.power_state->>'assignedPower' = 'Hermes'),
        false
      )
    else false
  end;
$$;

drop policy if exists "host and chaos holder read chaos secrets" on chaos_secrets;

create policy "host, chaos holder, or hermes read chaos secrets"
on chaos_secrets for select
using (is_game_host(game_id) or is_current_chaos_holder(game_id, context) or is_current_hermes(game_id));
