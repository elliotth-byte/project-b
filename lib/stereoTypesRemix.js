import { supabase } from "./supabaseClient";
import { storageGet, storageSet, storageUpdate, subscribeGameState } from "./gameStorage";
import { SUPERLATIVES, getSuperlativePool } from "./stereoTypesSuperlatives";
import { KEY_STEREO_TYPES_ROUND, anonLabelForIndex } from "./stereoTypesASide";

// ============================================================
// Stereo Types — Round 2, "The Remix"
//
// This is deliberately the MIRROR IMAGE of Round 1 ("A Side" —
// lib/stereoTypesASide.js, read that file FULLY first, this one assumes
// it and doesn't re-explain what's identical):
//   Round 1: player is GIVEN a superlative, must PRODUCE a ranking.
//   Round 2: player is GIVEN a ranking, must PICK a superlative.
//
// Rules:
//   1. Once the host starts the round, every approved player is dealt
//      one random ranking — a pure random shuffle of every approved
//      player's id, NOT anything any human actually ranked. Separately,
//      ONE shared pool of N candidate superlatives (N = approved player
//      count) is drawn at random and shown as the SAME list to EVERY
//      player this round — unlike Round 1's dealSuperlatives, this is
//      not personalized per player.
//   2. Each player privately looks at ONLY their own given ranking and
//      picks whichever of the N shared candidates they think explains it
//      best. Unlike Round 1's ranking (a permutation, no repeats) or
//      this round's own later guessing phase (also a permutation),
//      picking has NO uniqueness constraint at all — multiple players
//      independently landing on the same superlative is expected and
//      fine; don't accidentally carry Round 1's permutation constraint
//      over to this phase.
//   3. Once everyone's picked (or the host force-advances), every
//      submitted (ranking, pick) pair is shown to everyone, anonymized —
//      every player then guesses which real player it belongs to, as a
//      full permutation (one guess per pair, no repeats), with exactly
//      one guess flagged "pumped" for quadruple points if it's right.
//      This round's point values are DOUBLE Round 1's throughout (2/4
//      instead of 1/2) — see computeRemixScores below.
//   4. Once everyone's submitted their guesses (or the host forces it),
//      scores are computed once, atomically, and shown to everyone, then
//      persisted as round = 2 rows in the SAME summable ledger Round 1
//      uses (sql/add-stereo-types-a-side.sql's stereo_types_round_scores
//      — that table was already designed to be reused this way; no new
//      migration is needed for this round).
//
// Same game_state-row-per-round shape as Round 1 (see remixKey below,
// mirroring aSideKey), same version-checked CAS db.update, same "every
// connected client runs the advance/score housekeeping opportunistically,
// nobody's a single leader" ethos, same privacy model (game_state's RLS
// lets every approved player/host read every key — hidden by what the UI
// renders, not by the row itself). None of that is re-explained in depth
// here; lib/stereoTypesASide.js's own header comment covers the
// reasoning in full and it applies identically here.
//
// KEY_STEREO_TYPES_ROUND and anonLabelForIndex are imported straight
// from lib/stereoTypesASide.js rather than duplicated — both are already
// generic, already-exported pure/shared pieces (the round-tracking key
// itself, and a "Ranking A/B/C..." labeler with nothing Round-1-specific
// about it), so importing them costs nothing and keeps the round number
// itself in exactly one place. Round 1's own PRIVATE helpers (its local
// shuffle, buildAnonMap) are NOT imported — this file keeps its own
// copies below, matching the precedent lib/exileLogic.js/
// lib/characterPowers.js/lib/stereoTypesASide.js itself already set of
// each file owning a private shuffle rather than reaching for a shared
// util module for one function.
// ============================================================

export function remixKey(round) {
  return `stereo_types:remix:${round}`;
}

