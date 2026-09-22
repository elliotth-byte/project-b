import { storageSet, storageUpdate, subscribeGameState } from "../gameStorage";
import { TRIVIA_CATEGORIES, DIFFICULTY_POINTS } from "./triviaData";

// ─── Wager Trivia — Big Screen ───
// The category and difficulty are revealed on the TV BEFORE the
// question itself — every player privately opts in or stays safe on
// their own phone, blind to what the actual question will be. Once
// everyone's decided (or the window runs out), the question reveals,
// but only players who opted in actually answer it: get it right and
// gain that difficulty's points, get it wrong (or never answer at all)
// and lose them. Staying "out" is always a safe, permanent 0 for that
// round — the entire tension is deciding to opt in on stakes alone,
// before you know if the question is one you'd actually know.
//
// Deliberately continuous, like lib/games/laurelThiefData.js — there's
// no winner state, no elimination, just as many rounds as the Battle's
// own timer allows, each phone/TV independently polling tickWagerTrivia
// to advance whichever phase is due (same belt-and-suspenders pattern
// as every other shared timed battle here — see e.g.
// lib/games/simonTvData.js's own header comment for why both the
// client-side poll AND the server-side housekeeping mirror call both
// exist side by side).
const DIFFICULTIES = ["easy", "medium", "hard"];

function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Re-orders a question's options (Fisher-Yates via the shared rng) so
// the same underlying question doesn't always show its answer in the
// same position — returns a fresh { options, answer } pair, the
// original TRIVIA_CATEGORIES entries are never mutated.
function shuffleOptions(original, rng) {
  const order = original.options.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const options = order.map((i) => original.options[i]);
  const answer = order.indexOf(original.answer);
  return { options, answer };
}

// Picks a category+difficulty combo not yet used this battle where
// possible — once every combo has been used at least once, the used
// set resets so the pool never just dries up mid-battle (a battle can
// run far longer than TRIVIA_CATEGORIES.length * 3 rounds).
function pickRound(usedKeys, rng) {
  const allKeys = [];
  TRIVIA_CATEGORIES.forEach((cat) => DIFFICULTIES.forEach((d) => allKeys.push(`${cat.category}:${d}`)));
  let pool = allKeys.filter((k) => !usedKeys.includes(k));
  let resetUsed = false;
  if (pool.length === 0) { pool = allKeys; resetUsed = true; }
  const key = pool[Math.floor(rng() * pool.length)];
  const [categoryName, difficulty] = key.split(":");
  const cat = TRIVIA_CATEGORIES.find((c) => c.category === categoryName);
  const original = cat[difficulty];
  const { options, answer } = shuffleOptions(original, rng);
  return { key, category: cat.category, difficulty, question: { q: original.q, options, answer }, resetUsed };
}

const DECIDING_WINDOW_MS = 12000;
const ANSWERING_WINDOW_MS = 15000;
const RESOLVED_DISPLAY_MS = 3500;

export const wagerTriviaTvKey = (round) => `pb:wagertriviatv:${round}`;

export function subscribeWagerTrivia(gameId, round, onChange) {
  return subscribeGameState(gameId, wagerTriviaTvKey(round), onChange);
}

export async function initWagerTrivia(gameId, round, participants, seed, db) {
  const set = db?.set || storageSet;
  const rng = mulberry32(seed || Date.now());
  const scores = {};
  participants.forEach((p) => { scores[p.id] = 0; });
  const picked = pickRound([], rng);
  await set(gameId, wagerTriviaTvKey(round), {
    participantIds: participants.map((p) => p.id),
    scores,
    subRound: 1,
    usedKeys: [picked.key],
    category: picked.category,
    difficulty: picked.difficulty,
    question: picked.question,
    phase: "deciding", // "deciding" | "answering" | "resolved"
    phaseStartedAt: Date.now(),
    decisions: {}, // playerId -> "in" | "out"
    answers: {}, // playerId -> optionIndex
    lastOutcome: null,
    rngState: Math.floor(rng() * 1e9),
  });
}

export async function submitDecision(gameId, round, playerId, decision) {
  return storageUpdate(gameId, wagerTriviaTvKey(round), (fresh) => {
    if (!fresh || fresh.phase !== "deciding") return fresh;
    if (fresh.decisions[playerId]) return fresh; // already decided this sub-round
    if (decision !== "in" && decision !== "out") return fresh;
    return { ...fresh, decisions: { ...fresh.decisions, [playerId]: decision } };
  });
}

export async function submitAnswer(gameId, round, playerId, optionIndex) {
  return storageUpdate(gameId, wagerTriviaTvKey(round), (fresh) => {
    if (!fresh || fresh.phase !== "answering") return fresh;
    if (fresh.decisions[playerId] !== "in") return fresh; // never opted in
    if (fresh.answers[playerId] != null) return fresh; // already answered
    return { ...fresh, answers: { ...fresh.answers, [playerId]: optionIndex } };
  });
}

