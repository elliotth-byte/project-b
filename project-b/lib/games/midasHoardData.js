import { storageSet, storageUpdate, subscribeGameState } from "../gameStorage";

// ─── Midas's Hoard — Big Screen ───
// A Greek-mythology retelling of the classic "guess the count, then
// stay or fold" estimation game (Big Brother's "Counting on the Veto"
// is the direct reference) — King Midas's vault is heaped with a
// freshly-cursed pile of golden trinkets, shown only on the TV
// (components/bigscreen/MidasHoardTvDisplay.jsx). Every living player
// privately guesses how many pieces are in the pile from their own
// phone (components/games/MidasHoardTvPlayer.jsx). Once everyone's
// guessed (or the window runs out), every guess reveals — sorted, by
// name — on the shared screen, and each guesser privately chooses to
// STAY near the hoard or FOLD back to safety.
//
// Folding is always a safe, scoreless no-op for that round. Among
// whoever stayed: the closest guess to the true count earns a point
// (first to 3 wins outright); the single farthest guess is turned to
// gold — eliminated on the spot. A dead heat for closest AND farthest
// at once (every stayer equidistant) is a wash: everyone who stayed
// scores, nobody's eliminated, rather than a self-cancelling
// contradiction. Last player never turned to gold also wins outright,
// even short of 3 points.
//
// Big-Screen-only in the same sense every other TV-exclusive battle
// here is (see lib/bigScreenOnlyGames.js) — the whole tension is
// staring at ONE shared pile together and reacting to everyone else's
// guesses appearing at once, which has no equivalent on a single
// phone screen.

const GUESS_WINDOW_MS = 25000;
const DECIDE_WINDOW_MS = 15000;
const RESOLVED_DISPLAY_MS = 6000;
export const WIN_SCORE = 3;
const MIN_COUNT = 35;
const MAX_COUNT = 90;

