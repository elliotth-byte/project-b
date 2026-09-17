import { storageSet, storageUpdate, subscribeGameState } from "../gameStorage";
import { TRIVIA_CATEGORIES } from "./triviaData";

// ─── Musical Chairs — Big Screen ───
// A completely different mechanic from the existing musicalchairs
// (see lib/games/musicalChairsData.js) — that one is the literal
// "music plays, then stops, grab a chair" game. This is a trivia-based
// version that keeps only the actual THEME (one fewer chair than
// players still standing, whoever doesn't get one is out) and
// replaces the physical scramble with a race to answer correctly: one
// shared question shown on the TV each round
// (components/bigscreen/MusicalChairsTvDisplay.jsx), several answer
// options on every phone, first N correct answers claim the N
// available chairs, a wrong answer locks that phone out for a few
// seconds before it can try again. Its own game type
// (musicalchairstv) for the same reason every other Big Screen variant
// in this app is — the underlying mechanic (a claimable, limited-slot
// resource under time pressure) has no real equivalent in the
// original at all.
export const musicalChairsTvKey = (round) => `pb:musicalchairstv:${round}`;

export function subscribeMusicalChairsTv(gameId, round, onChange) {
  return subscribeGameState(gameId, musicalChairsTvKey(round), onChange);
}

// How long a wrong answer locks a phone out before it can try again —
// "a few seconds" from the original request, made concrete.
export const WRONG_ANSWER_LOCKOUT_MS = 3000;

// Same target-turns-into-a-window approach as every other timed
// shared-state battle in this app (see lib/games/torchedData.js's own
// matching constants) — this is the ceiling on how long a single
// round can run before the timeout fallback below eliminates whoever
// still hasn't claimed a chair, not a per-question timer a player sees
// counting down (there isn't one shown — the real pressure is the
// chairs running out, the same way it is in the physical game).
const TARGET_ROUNDS_ESTIMATE = 15;
const MIN_ROUND_SEC = 15;
const MAX_ROUND_SEC = 60;

export function musicalChairsRoundWindowMs(challengeDurationSec) {
  const totalSec = challengeDurationSec || 360;
  return Math.max(MIN_ROUND_SEC, Math.min(MAX_ROUND_SEC, totalSec / TARGET_ROUNDS_ESTIMATE)) * 1000;
}

function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Flattened pool of every difficulty's question across every category
// — a shared trivia round has no reason to track difficulty
// progression the way the original single-player trivia game does
// (lib/games/triviaData.js's own DIFFICULTY_POINTS), it just needs a
// large, varied pool to draw from without repeats.
const ALL_QUESTIONS = TRIVIA_CATEGORIES.flatMap((c) => [c.easy, c.medium, c.hard]);

function pickQuestion(usedIndexes, rng) {
  const available = ALL_QUESTIONS.map((_, i) => i).filter((i) => !usedIndexes.includes(i));
  const pool = available.length > 0 ? available : ALL_QUESTIONS.map((_, i) => i); // exhausted — reopen the full pool rather than getting stuck
  const idx = pool[Math.floor(rng() * pool.length)];
  const original = ALL_QUESTIONS[idx];
  // Shuffle option order per draw, same reasoning as
  // pickTriviaCategories' own shuffleQ — the correct answer shouldn't
  // sit in a predictable position.
  const order = original.options.map((_, i) => i).sort(() => rng() - 0.5);
  return { index: idx, q: original.q, options: order.map((i) => original.options[i]), answer: order.indexOf(original.answer) };
}

export async function initMusicalChairsTv(gameId, round, participants, seed, db) {
  const set = db?.set || storageSet;
  const rng = mulberry32(seed || Date.now());
  const question = pickQuestion([], rng);
  const playerProgress = {};
  participants.forEach((p) => { playerProgress[p.id] = { alive: true, status: "answering", lockedUntil: null }; });
  await set(gameId, musicalChairsTvKey(round), {
    roundNum: 1,
    question,
    usedQuestionIndexes: [question.index],
    chairsThisRound: Math.max(1, participants.length - 1),
    chairsClaimed: [],
    playerProgress,
    eliminatedInRound: {},
    roundStartedAt: Date.now(),
    winnerId: null,
    rngState: Math.floor(rng() * 1e9),
  });
}

