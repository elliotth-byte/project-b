-- ============================================================
-- Migration: relationship-web adversarial-vote lookup (security definer)
-- Run this in Supabase SQL Editor, AFTER sql/add-player-friendships.sql,
-- sql/add-traitors-tables.sql, and sql/add-season-placement.sql.
--
-- lib/relationshipWeb.js originally read vote history client-side,
-- straight through each table's own RLS. That worked fine for Project
-- B's Exile votes and Traitors' Roundtable votes (both live in
-- game_state, readable by any approved player of that game forever —
-- see sql/schema.sql's is_game_host/is_game_player policy) but left
-- Traitors' Murder Vote out entirely: it lives in traitor_state, whose
-- RLS is FACTION-scoped (sql/add-traitors-tables.sql) — a Faithful
-- player, usually the one actually being murdered, can never read it at
-- all, and even a Traitor never sees the opposing faction's votes.
--
-- The fix isn't to read traitor_state client-side (that would just move
-- the same information-leak risk somewhere else) — it's this function,
-- SECURITY DEFINER so it CAN read every vote source internally
-- (including the faction-locked traitor_state), but which only ever
-- hands back the resolved (other_user_id, game_id) pairs for seasons
-- that have ACTUALLY ENDED. That "ended" gate is the real point: it's
-- what stops a live, not-yet-revealed murder vote (or an in-progress
-- Exile/Roundtable vote) from ever leaking through the relationship web
-- as a spoiler — most acutely, a Faithful player must never see a red
-- ring appear mid-season for whoever's currently plotting against them.
--
-- "Ended" per game type (see lib/gameState.js's PHASES and
-- lib/traitorsFinale.js's declareWinner for the exact shapes this reads):
--   - project_b: that game's 'pb:round' game_state row has
--     value->>'phase' = 'ended'.
--   - traitors: that game's 'traitors:finale' game_state row exists at
--     all (declareWinner always writes a winnerId the moment it's
--     called — same "row exists" convention public_season_history
--     already uses for reached_finale).
--
-- Every vote SOURCE this reads (exile-history + finale voteRows for
-- project_b; vote-history + BOTH murder-vote faction keys for
-- traitors) only ever contributes rows once its OWN game has passed
-- that gate above — there's no way to end up with a partial in-progress
-- read from one source and a real one from another for the same game.
-- ============================================================

create or replace function public.public_relationship_adversaries(p_subject_user_id uuid)
returns table (other_user_id uuid, game_id uuid)
language sql
security definer
set search_path = public
stable
as $$
  with my_games as (
    -- Every game p_subject_user_id was an approved player in, restricted
    -- to ones that have actually ended. Deliberately keyed off
    -- players.user_id (not is_game_host/is_game_player, which check the
    -- CALLER's own membership) — this function runs as its definer, not
    -- the caller, specifically so it can be called about ANY subject,
    -- not just the caller's own account (see pages/profile.jsx, which
    -- now shows anyone's relationship web, not just your own).
    select distinct p.game_id, g.game_type
    from players p
    join games g on g.id = p.game_id
    where p.user_id = p_subject_user_id and p.approved = true
      and (
        (g.game_type <> 'traitors' and exists (
          select 1 from game_state gs where gs.game_id = g.id and gs.key = 'pb:round' and gs.value ->> 'phase' = 'ended'
        ))
        or
        (g.game_type = 'traitors' and exists (
          select 1 from game_state gs where gs.game_id = g.id and gs.key = 'traitors:finale'
        ))
      )
  ),

  -- Project B: pb:exile-history (one array entry per round, each with
  -- its own voteRows) plus pb:finale's own single voteRows array —
  -- both { voterId, targetId }, keyed by that game's players.id.
  pb_votes as (
    select idmap_v.user_id as voter_user_id, idmap_t.user_id as target_user_id, mg.game_id
    from my_games mg
    join game_state gs on gs.game_id = mg.game_id and gs.key in ('pb:exile-history', 'pb:finale')
    cross join lateral jsonb_array_elements(
      case when gs.key = 'pb:exile-history' then coalesce(gs.value, '[]'::jsonb) else jsonb_build_array(gs.value) end
    ) as entry
    cross join lateral jsonb_array_elements(coalesce(entry -> 'voteRows', '[]'::jsonb)) as vr
    join players idmap_v on idmap_v.game_id = mg.game_id and idmap_v.id = (vr ->> 'voterId')::uuid
    join players idmap_t on idmap_t.game_id = mg.game_id and idmap_t.id = (vr ->> 'targetId')::uuid
    where mg.game_type <> 'traitors'
  ),

  -- Traitors Roundtable: traitors:vote-history entries -> a `votes`
  -- object keyed by voterName -> { target: targetName } (see
  -- components/RoundtableHost.jsx's nextRound for this exact shape).
  rt_votes as (
    select pv.user_id as voter_user_id, pt.user_id as target_user_id, mg.game_id
    from my_games mg
    join game_state gs on gs.game_id = mg.game_id and gs.key = 'traitors:vote-history'
    cross join lateral jsonb_array_elements(coalesce(gs.value, '[]'::jsonb)) as entry
    cross join lateral jsonb_each(coalesce(entry -> 'votes', '{}'::jsonb)) as kv(voter_name, vote_val)
    join players pv on pv.game_id = mg.game_id and pv.display_name = kv.voter_name
    join players pt on pt.game_id = mg.game_id and pt.display_name = (kv.vote_val ->> 'target')
    where mg.game_type = 'traitors'
  ),

  -- Traitors Murder Vote: traitor_state's two faction keys
  -- ('murder-vote:traitor-red' / 'murder-vote:traitor-black'), each
  -- with its own `history` array of past resolved rounds -- read
  -- directly from traitor_state here (this function's SECURITY DEFINER
  -- is what makes that safe: only the resolved pairs below ever leave
  -- this function, never the raw faction data, and only once the whole
  -- season's ended per my_games above). Deliberately reads `.history`
  -- only, never the live `.votes` field -- that's always either empty
  -- or a stale in-progress attempt by the time a season's truly over.
  -- Field name is targetName here (see components/MurderVotePlayer.jsx),
  -- not `target` like Roundtable above -- the two systems never shared
  -- a schema.
  mv_votes as (
    select pv.user_id as voter_user_id, pt.user_id as target_user_id, mg.game_id
    from my_games mg
    join traitor_state ts on ts.game_id = mg.game_id and ts.key in ('murder-vote:traitor-red', 'murder-vote:traitor-black')
    cross join lateral jsonb_array_elements(coalesce(ts.value -> 'history', '[]'::jsonb)) as entry
    cross join lateral jsonb_each(coalesce(entry -> 'votes', '{}'::jsonb)) as kv(voter_name, vote_val)
    join players pv on pv.game_id = mg.game_id and pv.display_name = kv.voter_name
    join players pt on pt.game_id = mg.game_id and pt.display_name = (kv.vote_val ->> 'targetName')
    where mg.game_type = 'traitors'
  ),

  all_votes as (
    select * from pb_votes
    union all
    select * from rt_votes
    union all
    select * from mv_votes
  )

  select distinct
    case when voter_user_id = p_subject_user_id then target_user_id else voter_user_id end as other_user_id,
    game_id
  from all_votes
  where p_subject_user_id in (voter_user_id, target_user_id)
    and voter_user_id <> target_user_id;
$$;
