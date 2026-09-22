-- ============================================================
-- Migration: Stereo Types Round 1 ("A Side") — the round-score ledger
-- Run this in Supabase SQL Editor (New query -> paste -> Run), AFTER
-- sql/add-stereo-types-game-type.sql and sql/add-stereo-types-boombox.sql
-- (this doesn't strictly depend on either one's columns, but it's the
-- next migration in this game's own build order — see that second
-- file's own closing comment, which said exactly this table would land
-- "as each round gets built"). Safe to run once on your existing
-- project — additive only.
--
-- What this is, and what it deliberately is NOT:
--
-- All of A Side's actual gameplay state — dealt superlatives, submitted
-- rankings, the anonymized reveal mapping, submitted guesses — lives in
-- the existing generic `game_state` table (one row, keyed
-- "stereo_types:a-side:1", see lib/stereoTypesASide.js), the same way
-- Traitors' own Fates/Exile phases already store their entire nested
-- round state there. That table is the WORKING copy for the round
-- that's currently in progress; nothing about it is built to be summed
-- across rounds, and this game will eventually have three of them
-- (A Side, The Remix, On Blast).
--
-- stereo_types_round_scores is the durable, cross-round-summable
-- ledger this game needs instead: one row per (game, round, player),
-- holding that round's already-finalized point total. Round 2 and 3
-- (not built yet) just need to insert their own `round` value here when
-- they land — a season total is then nothing more than
-- `select player_id, sum(points) from stereo_types_round_scores where
-- game_id = ... group by player_id`, with zero changes needed to this
-- table itself.
--
-- RLS here matches game_state's own existing policy exactly (see
-- sql/schema.sql's "Anyone in the game can write game state" comment) —
-- deliberately NOT the stricter, no-client-writes pattern
-- stereo_types_sticker_unlocks uses. That one's locked down because
-- there's no legitimate reason a player's own client should ever grant
-- itself a permanent unlock. Here, by contrast, ANY approved player's
-- client legitimately needs to be able to write these rows: the actual
-- scoring computation (lib/stereoTypesASide.js's maybeScoreASide) is a
-- pure, deterministic function of data that's ALREADY fully and
-- immutably committed in game_state by the time it runs (every
-- player's rankings and guesses are locked in once submitted), guarded
-- by game_state's own version-checked CAS update so exactly one
-- client's computation actually gets committed as the round's official
-- result — this table is just that already-agreed-upon result getting
-- persisted, safe for more than one client to attempt (a plain upsert,
-- same values either way — see maybeScoreASide's own comment for why a
-- second, separate RPC/definer choke point isn't needed here on top of
-- that).
-- ============================================================

create table if not exists stereo_types_round_scores (
  game_id uuid references games(id) on delete cascade not null,
  round int not null,
  player_id uuid references players(id) on delete cascade not null,
  points int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (game_id, round, player_id)
);

alter table stereo_types_round_scores enable row level security;
alter publication supabase_realtime add table stereo_types_round_scores;

-- is_game_host / is_game_player are the same SECURITY DEFINER helpers
-- sql/schema.sql already defines (and sql/add-chaos-secrets.sql already
-- reuses) — no new function needed here.
create policy "read round scores in your game"
on stereo_types_round_scores for select
using (is_game_host(game_id) or is_game_player(game_id));

create policy "players write round scores in your game"
on stereo_types_round_scores for insert
with check (is_game_host(game_id) or is_game_player(game_id));

create policy "players update round scores in your game"
on stereo_types_round_scores for update
using (is_game_host(game_id) or is_game_player(game_id))
with check (is_game_host(game_id) or is_game_player(game_id));
