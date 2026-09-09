-- ============================================================
-- Migration: Stereo Types Round 3 ("On Blast") — the win-sticker grant
-- Run this in Supabase SQL Editor (New query -> paste -> Run), AFTER
-- sql/add-stereo-types-a-side.sql and sql/add-stereo-types-boombox.sql
-- (this depends on both: stereo_types_round_scores for the score data,
-- stereo_types_sticker_unlocks for the ledger being granted into).
-- Safe to run once on your existing project — additive only.
--
-- On Blast's own round-3 gameplay state lives in game_state (see
-- lib/stereoTypesOnBlast.js), and its finalized points get upserted
-- into the EXISTING stereo_types_round_scores table as round = 3 rows —
-- exactly the reuse that table's own migration comment already
-- anticipated. Neither of those needs any new SQL. The one genuinely
-- new piece of database surface this phase needs is this function.
--
-- sql/add-stereo-types-boombox.sql deliberately left
-- stereo_types_sticker_unlocks with NO insert policy for the
-- authenticated role at all, specifically because there was no real
-- win-detection mechanic yet to grant off of, and its own comment named
-- exactly this moment: "Unlocks are only ever meant to be granted by a
-- future SECURITY DEFINER function, once a real win-detection mechanic
-- exists." This is that function.
--
-- ─── Why SECURITY DEFINER is the right (and only safe) tool here ───
-- Every other Stereo Types write path in this game (rankings, picks,
-- bids, guesses, round scores) is a plain client write, safe specifically
-- BECAUSE those either aren't security-sensitive (a wrong ranking just
-- loses you the round) or are a deterministic, already-agreed-upon
-- RESULT of data that's already durably committed (stereo_types_round_scores
-- itself — see that table's own migration comment on why a second
-- choke point isn't needed on top of game_state's CAS there). A
-- permanent, cross-season sticker unlock is categorically different:
-- it's the one thing in this whole game that outlives the game itself,
-- and "did I actually win" is not something any client should ever get
-- to assert about itself. This function is the SINGLE place that
-- question gets answered, entirely from server-held data, regardless of
-- what the calling client claims.
--
-- ─── The verification query, in detail ───
-- 1. Resolve the CALLER's own player row for p_game_id from `players`
--    via auth.uid() — never from a client-supplied player id. If this
--    account was never even a player in this game, there is no possible
--    win to claim and the function returns false immediately.
-- 2. Sum every already-finalized round's points
--    (stereo_types_round_scores, grouped by player_id) for this one
--    game — the SAME durable ledger the app's own final-standings
--    screen reads (lib/stereoTypesFinale.js's
--    fetchStereoTypesFinalStandings) rather than anything recomputed
--    or passed in by the client.
-- 3. Require Round 3 (On Blast) to have actually finished for this game
--    (a round = 3 row exists) before a win can be claimed at all — not
--    just a security guard, a correctness one: without it, a player who
--    is merely leading after Rounds 1-2 could claim a "win" before the
--    game has even reached its actual end.
-- 4. A win means the caller's own summed total EQUALS the game's max
--    total — not "is uniquely first" — so ties at the top are all
--    legitimate winners, matching the spec's own "the player with the
--    most points wins" with no tie-break rule, and matching
--    fetchStereoTypesFinalStandings's own winnerIds logic exactly.
-- 5. Only once all of the above holds does the insert run, and even
--    then `on conflict (user_id, sticker_id) do nothing` makes
--    re-claiming an already-unlocked sticker a harmless no-op rather
--    than an error.
--
-- ─── A known, deliberately-flagged limitation, NOT a silent bug ───
-- stereo_types_sticker_unlocks is keyed (user_id, sticker_id) only — by
-- original design (see add-stereo-types-boombox.sql), with no game_id
-- column at all, since a sticker unlock is meant to be a permanent,
-- cross-season reward rather than something tied to which game granted
-- it. That means this function has no way to tell "have you already
-- spent THIS win's one sticker choice" apart from "have you ever
-- unlocked this sticker at all" — a legitimate winner could, in
-- principle, call this RPC multiple times with DIFFERENT sticker ids off
-- of the exact same win and collect more than one sticker for it, since
-- nothing here (or in the table itself) tracks "one claim per game."
-- The UI (components/StereoTypesFinalStandings.jsx) only ever offers the
-- picker once and hides it after a successful claim, which prevents
-- this happening by accident through normal play — but a technically
-- savvy winner could still call the RPC directly more than once. This
-- is the SAME "hidden by the UI, not exhaustively enforced by the
-- database" trust model this app already leans on elsewhere (see
-- lib/stereoTypesASide.js's own header comment on game_state's
-- read-everything RLS), just showing up here in a write path instead of
-- a read path. Closing it fully would mean adding a per-game claim
-- record, which is a real schema change beyond what this migration was
-- scoped to do — flagged here deliberately rather than silently
-- shipped, so it's a conscious, visible trade-off rather than an
-- overlooked hole.
-- ============================================================

