-- ============================================================
-- Migration: secret recruitment offers (Traitors)
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
-- Safe to run once — additive only. Run AFTER sql/add-traitors-tables.sql
-- and sql/add-confessionals.sql (uses is_game_host() and owns_player()).
--
-- The host offers a Faithful a place among the Traitors; that player alone
-- sees the offer and accepts or declines. Secrecy:
--   - No other player can read any row here. The only player policy is
--     "read my own offers"; nothing goes into game_state.
--   - The target can't edit the row directly. They answer through
--     respond_recruit_offer() below, which only lets the offer's own
--     player answer, only once, and only while it's still pending.
--   - Accepting flips their player_roles row right away, so they gain
--     their faction's Traitor views (murder vote etc.) instantly, even if
--     the host's tab is closed. The host's own tracker catches up the next
--     time the Traitor Roles panel is open (components/TraitorRolesHost.jsx).
-- ============================================================

create table if not exists recruit_offers (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references games(id) on delete cascade not null,
  player_id uuid references players(id) on delete cascade not null,
  faction text not null check (faction in ('traitor-red', 'traitor-black')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'withdrawn')),
  message text,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  applied_at timestamptz
);

create index if not exists recruit_offers_game_idx on recruit_offers (game_id);

alter table recruit_offers enable row level security;
alter publication supabase_realtime add table recruit_offers;

create policy "host manages recruit_offers"
on recruit_offers for all
using (is_game_host(game_id))
with check (is_game_host(game_id));

create policy "player reads own recruit offers"
on recruit_offers for select
using (owns_player(player_id));

create or replace function public.respond_recruit_offer(p_offer_id uuid, p_accept boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  o recruit_offers%rowtype;
begin
  select * into o from recruit_offers where id = p_offer_id for update;
  if not found or not owns_player(o.player_id) then
    raise exception 'Offer not found';
  end if;
  if o.status <> 'pending' then
    return o.status;
  end if;
  if not exists (select 1 from players where id = o.player_id and alive = true) then
    raise exception 'Only a living player can answer this offer';
  end if;

  update recruit_offers
     set status = case when p_accept then 'accepted' else 'declined' end,
         responded_at = now()
   where id = o.id;

  if p_accept then
    insert into player_roles (game_id, player_id, role, updated_at)
    values (o.game_id, o.player_id, o.faction, now())
    on conflict (game_id, player_id) do update set role = excluded.role, updated_at = now();
  end if;

  return case when p_accept then 'accepted' else 'declined' end;
end;
$$;

grant execute on function public.respond_recruit_offer(uuid, boolean) to authenticated;
