import { supabase } from "./supabaseClient";
import { storageGet, storageSet, storageUpdate, subscribeGameState } from "./gameStorage";
import { SUPERLATIVES, getSuperlativePool } from "./stereoTypesSuperlatives";

// ============================================================
// Stereo Types — Round 1, "A Side"
//
// Rules (see the actual spec for the full text this was built from):
//   1. Every approved player is dealt one random, different superlative.
//   2. Each player privately ranks every approved player (including
//      themselves) from "most" to "least" that superlative applies.
//   3. Once everyone's submitted (or the host force-advances), every
//      submitted ranking is shown to everyone, anonymized — every
//      player then guesses which real player wrote each one, as a full
//      permutation (one guess per ranking, no repeats), with exactly
//      one guess flagged "pumped" for double points if it's right.
//   4. Once everyone's submitted their guesses (or the host forces it),
//      scores are computed once, atomically, and shown to everyone.
//
// Everything for this round lives under ONE game_state row per round
// number (see aSideKey below) — same shape KEY_FATES/KEY_EXILE already
// use in lib/roundEngine.js for a single phase's entire nested state
// (nominations, votes, ...), updated via lib/dbAdapter.js's
// version-checked, retrying db.update rather than anything bespoke.
// With a handful of players in a live party game, one shared row taking
// a CAS retry now and then on a near-simultaneous submission is not a
// real bottleneck — it's the same trade this codebase already makes
// everywhere else this shape shows up.
//
// A privacy note worth being upfront about: game_state's own RLS policy
// (see sql/schema.sql) already lets EVERY approved player/host read
// every key for their game, including this one — there's no per-key
// secrecy at the database level. That's the same trust model this app
// already uses for exile votes before a reveal (lib/roundEngine.js):
// hidden by what the UI chooses to render, not by what the row itself
// contains. This file follows that same precedent rather than
// inventing a stricter, per-round-secret table just for this — a
// technically-savvy player using devtools during the ranking/guessing
// phases could see more than they're supposed to; a normal player using
// the app cannot. See this file's own components (StereoTypesASideHost/
// Player.jsx) for exactly what does and doesn't get rendered at each
// phase.
// ============================================================

export function aSideKey(round) {
  return `stereo_types:a-side:${round}`;
}

// Which round Stereo Types is currently on (0/absent = not started yet).
// This is the one deliberate extension point for Round 2 ("The Remix")
// and Round 3 ("On Blast") — neither is built yet, but whichever comes
// next just needs to set this to 2, then 3, the same way startASide
// below sets it to 1. Nothing about A Side's own logic depends on it
// being exactly 1 forever; aSideKey/round-scoped state is already
// parameterized by round number for exactly that reason.
export const KEY_STEREO_TYPES_ROUND = "stereo_types:round";

export function subscribeASideRound(gameId, round, onChange) {
  return subscribeGameState(gameId, aSideKey(round), onChange);
}

export function subscribeStereoTypesRound(gameId, onChange) {
  return subscribeGameState(gameId, KEY_STEREO_TYPES_ROUND, onChange);
}

// Local Fisher-Yates — lib/exileLogic.js and lib/characterPowers.js each
// already keep their own private copy of exactly this rather than
// sharing one; matching that precedent instead of introducing a new
// shared util module for one function.
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Deals one DIFFERENT superlative to each player, from `pool`. If the
// pool is smaller than the player count (shouldn't happen with the ~56
// seeded in lib/stereoTypesSuperlatives.js and any normal party-game
// headcount, but not something to crash over if it ever does), pool
// entries repeat rather than the deal failing — logged clearly so it's
// visible in the console/host's dev tools rather than silently handing
// two players the exact same line with no explanation anywhere.
export function dealSuperlatives(playerIds, pool = SUPERLATIVES) {
  const assignments = {};
  if (!pool || pool.length === 0) {
    // Degenerate case (empty pool) — still can't crash the round over
    // it; hand out a generic placeholder rather than leaving `undefined`
    // for the ranking UI to choke on.
    playerIds.forEach((id) => { assignments[id] = "Most likely to do literally anything"; });
    console.warn("Stereo Types: superlative pool is empty — dealt a placeholder to everyone.");
    return assignments;
  }
  if (playerIds.length > pool.length) {
    console.warn(
      `Stereo Types: superlative pool (${pool.length}) is smaller than the player count (${playerIds.length}) — some superlatives will repeat across players this round.`
    );
  }
  const shuffledPlayers = shuffle(playerIds);
  const shuffledPool = shuffle(pool);
  shuffledPlayers.forEach((id, i) => { assignments[id] = shuffledPool[i % shuffledPool.length]; });
  return assignments;
}

