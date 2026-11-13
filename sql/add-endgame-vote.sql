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
-- Visibility:
--   * While the vote is open, only the host (live) and each voter (their
--     own row) can see choices — endgame_votes' RLS enforces that.
--   * The moment the LAST living player votes, cast_endgame_vote closes
--     the vote itself and publishes the result AND every player's choice
--     into the game_state key below, so everyone sees it at once. (The
--     host can also close it early from the host console — that publishes
--     the same way, with whoever voted so far.)
--
-- Whether a vote is OPEN, and its published RESULT, live in a plain
-- game_state key ("traitors:endgame-vote") — readable by everyone, which
-- is fine because choices only land in it at the moment they're meant to
-- be revealed. That key carries a `roundKey`: the Roundtable's
-- roundInfo.startedAt, which changes every time a round opens or
-- advances. A row/state whose round_key doesn't match the current one is
-- simply stale and ignored, so nothing here needs clearing on round
-- advance or season reset.
--
-- ALREADY RAN AN EARLIER VERSION OF THIS FILE? Only the function at the
-- bottom changed (it now auto-reveals) — run just the
-- "create or replace function" block; the table/policies are unchanged.
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
-- Voting again while open replaces the earlier vote. If this vote makes
-- every living, approved player's vote present for this round, the vote
-- is closed right here and the result + all choices are published (see
-- header). Returns true if recorded, false if any check failed.
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
  v_alive integer;
  v_voted integer;
  v_end integer;
  v_banish integer;
  v_choices jsonb;
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

  -- Everyone in? Count living, approved players vs. their votes for THIS
  -- round (a banished player's old row doesn't count either way).
  select count(*) into v_alive from players
  where game_id = p_game_id and alive = true and approved = true;

  select
    count(*),
    count(*) filter (where ev.choice = 'end'),
    count(*) filter (where ev.choice = 'banish'),
    coalesce(jsonb_object_agg(p.display_name, ev.choice), '{}'::jsonb)
  into v_voted, v_end, v_banish, v_choices
  from endgame_votes ev
  join players p on p.id = ev.player_id
  where ev.game_id = p_game_id
    and ev.round_key = p_round_key
    and p.alive = true
    and p.approved = true;

  if v_alive > 0 and v_voted = v_alive then
    update game_state
    set value = jsonb_build_object(
      'roundKey', p_round_key,
      'open', false,
      'result', case when v_banish = 0 then 'end' else 'banish' end,
      'counts', jsonb_build_object('end', v_end, 'banish', v_banish, 'missing', 0),
      'choices', v_choices,
      'closedAt', (extract(epoch from now()) * 1000)::bigint,
      'auto', true
    )
    where game_id = p_game_id and key = 'traitors:endgame-vote';
  end if;

  return true;
end;
$$;

grant execute on function public.cast_endgame_vote(uuid, bigint, text) to authenticated;
