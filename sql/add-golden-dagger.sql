-- ============================================================
-- Migration: Golden Dagger (a secret extra Roundtable vote)
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
-- Safe to run once on your existing project — additive only.
-- Run AFTER sql/add-traitors-tables.sql (uses its owns_player() and
-- is_game_host() helpers).
--
-- There is ONE Golden Dagger per game. The host assigns it to a single
-- player; that player — and only that player — can then cast a second,
-- extra vote at each Roundtable while they hold it. The host can reassign
-- or revoke it at any time.
--
-- Why a table of its own rather than a game_state key: game_state is
-- readable by every player in the game, which would hand anyone the
-- holder's name by just querying it. This table's RLS lets only the host
-- and the holder's own account read the row, so nobody else can tell who
-- (if anyone) holds it. Same reasoning as player_roles / host_state.
--
-- The extra vote lives on this same row (rather than in the shared
-- traitors:votes:round-N map) so it stays private until the host reveals
-- it, and so the vote counts, inactivity strikes and history that read
-- that shared map are unaffected.
-- ============================================================

create table if not exists golden_daggers (
  game_id uuid primary key references games(id) on delete cascade,
  player_id uuid references players(id) on delete cascade not null,
  assigned_at timestamptz not null default now(),
  -- The holder's extra vote for ONE round. A vote whose vote_round isn't
  -- the current round is simply stale and ignored by the host.
  vote_round integer,
  vote_target text,
  vote_reason text,
  voted_at timestamptz
);

alter table golden_daggers enable row level security;
alter publication supabase_realtime add table golden_daggers;

create policy "host reads golden_daggers"
on golden_daggers for select
using (is_game_host(game_id));

create policy "holder reads own golden dagger"
on golden_daggers for select
using (owns_player(player_id));

create policy "host writes golden_daggers"
on golden_daggers for insert
with check (is_game_host(game_id));

create policy "host updates golden_daggers"
on golden_daggers for update
using (is_game_host(game_id));

create policy "host deletes golden_daggers"
on golden_daggers for delete
using (is_game_host(game_id));

-- The holder never writes this table directly (no player UPDATE policy
-- above) — they cast their extra vote through this function, which checks,
-- on the server, that:
--   * the caller is the CURRENT holder and is still alive,
--   * Roundtable voting is open and p_round is the round being voted on,
--   * the target is a living player in this game other than the holder.
-- A vote cast again while voting is open simply replaces the earlier one.
-- Returns true if the vote was recorded, false if any check failed.
create or replace function public.cast_golden_vote(
  p_game_id uuid,
  p_round integer,
  p_target text,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dagger golden_daggers%rowtype;
  v_info jsonb;
begin
  select * into v_dagger from golden_daggers where game_id = p_game_id;
  if not found then return false; end if;

  if not exists (
    select 1 from players
    where id = v_dagger.player_id and user_id = auth.uid() and alive = true
  ) then
    return false;
  end if;

  select value into v_info from game_state
  where game_id = p_game_id and key = 'traitors:round-info';
  if v_info is null then return false; end if;
  if coalesce((v_info->>'votingOpen')::boolean, false) = false then return false; end if;
  if (v_info->>'round')::integer is distinct from p_round then return false; end if;

  if not exists (
    select 1 from players
    where game_id = p_game_id
      and display_name = p_target
      and alive = true
      and id <> v_dagger.player_id
  ) then
    return false;
  end if;

  update golden_daggers
  set vote_round = p_round,
      vote_target = p_target,
      vote_reason = nullif(trim(coalesce(p_reason, '')), ''),
      voted_at = now()
  where game_id = p_game_id;

  return true;
end;
$$;

grant execute on function public.cast_golden_vote(uuid, integer, text, text) to authenticated;