// Builds the next sub-round in place on an already-mutable-looking
// (but never actually mutated — always spread) fresh state, resetting
// per-round fields and advancing subRound/usedKeys. Pulled out as its
// own helper since both the "nobody opted in, skip straight through"
// path in the deciding phase and the normal resolved -> next path both
// need to do exactly this.
function startNextRound(fresh, now) {
  const rng = mulberry32(fresh.rngState);
  const picked = pickRound(fresh.usedKeys, rng);
  return {
    ...fresh,
    subRound: fresh.subRound + 1,
    usedKeys: picked.resetUsed ? [picked.key] : [...fresh.usedKeys, picked.key],
    category: picked.category,
    difficulty: picked.difficulty,
    question: picked.question,
    phase: "deciding",
    phaseStartedAt: now,
    decisions: {},
    answers: {},
    lastOutcome: null,
    rngState: Math.floor(rng() * 1e9),
  };
}

// The actual phase-transition logic, kept as a pure function of
// (fresh, now) so it can be exercised directly by a standalone test
// script with zero mocking — tickWagerTrivia below is just this
// wrapped in the standard storageUpdate CAS.
export function wagerTriviaTransition(fresh, now) {
  if (!fresh) return fresh;

  if (fresh.phase === "deciding") {
    const allIds = fresh.participantIds || [];
    const everyoneDecided = allIds.length > 0 && allIds.every((id) => fresh.decisions[id] != null);
    const timedOut = now - fresh.phaseStartedAt >= DECIDING_WINDOW_MS;
    if (!everyoneDecided && !timedOut) return fresh;

    // Anyone who never decided defaults to "out" — staying safe is the
    // do-nothing outcome, not a penalty, so this is a pure default fill
    // rather than anything scored.
    const decisions = { ...fresh.decisions };
    allIds.forEach((id) => { if (decisions[id] == null) decisions[id] = "out"; });

    const inIds = allIds.filter((id) => decisions[id] === "in");
    if (inIds.length === 0) {
      // Nobody opted in — nothing to answer, no outcome worth showing;
      // skip straight to the next sub-round rather than sitting on an
      // empty "answering" phase no one can act on.
      return startNextRound({ ...fresh, decisions }, now);
    }

    return { ...fresh, decisions, phase: "answering", phaseStartedAt: now };
  }

  if (fresh.phase === "answering") {
    const inIds = (fresh.participantIds || []).filter((id) => fresh.decisions[id] === "in");
    const everyoneAnswered = inIds.every((id) => fresh.answers[id] != null);
    const timedOut = now - fresh.phaseStartedAt >= ANSWERING_WINDOW_MS;
    if (!everyoneAnswered && !timedOut) return fresh;

    const points = DIFFICULTY_POINTS[fresh.difficulty] || 0;
    const correctIndex = fresh.question.answer;
    const scores = { ...fresh.scores };
    const results = {};
    inIds.forEach((id) => {
      const optionIndex = fresh.answers[id]; // undefined if they opted in but never answered — counts as wrong, not a pass
      const correct = optionIndex === correctIndex;
      const delta = correct ? points : -points;
      scores[id] = (scores[id] || 0) + delta;
      results[id] = { optionIndex: optionIndex ?? null, correct, delta };
    });

    return {
      ...fresh,
      scores,
      phase: "resolved",
      phaseStartedAt: now,
      lastOutcome: { category: fresh.category, difficulty: fresh.difficulty, correctIndex, question: fresh.question.q, results },
    };
  }

  if (fresh.phase === "resolved") {
    if (now - fresh.phaseStartedAt < RESOLVED_DISPLAY_MS) return fresh;
    return startNextRound(fresh, now);
  }

  return fresh;
}

export async function tickWagerTrivia(gameId, round, db) {
  const update = db?.update || storageUpdate;
  const now = Date.now();
  return update(gameId, wagerTriviaTvKey(round), (fresh) => wagerTriviaTransition(fresh, now));
}

// Deliberately no floor at 0 and no "alive" offset the way eliminated-
// vs-surviving games need (see e.g. lib/games/simonTvData.js's own
// placementValue) — Wager Trivia has no elimination at all, it's a
// pure running score for as long as the Battle's timer allows, exactly
// like lib/games/laurelThiefData.js's own placementValue. Negative
// scores are a real, intended outcome (opting into hard questions and
// missing them costs more than easy ones), and ranking by raw score
// handles that correctly with no special-casing needed.
export function placementValue(state, playerId) {
  return state.scores?.[playerId] || 0;
}
