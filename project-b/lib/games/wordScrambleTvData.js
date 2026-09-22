import { storageSet, storageUpdate, subscribeGameState } from "../gameStorage";
import { WORD_SETS } from "./wordData";

// ─── Word Scramble — Big Screen ───
// A genuinely different mechanic from the existing wordscramble (see
// lib/games/wordData.js's own getPlayerWordSet) — that one gives every
// player their OWN set of 7 words to solve independently, on their own
// phone. This is one shared pool of scrambled words shown on the TV;
// any player can submit a guess for any of them from their phone
// (just a text box — the scramble itself only ever exists on the TV,
// see components/bigscreen/WordScrambleTvDisplay.jsx), and a correct
// guess removes that word and replaces it with a fresh one, on a
// timer, for the whole battle. Whoever's solved the most when time
// runs out wins — this is why it's registered as its own game type
// (wordscrambletv) rather than a mode flag on the original: the
// scoring basis itself is different (most solved vs. fastest to solve
// your own 7), and the display split (TV shows the puzzle, phone is
// pure input) has no equivalent in the original at all.
const ACTIVE_POOL_SIZE = 5;

export const wordScrambleTvKey = (round) => `pb:wordscrambletv:${round}`;

export function subscribeWordScrambleTv(gameId, round, onChange) {
  return subscribeGameState(gameId, wordScrambleTvKey(round), onChange);
}

// All WORD_SETS flattened into one pool and deduplicated — the
// original per-player mechanic picks one THEMED set per player
// (getPlayerWordSet); a shared pool has no reason to keep that
// grouping, so this just pulls from every word this app already has
// rather than duplicating or maintaining a second word list.
const ALL_WORDS = [...new Set(WORD_SETS.flatMap((s) => s.words))];

function shuffleLetters(word, rng) {
  const letters = word.split("");
  for (let i = letters.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [letters[i], letters[j]] = [letters[j], letters[i]];
  }
  // A shuffle that happens to land back on the original word/order
  // gives the game away for free — reshuffle in that case. Vanishingly
  // rare for anything longer than 3-4 letters, but free to guard
  // against and embarrassing not to.
  return letters.join("") === word && word.length > 1 ? shuffleLetters(word, rng) : letters;
}

function pickNewWord(usedWords, rng) {
  const available = ALL_WORDS.filter((w) => !usedWords.includes(w));
  // Pool exhausted (every word in the whole app has already been used
  // this battle) — reopen the full list rather than leaving a dead
  // slot in the active pool for the rest of the battle. A genuinely
  // rare case (ALL_WORDS is large), but a battle running long enough
  // to hit it shouldn't just get permanently short one word.
  const pool = available.length > 0 ? available : ALL_WORDS;
  const word = pool[Math.floor(rng() * pool.length)];
  return { id: `${word}-${Date.now()}-${Math.floor(rng() * 1e6)}`, word, scrambled: shuffleLetters(word, rng) };
}

// Deterministic-enough PRNG seeded per battle so this stays consistent
// under storageUpdate's own optimistic-retry semantics (a retried
// update recomputing the same "next word" from the same inputs is
// fine; genuine per-call Math.random() would just be visually
// noisier, not incorrect, but a seeded generator is the more careful
// choice given how central "what word comes next" is to this game).
function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function initWordScrambleTv(gameId, round, participants, seed, db) {
  const set = db?.set || storageSet;
  const rng = mulberry32(seed || Date.now());
  const usedWords = [];
  const activePool = [];
  for (let i = 0; i < ACTIVE_POOL_SIZE; i++) {
    const entry = pickNewWord(usedWords, rng);
    usedWords.push(entry.word);
    activePool.push(entry);
  }
  await set(gameId, wordScrambleTvKey(round), {
    activePool, usedWords, scores: {}, solvedLog: [], rngState: Math.floor(rng() * 1e9),
  });
}

// Best-effort concurrency handling: storageUpdate's own read-modify-
// write already means two simultaneous correct guesses for the SAME
// word resolve to only one actually landing (the second sees the word
// already gone from activePool and no-ops) — no separate locking
// needed beyond what that primitive already gives every other piece
// of shared state in this app.
export async function submitWordScrambleGuess(gameId, round, playerId, playerName, guess) {
  const normalized = (guess || "").trim().toUpperCase();
  if (!normalized) return { ok: false };
  return storageUpdate(gameId, wordScrambleTvKey(round), (fresh) => {
    if (!fresh) return fresh;
    const match = fresh.activePool.find((entry) => entry.word === normalized);
    if (!match) return fresh; // wrong guess, or someone else already claimed it — either way, no state change
    const rng = mulberry32(fresh.rngState);
    const replacement = pickNewWord(fresh.usedWords, rng);
    return {
      ...fresh,
      activePool: fresh.activePool.map((entry) => (entry.id === match.id ? replacement : entry)),
      usedWords: [...fresh.usedWords, replacement.word],
      scores: { ...fresh.scores, [playerId]: (fresh.scores[playerId] || 0) + 1 },
      solvedLog: [...fresh.solvedLog.slice(-19), { word: match.word, playerId, playerName, solvedAt: Date.now() }],
      rngState: Math.floor(rng() * 1e9),
    };
  });
}

export function placementValue(state, playerId) {
  return state.scores?.[playerId] || 0;
}