// A correct answer claims a chair only if one's actually still open —
// arriving at the right answer after every chair is already taken is
// exactly the "too slow" case the physical game itself has (being
// right doesn't save you if you're not fast enough to reach an open
// seat). A wrong answer never eliminates on its own — it just starts
// this player's own lockout clock; running out of chairs (or the
// round's own timeout) is the only thing that actually eliminates
// anyone, via resolveMusicalChairsRound below.
export async function submitMusicalChairsAnswer(gameId, round, playerId, answerIdx) {
  return storageUpdate(gameId, musicalChairsTvKey(round), (fresh) => {
    if (!fresh || fresh.winnerId) return fresh;
    const progress = fresh.playerProgress[playerId];
    if (!progress || !progress.alive || progress.status !== "answering") return fresh;
    if (progress.lockedUntil && Date.now() < progress.lockedUntil) return fresh; // still locked out from a prior wrong answer

    if (answerIdx === fresh.question.answer) {
      if (fresh.chairsClaimed.includes(playerId) || fresh.chairsClaimed.length >= fresh.chairsThisRound) return fresh; // no chair left to claim
      return {
        ...fresh,
        chairsClaimed: [...fresh.chairsClaimed, playerId],
        playerProgress: { ...fresh.playerProgress, [playerId]: { ...progress, status: "safe", lockedUntil: null } },
      };
    }
    return { ...fresh, playerProgress: { ...fresh.playerProgress, [playerId]: { ...progress, lockedUntil: Date.now() + WRONG_ANSWER_LOCKOUT_MS } } };
  });
}

// Called on a poll (see components/bigscreen/MusicalChairsTvDisplay.jsx
// and lib/roundEngine.js's own housekeeping mirror, same belt-and-
// suspenders pattern as every other shared timed game here) — resolves
// the instant every available chair is claimed, or once the round's
// own window runs out, whichever comes first.
export async function resolveMusicalChairsRound(gameId, round, settings, db) {
  const update = db?.update || storageUpdate;
  return update(gameId, musicalChairsTvKey(round), (fresh) => {
    if (!fresh || fresh.winnerId) return fresh;
    const allChairsClaimed = fresh.chairsClaimed.length >= fresh.chairsThisRound;
    const timedOut = fresh.roundStartedAt != null && Date.now() - fresh.roundStartedAt >= musicalChairsRoundWindowMs(settings?.challengeDurationSec);
    if (!allChairsClaimed && !timedOut) return fresh;

    const nextProgress = { ...fresh.playerProgress };
    const nextEliminated = { ...fresh.eliminatedInRound };
    Object.entries(fresh.playerProgress).forEach(([id, p]) => {
      if (p.alive && p.status !== "safe") {
        nextProgress[id] = { ...p, alive: false, status: "eliminated" };
        nextEliminated[id] = fresh.roundNum;
      }
    });

    const survivors = Object.entries(nextProgress).filter(([, p]) => p.alive).map(([id]) => id);
    if (survivors.length <= 1) {
      return { ...fresh, playerProgress: nextProgress, eliminatedInRound: nextEliminated, winnerId: survivors.length === 1 ? survivors[0] : null };
    }

    const rng = mulberry32(fresh.rngState);
    const nextQuestion = pickQuestion(fresh.usedQuestionIndexes, rng);
    survivors.forEach((id) => { nextProgress[id] = { alive: true, status: "answering", lockedUntil: null }; });

    return {
      ...fresh,
      roundNum: fresh.roundNum + 1,
      question: nextQuestion,
      usedQuestionIndexes: [...fresh.usedQuestionIndexes, nextQuestion.index],
      chairsThisRound: Math.max(1, survivors.length - 1),
      chairsClaimed: [],
      playerProgress: nextProgress,
      eliminatedInRound: nextEliminated,
      roundStartedAt: Date.now(),
      rngState: Math.floor(rng() * 1e9),
    };
  });
}

// Same tie-aware shape as every other Big Screen elimination game here
// — see lib/games/torchedData.js's own placementValue comment for why
// 1000 + roundNum needs no extra offset to always outrank a past
// elimination, and why same-round eliminations correctly tie.
export function placementValue(state, playerId) {
  if (state.winnerId === playerId) return 100000;
  const elimRound = state.eliminatedInRound?.[playerId];
  if (elimRound != null) return 1000 + elimRound;
  if (state.playerProgress?.[playerId]?.alive) return 1000 + state.roundNum;
  return 0;
}
