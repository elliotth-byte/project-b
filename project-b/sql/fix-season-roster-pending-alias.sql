-- ============================================================
-- Migration: don't leak a real name just because THAT player
-- specifically hasn't picked an alias yet
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
--
-- sql/fix-season-roster-hides-identity-not-alias.sql treated "this
-- player's own p.alias is null" as "this game doesn't use aliases at
-- all, nothing to protect" — which is wrong for the far more common
-- real case: the game DOES use aliases, this specific player just
-- hasn't chosen (or been assigned) one yet. Their real name was
-- leaking while everyone else's was correctly hidden, purely because
-- of an unrelated timing detail — whether they'd gotten around to
-- picking a character — which has nothing to do with whether their
-- identity is supposed to be a secret.
--
-- The fix checks whether ALIASES ARE IN USE FOR THIS GAME AT ALL
-- (does any approved player in it have a non-null alias) rather than
-- whether THIS row's own alias happens to be set yet. A game that
-- never uses aliases behaves exactly as before — always show the real
-- name, nothing to hide. A game that DOES use them now protects every
-- player uniformly while it's active, whether or not they've picked
-- theirs: shows their alias if they have one, or a "Choosing
-- character..." placeholder if they don't, but never their real name
-- either way until the season ends.
-- ============================================================

create or replace function public.public_season_roster(p_game_id uuid)
returns table (
  user_id uuid,
  display_name text,
  character_name text,
  won boolean,
  reached_finale boolean,
  alive boolean,
  elimination_type text,
  elimination_round integer,
  elimination_order integer,
  total_players integer,
  is_host boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select
    case
      when not exists (
        select 1 from players p3 where p3.game_id = p.game_id and p3.approved = true and p3.alias is not null
      ) then p.user_id
      when gs.value is not null then p.user_id
      else null
    end as user_id,
    case
      when not exists (
        select 1 from players p3 where p3.game_id = p.game_id and p3.approved = true and p3.alias is not null
      ) then coalesce(prof.display_name, p.display_name)
      when gs.value is not null then coalesce(prof.display_name, p.display_name)
      else coalesce(p.alias, 'Choosing character...')
    end as display_name,
    case when gs.value is not null then p.alias else null end as character_name,
    coalesce((gs.value ->> 'winnerId') = p.id::text, false) as won,
    (gs.value is not null) as reached_finale,
    p.alive,
    p.elimination_type,
    p.elimination_round,
    p.elimination_order,
    (select count(*)::integer from players p2 where p2.game_id = p.game_id and p2.approved = true) as total_players,
    false as is_host
  from players p
  left join profiles prof on prof.user_id = p.user_id
  join games g on g.id = p.game_id
  left join game_state gs on gs.game_id = p.game_id
    and gs.key = (case when g.game_type = 'traitors' then 'traitors:finale' else 'pb:finale' end)
  where p.game_id = p_game_id and p.approved = true

  union all

  -- The host, once, EVEN IF they're also a player in this same season
  -- (both rows are legitimate — hosting and playing are different
  -- roles) — deliberately not deduplicated against the players query
  -- above, since collapsing them would hide one of the two true things
  -- about that person's involvement in this specific season. Unchanged
  -- by any of these migrations — a host never has a character alias
  -- and was never hidden to begin with.
  select
    g.host_id as user_id,
    coalesce(prof.display_name, 'Host') as display_name,
    null as character_name,
    false as won,
    false as reached_finale,
    null as alive,
    null as elimination_type,
    null as elimination_round,
    null as elimination_order,
    null as total_players,
    true as is_host
  from games g
  left join profiles prof on prof.user_id = g.host_id
  where g.id = p_game_id;
$$;