function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Scatters `n` coins into a rough pile shape (denser and wider toward
// the bottom, tapering near the top) rather than a uniform random
// field — reads as "a heaped pile," not "confetti," which matters
// here since the whole point is that it LOOKS like a pile you'd have
// to estimate, not a grid you could just count.
function pileScatter(n, rng) {
  const items = [];
  for (let i = 0; i < n; i++) {
    const t = rng(); // 0 (near the peak) .. 1 (the base)
    const y = 28 + t * 66;
    const spread = 8 + t * 42;
    const x = 50 + (rng() * 2 - 1) * spread;
    items.push({ x: Math.max(3, Math.min(97, x)), y });
  }
  return items;
}

function generateShowcase(rng) {
  const targetCount = MIN_COUNT + Math.floor(rng() * (MAX_COUNT - MIN_COUNT + 1));
  return { targetCount, items: pileScatter(targetCount, rng) };
}

export const midasHoardKey = (round) => `pb:midashoard:${round}`;

export function subscribeMidasHoard(gameId, round, onChange) {
  return subscribeGameState(gameId, midasHoardKey(round), onChange);
}

export async function initMidasHoard(gameId, round, participants, seed, db) {
  const set = db?.set || storageSet;
  const rng = mulberry32(seed || Date.now());
  const showcase = generateShowcase(rng);
  const scores = {};
  participants.forEach((p) => { scores[p.id] = 0; });
  await set(gameId, midasHoardKey(round), {
    roundNum: 1,
    targetCount: showcase.targetCount,
    items: showcase.items,
    phase: "guessing", // "guessing" | "deciding" | "resolved"
    phaseStartedAt: Date.now(),
    aliveIds: participants.map((p) => p.id),
    guesses: {},
    decisions: {},
    scores,
    eliminatedInRound: {},
    lastOutcome: null,
    winnerId: null,
    rngState: Math.floor(rng() * 1e9),
  });
}

export async function submitHoardGuess(gameId, round, playerId, guess) {
  return storageUpdate(gameId, midasHoardKey(round), (fresh) => {
    if (!fresh || fresh.winnerId || fresh.phase !== "guessing") return fresh;
    if (!fresh.aliveIds.includes(playerId)) return fresh;
    if (fresh.guesses[playerId] != null) return fresh;
    const n = Math.round(Number(guess));
    if (!Number.isFinite(n) || n < 0) return fresh;
    return { ...fresh, guesses: { ...fresh.guesses, [playerId]: Math.min(999999, n) } };
  });
}

export async function submitHoardDecision(gameId, round, playerId, decision) {
  return storageUpdate(gameId, midasHoardKey(round), (fresh) => {
    if (!fresh || fresh.winnerId || fresh.phase !== "deciding") return fresh;
    if (!fresh.aliveIds.includes(playerId) || fresh.guesses[playerId] == null) return fresh;
    if (fresh.decisions[playerId] != null) return fresh;
    if (decision !== "stay" && decision !== "fold") return fresh;
    return { ...fresh, decisions: { ...fresh.decisions, [playerId]: decision } };
  });
}

function startNextRound(fresh, now) {
  const rng = mulberry32(fresh.rngState);
  const showcase = generateShowcase(rng);
  return {
    ...fresh,
    roundNum: fresh.roundNum + 1,
    targetCount: showcase.targetCount,
    items: showcase.items,
    phase: "guessing",
    phaseStartedAt: now,
    guesses: {},
    decisions: {},
    lastOutcome: null,
    rngState: Math.floor(rng() * 1e9),
  };
}

// The actual phase-transition logic, kept as a pure function of
// (fresh, now) — same reasoning as wagerTriviaTvData.js's identical
// split: tickMidasHoard below is just this wrapped in the standard
// storageUpdate CAS, so the transition itself can be driven from
// wherever (TV poll, phone poll, server housekeeping) without
// duplicating the rules three times.
export function midasHoardTransition(fresh, now) {
  if (!fresh || fresh.winnerId) return fresh;

  if (fresh.phase === "guessing") {
    const everyoneGuessed = fresh.aliveIds.every((id) => fresh.guesses[id] != null);
    const timedOut = now - fresh.phaseStartedAt >= GUESS_WINDOW_MS;
    if (!everyoneGuessed && !timedOut) return fresh;
    // Anyone who never guessed sits this round out entirely — same as
    // folding, just without ever having had a stake to begin with.
    return { ...fresh, phase: "deciding", phaseStartedAt: now };
  }

  if (fresh.phase === "deciding") {
    const guessedIds = fresh.aliveIds.filter((id) => fresh.guesses[id] != null);
    const everyoneDecided = guessedIds.every((id) => fresh.decisions[id] != null);
    const timedOut = now - fresh.phaseStartedAt >= DECIDE_WINDOW_MS;
    if (!everyoneDecided && !timedOut) return fresh;

    const decisions = { ...fresh.decisions };
    guessedIds.forEach((id) => { if (decisions[id] == null) decisions[id] = "fold"; }); // indecision defaults to safe

    const stayers = guessedIds.filter((id) => decisions[id] === "stay");
    const scores = { ...fresh.scores };
    let eliminatedIds = [];
    let scorerIds = [];

    if (stayers.length === 1) {
      scorerIds = stayers;
    } else if (stayers.length >= 2) {
      const distances = {};
      stayers.forEach((id) => { distances[id] = Math.abs(fresh.guesses[id] - fresh.targetCount); });
      const minDist = Math.min(...stayers.map((id) => distances[id]));
      const maxDist = Math.max(...stayers.map((id) => distances[id]));
      if (minDist === maxDist) {
        // Every stayer landed exactly as close (or as far) as everyone
        // else — a real dead heat, not a bug. Treat it as a wash rather
        // than eliminating the whole stayer pool: everyone who dared to
        // stay scores, nobody's turned to gold.
        scorerIds = stayers;
      } else {
        scorerIds = stayers.filter((id) => distances[id] === minDist);
        eliminatedIds = stayers.filter((id) => distances[id] === maxDist);
      }
    }
    scorerIds.forEach((id) => { scores[id] = (scores[id] || 0) + 1; });

    const aliveIds = fresh.aliveIds.filter((id) => !eliminatedIds.includes(id));
    const eliminatedInRound = { ...fresh.eliminatedInRound };
    eliminatedIds.forEach((id) => { eliminatedInRound[id] = fresh.roundNum; });

    let winnerId = null;
    const champion = scorerIds.find((id) => scores[id] >= WIN_SCORE);
    if (champion) winnerId = champion;
    else if (aliveIds.length <= 1) winnerId = aliveIds[0] || null;

    return {
      ...fresh,
      phase: "resolved",
      phaseStartedAt: now,
      decisions,
      scores,
      aliveIds,
      eliminatedInRound,
      winnerId,
      lastOutcome: {
        targetCount: fresh.targetCount,
        guesses: Object.fromEntries(guessedIds.map((id) => [id, fresh.guesses[id]])),
        decisions,
        scorerIds,
        eliminatedIds,
      },
    };
  }

  if (fresh.phase === "resolved") {
    if (fresh.winnerId) return fresh; // terminal — game's over, nothing left to tick
    if (now - fresh.phaseStartedAt < RESOLVED_DISPLAY_MS) return fresh;
    return startNextRound(fresh, now);
  }

  return fresh;
}

export async function tickMidasHoard(gameId, round, db) {
  const update = db?.update || storageUpdate;
  const now = Date.now();
  return update(gameId, midasHoardKey(round), (fresh) => midasHoardTransition(fresh, now));
}

// Tiered so a natural win always outranks merely being alive when the
// outer challenge timer cuts things short, which in turn always
// outranks having been turned to gold — same shape as
// musicalChairsTvData.js's own placementValue. Within the "still
// alive" tier, running score is what actually matters (it's the real
// measure of standing toward the first-to-3 win condition); within
// the "eliminated" tier, a later elimination round always ranks above
// an earlier one.
export function placementValue(state, playerId) {
  if (state.winnerId === playerId) return 1000000;
  const score = state.scores?.[playerId] || 0;
  const elimRound = state.eliminatedInRound?.[playerId];
  if (elimRound != null) return 1000 + elimRound * 10 + score;
  return 100000 + score * 100 + (state.roundNum || 0);
}