// "Ranking A", "Ranking B", ... — plain, stable labels with no
// information about submission order baked in (that comes from
// shuffling WHICH player lands on which label in buildAnonMap below,
// not from anything about this function itself).
export function anonLabelForIndex(i) {
  return `Ranking ${String.fromCharCode(65 + i)}`;
}

function buildAnonMap(submitterIds) {
  const shuffled = shuffle(submitterIds);
  const anonMap = {};
  shuffled.forEach((playerId, i) => { anonMap[anonLabelForIndex(i)] = playerId; });
  return anonMap;
}

// ─── Host action: deal superlatives and open the ranking phase ───
// Idempotent by construction (the db.update callback returns the
// existing round untouched if one's already there) — protects against a
// double-click, or two host/co-host tabs open at once, re-dealing
// everyone's superlative out from under a player who's already looking
// at theirs.
export async function startASide(gameId, approvedPlayers) {
  const playerIds = (approvedPlayers || []).map((p) => p.id);
  if (playerIds.length < 2) {
    return { ok: false, error: "Need at least 2 approved players to start A Side." };
  }

  // getSuperlativePool() (lib/stereoTypesSuperlatives.js) is the static
  // SUPERLATIVES list plus any admin-approved player submissions — this
  // is the one and only call site swap Phase 8 makes in this file; the
  // rest of dealSuperlatives' own default param (`pool = SUPERLATIVES`)
  // is left alone so any other caller/test that wants the raw seeded
  // list without a network round-trip still can.
  const superlatives = dealSuperlatives(playerIds, await getSuperlativePool());

  const res = await storageUpdate(gameId, aSideKey(1), (fresh) => {
    if (fresh) return fresh; // already started — leave it alone, see comment above
    return {
      round: 1,
      status: "ranking", // "ranking" -> "reveal" -> "scored"
      startedAt: Date.now(),
      playerIds, // the roster frozen at round-start; late approvals mid-round don't retroactively join THIS round
      superlatives, // { playerId: superlative text }
      rankings: {}, // { ownerId: [playerId, ...] } most -> least, filled in as players submit
      revealStartedAt: null,
      anonMap: null, // { "Ranking A": ownerId, ... } — set once, at the ranking -> reveal transition
      guesses: {}, // { guesserId: { assignments: { anonLabel: guessedPlayerId }, pumpedLabel, submittedAt } }
      result: null, // set once, atomically, by maybeScoreASide below
    };
  });

  if (res.ok) await storageSet(gameId, KEY_STEREO_TYPES_ROUND, 1);
  return { ok: res.ok };
}

// A player submitting (or re-submitting, while still in "ranking") their
// own ranking. No separate validation that `orderedPlayerIds` is a full,
// valid permutation of the round's playerIds — same trust level this
// repo already extends to other player-authored writes (see
// lib/stereoTypesStickers.js's equipSticker) — the UI is what's
// responsible for only ever constructing a valid order to send.
export async function submitASideRanking(gameId, round, playerId, orderedPlayerIds) {
  const res = await storageUpdate(gameId, aSideKey(round), (fresh) => {
    if (!fresh || fresh.status !== "ranking") return fresh; // round doesn't exist, or ranking's already closed — too late
    return { ...fresh, rankings: { ...fresh.rankings, [playerId]: orderedPlayerIds } };
  });
  return { ok: res.ok };
}

// Moves "ranking" -> "reveal" the moment every approved player (from the
// round's own frozen playerIds) has submitted, OR immediately if
// `force` is set (the host's own AFK escape hatch). Safe to call from
// every connected client every time the round state changes — same
// "idempotent-check callback + db.update's own retrying CAS is enough,
// no need to invent a single leader" reasoning lib/roundEngine.js's
// autoStartRandomChallenge relies on for the exact same class of
// problem. Whichever call actually flips the status wins; every other
// concurrent call just gets back the same already-flipped state.
//
// If NOBODY had submitted by the time a force-advance lands, there's
// nothing to reveal or ever score — refusing (leaving status as
// "ranking") rather than opening a reveal phase with zero rankings in it
// that could never produce a meaningful result.
export async function maybeAdvanceASideToReveal(gameId, round, { force = false } = {}) {
  const res = await storageUpdate(gameId, aSideKey(round), (fresh) => {
    if (!fresh || fresh.status !== "ranking") return fresh;
    const submitterIds = Object.keys(fresh.rankings || {});
    const allSubmitted = (fresh.playerIds || []).every((pid) => submitterIds.includes(pid));
    if (!allSubmitted && !force) return fresh;
    if (submitterIds.length === 0) return fresh; // nothing to reveal — see comment above
    return { ...fresh, status: "reveal", revealStartedAt: Date.now(), anonMap: buildAnonMap(submitterIds) };
  });
  return res.value;
}