create or replace function public.stereo_types_claim_win_sticker(p_game_id uuid, p_sticker_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_my_player_id uuid;
  v_top_score bigint;
  v_my_score bigint;
begin
  if v_user_id is null then
    return false;
  end if;

  -- Step 1: who is the CALLER in this game, if anyone? Resolved from
  -- `players` via auth.uid(), never from anything the client passed in.
  select id into v_my_player_id
  from players
  where game_id = p_game_id and user_id = v_user_id;

  if v_my_player_id is null then
    return false;
  end if;

  -- Step 3 (correctness guard): the game must have actually reached its
  -- real end — a round = 3 row exists for at least one player in this
  -- game — before anyone can claim a win off of it.
  if not exists (
    select 1 from stereo_types_round_scores
    where game_id = p_game_id and round = 3
  ) then
    return false;
  end if;

  -- Step 2 + 4: sum every round's points per player for this game, then
  -- compare the CALLER's own total against the game-wide max. Both
  -- values come from the same aggregate so a game with zero rows at all
  -- (shouldn't happen given the round=3 check above, but cheap to be
  -- safe about) can't produce a false positive: max() over zero rows is
  -- null, v_my_score would also be null, and `null = null` is null (not
  -- true) in SQL, so the check below already safely rejects that case
  -- with no extra special-casing needed.
  select max(total) into v_top_score
  from (
    select player_id, sum(points) as total
    from stereo_types_round_scores
    where game_id = p_game_id
    group by player_id
  ) totals;

  select sum(points) into v_my_score
  from stereo_types_round_scores
  where game_id = p_game_id and player_id = v_my_player_id;

  if v_my_score is null or v_top_score is null or v_my_score <> v_top_score then
    return false;
  end if;

  -- Only reachable once every check above has genuinely passed.
  insert into stereo_types_sticker_unlocks (user_id, sticker_id)
  values (v_user_id, p_sticker_id)
  on conflict (user_id, sticker_id) do nothing;

  return true;
end;
$$;

-- Explicit grant/revoke rather than relying on Postgres's own default
-- (every new function is EXECUTE-granted to PUBLIC, which every role
-- including `authenticated` already inherits from, unless revoked) —
-- none of this app's EARLIER security definer functions
-- (is_game_host/is_game_player/find_game_by_code/is_traitor_player/...)
-- bothered with an explicit grant/revoke pair, since none of them
-- perform a WRITE. This one does — it's the one function in this whole
-- game that permanently grants an account-level reward — so being
-- explicit here, rather than quietly relying on Postgres's own default
-- PUBLIC grant, is worth the few extra lines: anon has no legitimate
-- reason to ever call this (auth.uid() would just be null and the
-- function would return false anyway, so this isn't fixing a real
-- exploit — it's removing a needless extra way in).
revoke execute on function public.stereo_types_claim_win_sticker(uuid, text) from public;
grant execute on function public.stereo_types_claim_win_sticker(uuid, text) to authenticated;
