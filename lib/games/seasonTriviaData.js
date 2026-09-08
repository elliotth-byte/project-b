import { GAME_REGISTRY } from "../challenges/registry";

// ─── Season Trivia ───
// A quiz about THIS season, not a general-knowledge bank — every
// question is generated from the game's own real history
// (challengeHistory/exileHistory, already fetched client-side same as
// everywhere else that reads them). Same deterministic-content-for-
// everyone approach as components/games/HermesGraspPlayer.jsx: the
// question SET is picked once, seeded off challenge.startedAt, so
// every player gets the identical quiz, then each answers it
// independently at their own pace — no shared game_state, no
// host/roundEngine wiring, same as any other simple solo battle.
//
// Deliberately locks the Ceremony tab while it's running (see
// lib/challenges/registry.js's locksCeremonyTab and pages/play.jsx's
// own handling of it) — the Ceremony tab's recap would trivially hand
// out half these answers otherwise.

const MIN_QUESTIONS = 3;
export const MAX_QUESTIONS = 10;

function seededRandom(seed) {
  let s = seed || 1;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

function shuffle(arr, seed) {
  const rand = seededRandom(seed);
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// The full set of questions THIS season's history can actually
// support right now — three types, each independently checked for
// having enough real distinct wrong answers to be a fair multiple-
// choice question (never fewer than 3 real distractors; never a
// fabricated one). A brand-new season with little or no history yet
// will come back with a short or empty pool — see hasEnoughHistory,
// which is exactly what gates this off in random-mode selection (see
// lib/challenges/selection.js) and shows a graceful "not enough
// history yet" screen for a manual host start too.
export function buildQuestionPool(challengeHistory, exileHistory, players) {
  const byId = new Map((players || []).map((p) => [p.id, p.display_name || p.name]));
  const allPlayerIds = (players || []).map((p) => p.id);
  const pool = [];

  (challengeHistory || []).forEach((entry) => {
    if (entry.winnerId && byId.has(entry.winnerId)) {
      const distractors = allPlayerIds.filter((id) => id !== entry.winnerId);
      if (distractors.length >= 3) {
        pool.push({ type: "battle-winner", round: entry.round, correctId: entry.winnerId, distractorIds: distractors });
      }
    }
  });

  const playedTypes = [...new Set((challengeHistory || []).map((e) => e.gameType).filter((g) => g && g !== "manual" && GAME_REGISTRY[g]))];
  (challengeHistory || []).forEach((entry) => {
    if (!entry.gameType || entry.gameType === "manual" || !GAME_REGISTRY[entry.gameType]) return;
    const otherTypes = playedTypes.filter((g) => g !== entry.gameType);
    if (otherTypes.length >= 3) {
      pool.push({ type: "battle-game", round: entry.round, correctType: entry.gameType, distractorTypes: otherTypes });
    }
  });

  (exileHistory || []).forEach((entry) => {
    const exiled = entry.exiledIds || [];
    if (exiled.length === 1 && byId.has(exiled[0])) {
      const distractors = allPlayerIds.filter((id) => id !== exiled[0]);
      if (distractors.length >= 3) {
        pool.push({ type: "round-exile", round: entry.round, correctId: exiled[0], distractorIds: distractors });
      }
    }
  });

  return pool;
}

export function hasEnoughHistory(challengeHistory, exileHistory, players) {
  return buildQuestionPool(challengeHistory, exileHistory, players || []).length >= MIN_QUESTIONS;
}

// A lighter-weight version of the same check for the RANDOM-selection
// gate (lib/challenges/selection.js), which doesn't have a `players`
// list on hand at that point in the call chain — counts qualifying
// history entries directly rather than building the full pool
// (distractor-availability needs the roster to verify precisely, but
// "have at least a few historical rounds with a recorded winner or
// exile at all" is a fair, cheap proxy: with fewer real players than
// that many distractors would need anyway, this game wouldn't have
// been offered in the first place).
export function hasEnoughHistoryForSelection(challengeHistory, exileHistory) {
  const winners = (challengeHistory || []).filter((e) => e.winnerId).length;
  const gameTypes = new Set((challengeHistory || []).map((e) => e.gameType).filter((g) => g && g !== "manual"));
  const exiles = (exileHistory || []).filter((e) => (e.exiledIds || []).length === 1).length;
  return winners + gameTypes.size + exiles >= MIN_QUESTIONS;
}

// Builds the actual quiz: picks up to MAX_QUESTIONS from the pool
// using poolSeed (shared — every player gets the same QUESTION SET,
// same as any other "identical content for everyone" battle in this
// app), then generates each one's 4 shuffled options using presentSeed
// (typically per-player — see SeasonTriviaPlayer.jsx) so the multiple-
// choice ORDER isn't identical across every screen, the same
// "can't just shout the letter" reasoning any real trivia night has.
export function buildQuestions(pool, poolSeed, presentSeed, byId) {
  const chosen = shuffle(pool, poolSeed).slice(0, MAX_QUESTIONS);
  return chosen.map((q, i) => {
    const qSeed = presentSeed + i * 9973 + 1;
    if (q.type === "battle-winner") {
      const wrong = shuffle(q.distractorIds, qSeed).slice(0, 3);
      const options = shuffle([q.correctId, ...wrong], qSeed + 1);
      return { text: `Who won Round ${q.round}'s Battle?`, options: options.map((id) => byId.get(id) || "?"), answer: options.indexOf(q.correctId) };
    }
    if (q.type === "battle-game") {
      const wrong = shuffle(q.distractorTypes, qSeed).slice(0, 3);
      const options = shuffle([q.correctType, ...wrong], qSeed + 1);
      return { text: `What Battle was played in Round ${q.round}?`, options: options.map((t) => GAME_REGISTRY[t]?.label || t), answer: options.indexOf(q.correctType) };
    }
    // "round-exile"
    const wrong = shuffle(q.distractorIds, qSeed).slice(0, 3);
    const options = shuffle([q.correctId, ...wrong], qSeed + 1);
    return { text: `Who was exiled in Round ${q.round}?`, options: options.map((id) => byId.get(id) || "?"), answer: options.indexOf(q.correctId) };
  });
}