export function subscribeRemixRound(gameId, round, onChange) {
  return subscribeGameState(gameId, remixKey(round), onChange);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Every approved player gets their OWN independent random shuffle of the
// full roster (including themselves) — these are unrelated to each
// other. Two players can land on the same order purely by chance; that's
// fine and expected, nothing here is a permutation OF players ONTO
// players the way anonMap below is.
function dealRemixRankings(playerIds) {
  const rankings = {};
  playerIds.forEach((id) => { rankings[id] = shuffle(playerIds); });
  return rankings;
}

// Draws N candidate superlatives to show as the SAME shared list to
// every player this round (see this file's header comment — this is
// deliberately NOT personalized per player, unlike Round 1's own
// dealSuperlatives). Same degenerate-pool fallback lib/stereoTypesASide.js's
// dealSuperlatives already uses: repeat with a console warning rather
// than crash the round if the pool's smaller than N.
function drawSuperlativePool(n, pool = SUPERLATIVES) {
  if (!pool || pool.length === 0) {
    console.warn("Stereo Types: superlative pool is empty — Round 2's candidate list is a single placeholder.");
    return ["Most likely to do literally anything"];
  }
  if (n > pool.length) {
    console.warn(
      `Stereo Types: superlative pool (${pool.length}) is smaller than the Round 2 candidate count (${n}) — some candidates will repeat.`
    );
  }
  const shuffled = shuffle(pool);
  const out = [];
  for (let i = 0; i < n; i++) out.push(shuffled[i % shuffled.length]);
  return out;
}

function buildAnonMap(submitterIds) {
  const shuffled = shuffle(submitterIds);
  const anonMap = {};
  shuffled.forEach((playerId, i) => { anonMap[anonLabelForIndex(i)] = playerId; });
  return anonMap;
}

// ─── Host action: deal rankings + the shared candidate pool, open the
// picking phase ─── Idempotent by construction, same reasoning as
// startASide's own identical guard (protects against a double-click, or
// two host/co-host tabs, re-dealing everyone's ranking out from under a
// player already looking at theirs).
export async function startRemix(gameId, approvedPlayers) {
  const playerIds = (approvedPlayers || []).map((p) => p.id);
  if (playerIds.length < 2) {
    return { ok: false, error: "Need at least 2 approved players to start The Remix." };
  }

  const rankings = dealRemixRankings(playerIds);
  // getSuperlativePool() (lib/stereoTypesSuperlatives.js) is the static
  // SUPERLATIVES list plus any admin-approved player submissions — the
  // one call site swap Phase 8 makes in this file; drawSuperlativePool's
  // own default param is left alone.
  const superlativePool = drawSuperlativePool(playerIds.length, await getSuperlativePool());

  const res = await storageUpdate(gameId, remixKey(2), (fresh) => {
    if (fresh) return fresh; // already started — leave it alone, see comment above
    return {
      round: 2,
      status: "picking", // "picking" -> "reveal" -> "scored"
      startedAt: Date.now(),
      playerIds, // roster frozen at round-start, same reasoning as Round 1
      rankings, // { playerId: [playerId, ...] } — the GIVEN ranking, most -> least; nobody authored this
      superlativePool, // [ text, ... ] — the SAME N options shown to every player this round
      picks: {}, // { playerId: pickedSuperlativeText }, filled in as players submit; no uniqueness constraint
      revealStartedAt: null,
      anonMap: null, // { "Ranking A": ownerId, ... } — set once, at the picking -> reveal transition
      guesses: {}, // { guesserId: { assignments: { anonLabel: guessedPlayerId }, pumpedLabel, submittedAt } }
      result: null, // set once, atomically, by maybeScoreRemix below
    };
  });

  if (res.ok) await storageSet(gameId, KEY_STEREO_TYPES_ROUND, 2);
  return { ok: res.ok };
}

// A player submitting (or re-submitting, while still "picking") their
// own choice from the shared pool. No uniqueness check against other
// players' picks — see this file's header comment on why that's correct
// here, unlike the guessing phase below.
export async function submitRemixPick(gameId, round, playerId, superlative) {
  const res = await storageUpdate(gameId, remixKey(round), (fresh) => {
    if (!fresh || fresh.status !== "picking") return fresh; // round doesn't exist, or picking's already closed
    return { ...fresh, picks: { ...fresh.picks, [playerId]: superlative } };
  });
  return { ok: res.ok };
}

// Moves "picking" -> "reveal" the moment every approved player has
// picked, or immediately if `force` is set — same reasoning/race-safety
// as lib/stereoTypesASide.js's maybeAdvanceASideToReveal (every
// connected client calls this opportunistically; db.update's CAS makes
// whichever call actually flips the status the only one that matters).
export async function maybeAdvanceRemixToReveal(gameId, round, { force = false } = {}) {
  const res = await storageUpdate(gameId, remixKey(round), (fresh) => {
    if (!fresh || fresh.status !== "picking") return fresh;
    const submitterIds = Object.keys(fresh.picks || {});
    const allSubmitted = (fresh.playerIds || []).every((pid) => submitterIds.includes(pid));
    if (!allSubmitted && !force) return fresh;
    if (submitterIds.length === 0) return fresh; // nothing to reveal — nobody picked at all
    return { ...fresh, status: "reveal", revealStartedAt: Date.now(), anonMap: buildAnonMap(submitterIds) };
  });
  return res.value;
}

// A player submitting (or changing, up until the round leaves "reveal")
// their own guesses — same shape/trust level as
// lib/stereoTypesASide.js's submitASideGuesses.
export async function submitRemixGuesses(gameId, round, guesserId, assignments, pumpedLabel) {
  const res = await storageUpdate(gameId, remixKey(round), (fresh) => {
    if (!fresh || fresh.status !== "reveal") return fresh;
    return {
      ...fresh,
      guesses: { ...fresh.guesses, [guesserId]: { assignments, pumpedLabel: pumpedLabel || null, submittedAt: Date.now() } },
    };
  });
  return { ok: res.ok };
}

// ─── Pure scoring function ───
// Same shape/self-guess exclusion as lib/stereoTypesASide.js's
// computeASideScores (read that function's own comment for the full
// reasoning — it applies unchanged here), with this round's point
// values DOUBLED per the spec:
//   - 2 points (guesser's own tally) for each other player's pair you
//     correctly identify, 4 instead of 2 if that was your pumped guess.
//   - 2 points (owner's own tally) for every player who correctly
//     guessed YOUR pair — flat, regardless of whether that guess was
//     pumped, exactly like Round 1's flat "everyone who guesses yours"
//     point.
//   - Guessing your own pair correctly scores nothing extra either way.
function computeRemixScores(state) {
  const perPlayer = {};
  (state.playerIds || []).forEach((pid) => {
    perPlayer[pid] = {
      pointsFromGuessing: 0,
      pointsFromBeingGuessed: 0,
      totalPoints: 0,
      pumpedCorrect: null,
      guessResults: {},
      guessedCorrectlyBy: [],
    };
  });

  const anonMap = state.anonMap || {};
  Object.keys(perPlayer).forEach((guesserId) => {
    const g = state.guesses?.[guesserId];
    const assignments = g?.assignments || {};
    Object.entries(anonMap).forEach(([anonLabel, actualPlayerId]) => {
      if (actualPlayerId === guesserId) return; // never scored on the guessing side, right or wrong
      const guessedPlayerId = assignments[anonLabel];
      const isCorrect = !!guessedPlayerId && guessedPlayerId === actualPlayerId;
      perPlayer[guesserId].guessResults[actualPlayerId] = isCorrect;
      const isPumped = !!g && g.pumpedLabel === anonLabel;
      if (isCorrect) {
        perPlayer[guesserId].pointsFromGuessing += isPumped ? 4 : 2;
        perPlayer[actualPlayerId].pointsFromBeingGuessed += 2;
        perPlayer[actualPlayerId].guessedCorrectlyBy.push(guesserId);
        if (isPumped) perPlayer[guesserId].pumpedCorrect = true;
      } else if (isPumped) {
        perPlayer[guesserId].pumpedCorrect = false;
      }
    });
  });

  Object.values(perPlayer).forEach((p) => { p.totalPoints = p.pointsFromGuessing + p.pointsFromBeingGuessed; });
  return perPlayer;
}

// ─── Race-condition-safe scoring, same pattern as
// lib/stereoTypesASide.js's maybeScoreASide — see that function's own
// (lengthy, and unchanged-in-spirit here) comment for the full reasoning
// on why this is a CAS-retry recompute rather than a SECURITY DEFINER
// RPC. Not re-explained in depth here; only the numbers differ.
export async function maybeScoreRemix(gameId, round, { force = false } = {}) {
  const computeToken = `${Date.now()}:${Math.random().toString(36).slice(2)}`;

  const res = await storageUpdate(gameId, remixKey(round), (fresh) => {
    if (!fresh || fresh.status !== "reveal") return fresh; // nothing to score, or already scored and moved past reveal
    if (fresh.result) return fresh; // already scored — no-op

    const allGuessed = (fresh.playerIds || []).every((pid) => !!fresh.guesses?.[pid]);
    if (!allGuessed && !force) return fresh; // still waiting on someone — try again later

    let effective = fresh;
    if (!allGuessed && force) {
      const filledGuesses = { ...fresh.guesses };
      (fresh.playerIds || []).forEach((pid) => {
        if (!filledGuesses[pid]) filledGuesses[pid] = { assignments: {}, pumpedLabel: null };
      });
      effective = { ...fresh, guesses: filledGuesses };
    }

    const perPlayer = computeRemixScores(effective);
    // status flips to "scored" in this SAME write — closes the guess-
    // editing window the same way maybeScoreASide's identical write does.
    return { ...fresh, status: "scored", result: { computeToken, computedAt: Date.now(), perPlayer } };
  });

  if (!res.ok || !res.value?.result) return null;
  if (res.value.result.computeToken !== computeToken) return res.value.result; // we lost the race — nothing else for THIS call to do

  // We won — persist the summable ledger. persistRemixRoundScores is a
  // plain upsert, safe to also fire (redundantly, harmlessly) from any
  // later client — see that function's own comment.
  await persistRemixRoundScores(gameId, round, res.value.result.perPlayer);
  return res.value.result;
}

// Persists this round's point totals into the same durable,
// cross-round-summable ledger Round 1 uses
// (sql/add-stereo-types-a-side.sql's stereo_types_round_scores) — just
// with round = 2 rows. That table's own schema/RLS were already designed
// with exactly this reuse in mind (see that migration's own closing
// comment), so no new migration is needed for Round 2. A plain upsert,
// deliberately safe to call more than once and from more than one
// client — see lib/stereoTypesASide.js's persistASideRoundScores for the
// full reasoning, which applies unchanged here.
export async function persistRemixRoundScores(gameId, round, perPlayer) {
  const rows = Object.entries(perPlayer || {}).map(([playerId, p]) => ({
    game_id: gameId,
    round,
    player_id: playerId,
    points: p.totalPoints,
  }));
  if (rows.length === 0) return { ok: true };
  const { error } = await supabase.from("stereo_types_round_scores").upsert(rows, { onConflict: "game_id,round,player_id" });
  if (error) {
    console.error("Stereo Types: failed to persist Round 2 scores (safe to retry later — this upsert is idempotent):", error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function getRemixRound(gameId, round) {
  return storageGet(gameId, remixKey(round));
}