// A player submitting (or changing, up until they've... actually up
// until the round leaves "reveal" — there's no separate "locked" flag
// per guesser, matching how submitASideRanking above allows resubmission
// too) their own guesses. `assignments` is { anonLabel: guessedPlayerId
// }, expected (by the UI, not re-validated here — same trust level as
// everywhere else in this file) to be a full permutation over the
// round's anonMap. `pumpedLabel` is at most one anonLabel, or null.
export async function submitASideGuesses(gameId, round, guesserId, assignments, pumpedLabel) {
  const res = await storageUpdate(gameId, aSideKey(round), (fresh) => {
    if (!fresh || fresh.status !== "reveal") return fresh;
    return {
      ...fresh,
      guesses: { ...fresh.guesses, [guesserId]: { assignments, pumpedLabel: pumpedLabel || null, submittedAt: Date.now() } },
    };
  });
  return { ok: res.ok };
}

// ─── Pure scoring function ───
// A deterministic function of the round's own already-committed state
// (rankings + guesses + anonMap) — called from INSIDE the db.update
// callback below, never from a value captured before that update runs,
// specifically so a CAS retry (triggered by a genuinely concurrent
// write landing first) always recomputes against the latest `fresh`
// rather than replaying a now-stale outer snapshot. That distinction is
// the entire ballgame for correctness under concurrency here.
//
// Scoring, matching the spec's own wording closely:
//   - "1 point for each other right list you guess" — the guessER's own
//     tally, and ONLY for other players' rankings; guessing your own
//     ranking correctly (you're in the pool same as everyone) scores
//     nothing on the guessing side, win or lose.
//   - "1 point for everyone who guesses yours" — the OWNER's own tally,
//     a flat point per correct guesser, regardless of whether that
//     guesser had this particular guess pumped.
//   - "Pump up the volume" doubles ONLY the guesser's own point for that
//     one guess (2 instead of 1) if it's right — the spec's "which will
//     give YOU 2 points" scopes the bonus to the guesser, not the person
//     being guessed, so the owner's flat point above is unaffected by
//     whether the correct guess happened to be pumped.
// A guesser who never submitted at all (only possible via a host force-
// score — see maybeScoreASide) is treated as an empty ballot: 0 points
// from guessing, but still fully eligible to be guessed correctly by
// everyone else, same as anyone else whose ranking got submitted.
function computeASideScores(state) {
  const perPlayer = {};
  (state.playerIds || []).forEach((pid) => {
    perPlayer[pid] = {
      pointsFromGuessing: 0,
      pointsFromBeingGuessed: 0,
      totalPoints: 0,
      pumpedCorrect: null, // null = didn't pump anything (or never guessed at all); true/false once they did
      guessResults: {}, // { otherPlayerId: boolean } — did THIS player correctly identify otherPlayerId's ranking
      guessedCorrectlyBy: [], // [playerId, ...] — who correctly identified THIS player's own ranking
    };
  });

  const anonMap = state.anonMap || {};
  Object.keys(perPlayer).forEach((guesserId) => {
    const g = state.guesses?.[guesserId];
    const assignments = g?.assignments || {};
    Object.entries(anonMap).forEach(([anonLabel, actualPlayerId]) => {
      if (actualPlayerId === guesserId) return; // never scored on the guessing side, right or wrong — see comment above
      const guessedPlayerId = assignments[anonLabel];
      const isCorrect = !!guessedPlayerId && guessedPlayerId === actualPlayerId;
      perPlayer[guesserId].guessResults[actualPlayerId] = isCorrect;
      const isPumped = !!g && g.pumpedLabel === anonLabel;
      if (isCorrect) {
        perPlayer[guesserId].pointsFromGuessing += isPumped ? 2 : 1;
        perPlayer[actualPlayerId].pointsFromBeingGuessed += 1;
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

// ─── The one genuinely tricky correctness problem in this round ───
// "Once ALL players have submitted their guesses, compute scores" has a
// real race if done naively from an arbitrary client the instant it
// personally observes everyone's in: two players' browsers can both see
// "everyone's submitted" within the same instant (both watching the same
// realtime update) and both try to score at once. Rather than reaching
// for a SECURITY DEFINER RPC choke point, this follows the exact pattern
// lib/roundEngine.js's autoStartRandomChallenge already established for
// this same class of problem in this codebase: lib/dbAdapter.js's
// db.update is a real version-checked, retrying CAS — so making the
// updater callback itself (a) recompute from the fresh value it's
// handed rather than a value captured outside it, and (b) a no-op if
// `fresh.result` is already set, is enough to guarantee EXACTLY ONE
// caller's write actually lands with a fresh computation, with every
// other concurrent caller safely retrying against that same fact and
// backing off. A random `computeToken` on the result (same trick as
// autoStartRandomChallenge's `startToken`) is how THIS specific call
// tells whether it was the one that actually won, vs. one that lost the
// race and got back a winner's value it didn't write itself — that
// distinction matters below for deciding who additionally persists the
// summable stereo_types_round_scores rows, so that doesn't happen twice.
//
// `force` (host-only escape hatch, matching maybeAdvanceASideToReveal's
// own) scores with whatever guesses exist, treating anyone who never
// submitted as an empty ballot — see computeASideScores's own comment on
// exactly what that means for their points.
//
// Not gated on this being called by the host or by any particular
// player — every connected client calls this opportunistically whenever
// the round state changes (see StereoTypesASideHost/Player.jsx), the
// same "nobody needs to be watching for it to happen" ethos
// lib/roundEngine.js uses throughout.
export async function maybeScoreASide(gameId, round, { force = false } = {}) {
  const computeToken = `${Date.now()}:${Math.random().toString(36).slice(2)}`;

  const res = await storageUpdate(gameId, aSideKey(round), (fresh) => {
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

    const perPlayer = computeASideScores(effective);
    // status flips to "scored" in this SAME write, not a separate one —
    // that's also what closes the guess-editing window: once this
    // lands, submitASideGuesses's own `fresh.status !== "reveal"` guard
    // starts rejecting any further guess edits, so nothing can mutate
    // the inputs out from under a result that's already been computed
    // and committed.
    return { ...fresh, status: "scored", result: { computeToken, computedAt: Date.now(), perPlayer } };
  });

  if (!res.ok || !res.value?.result) return null;
  if (res.value.result.computeToken !== computeToken) return res.value.result; // we lost the race — someone else's write won; nothing else for THIS call to do

  // We won — this is the one call responsible for also persisting the
  // summable ledger. persistASideRoundScores below is a plain upsert,
  // safe to also fire (redundantly, harmlessly) from any later client
  // that observes a finalized result but somehow finds no rows yet (see
  // that function's own comment) — this isn't the ONLY thing that can
  // ever write it, just the first and most common one.
  await persistASideRoundScores(gameId, round, res.value.result.perPlayer);
  return res.value.result;
}

// Persists this round's point totals into the durable, cross-round-
// summable ledger (sql/add-stereo-types-a-side.sql's
// stereo_types_round_scores) — game_state itself is the live/working
// copy for THIS round only; nothing about it is designed to be summed
// across Round 2/3 later, which the spec explicitly asks this data model
// to support eventually.
//
// A plain upsert keyed on (game_id, round, player_id) — deliberately
// safe to call more than once, and from more than one client: whoever's
// browser first observes a finalized `result` (almost always immediately
// after maybeScoreASide's own winning call, but also any client that
// loads the results screen later, in case that original write somehow
// never made it — see this file's own header comment on why this file
// doesn't reach for a single-leader RPC) can call this and it'll write
// the exact same values either way.
export async function persistASideRoundScores(gameId, round, perPlayer) {
  const rows = Object.entries(perPlayer || {}).map(([playerId, p]) => ({
    game_id: gameId,
    round,
    player_id: playerId,
    points: p.totalPoints,
  }));
  if (rows.length === 0) return { ok: true };
  const { error } = await supabase.from("stereo_types_round_scores").upsert(rows, { onConflict: "game_id,round,player_id" });
  if (error) {
    console.error("Stereo Types: failed to persist round scores (safe to retry later — this upsert is idempotent):", error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function getASideRound(gameId, round) {
  return storageGet(gameId, aSideKey(round));
}
