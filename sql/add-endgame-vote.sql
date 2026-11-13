-- ============================================================
-- Migration: End Game vs Banish Again (player-side vote)
-- Run this in Supabase SQL Editor (New query -> paste -> Run).
-- Safe to run once on your existing project — additive only.
-- Run AFTER sql/add-traitors-tables.sql (uses its owns_player() and
-- is_game_host() helpers).
--
-- After a Roundtable banish, the host can open a vote among whoever's
-- still standing: "End Game" or "Banish Again". Like the TV show, the
-- game only ends if EVERY living player votes End Game — a single
-- "Banish Again" (or a player who doesn't vote) means another banish.
--
-- Why a table of its own rather than a game_state key: game_state is
-- readable by every player in the game, which would let anyone see how
-- everyone else voted before the host reveals it. This table's RLS lets
-- only the host and the voter's own account read a row. Same reasoning
-- as golden_daggers / player_roles.
--
-- Whether a vote is OPEN, and its published RESULT, live in a plain
-- game_state key ("traitors:endgame-vote" — no individual votes in it,
-- so it's fine for everyone to read). That key carries a `roundKey`: the
-- Roundtable's roundInfo.startedAt, which changes every time a round
-- opens or advances. A row/state whose round_key doesn't match the
-- current one is simply stale and ignored, so nothing here needs
-- clearing on round advance or season reset.
-- ============================================================

create table if not exists endgame_votes (
  game_id uuid references games(id) on delete cascade not null,
  player_id uuid references players(id) on delete cascade not null,
  round_key bigint not null,
  choice text not null check (choice in ('end', 'banish')),
  voted_at timestamptz not null default now(),
  primary key (game_id, player_id)
);

alter table endgame_votes enable row level security;
alter publication supabase_realtime add table endgame_votes;

create policy "host reads endgame_votes"
on endgame_votes for select
using (is_game_host(game_id));

create policy "voter reads own endgame_vote"
on endgame_votes for select
using (owns_player(player_id));

-- Hosts can tidy rows up; players never write this table directly
-- (no player INSERT/UPDATE policy) — they go through the function below.
create policy "host deletes endgame_votes"
on endgame_votes for delete
using (is_game_host(game_id));

-- Cast (or change) the caller's vote. Checks, on the server, that:
--   * the caller owns an approved, living player in this game,
--   * an End Game vote is currently OPEN (game_state key
--     traitors:endgame-vote, open = true),
--   * p_round_key matches that open vote's roundKey,
--   * p_choice is 'end' or 'banish'.
-- Voting again while open replaces the earlier vote. Returns true if
-- recorded, false if any check failed.
create or replace function public.cast_endgame_vote(
  p_game_id uuid,
  p_round_key bigint,
  p_choice text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player_id uuid;
  v_state jsonb;
begin
  if p_choice not in ('end', 'banish') then return false; end if;

  select id into v_player_id from players
  where game_id = p_game_id
    and user_id = auth.uid()
    and alive = true
    and approved = true
  limit 1;
  if v_player_id is null then return false; end if;

  select value into v_state from game_state
  where game_id = p_game_id and key = 'traitors:endgame-vote';
  if v_state is null then return false; end if;
  if coalesce((v_state->>'open')::boolean, false) = false then return false; end if;
  if (v_state->>'roundKey')::bigint is distinct from p_round_key then return false; end if;

  insert into endgame_votes (game_id, player_id, round_key, choice, voted_at)
  values (p_game_id, v_player_id, p_round_key, p_choice, now())
  on conflict (game_id, player_id)
  do update set round_key = excluded.round_key, choice = excluded.choice, voted_at = excluded.voted_at;

  return true;
end;
$$;

grant execute on function public.cast_endgame_vote(uuid, bigint, text) to authenticated;
