import { GAME_REGISTRY } from "../challenges/registry";

// ─── Timeline ───
// Put this season's real events back in the order they actually
// happened. Same self-contained, deterministic-content-for-everyone
// shape as lib/games/seasonTriviaData.js — no shared game_state, no
// host/roundEngine wiring — and the same reason for locking the
// Ceremony tab while it runs (see that file's matching comment):
// the recap there would just hand out the answer directly.

const MIN_EVENTS = 4;
export const MAX_EVENTS = 8;

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

// Every real, describable event from this season's history, already in
// TRUE chronological order — round first, then phaseOrder within a
// round (a Battle always resolves before that same round's Exile Vote
// can, so 0 always sorts before 1 for a tied round number; this is
// the season's own real phase order, not an arbitrary tiebreak).
export function buildEventPool(challengeHistory, exileHistory, players) {
  const byId = new Map((players || []).map((p) => [p.id, p.display_name || p.name]));
  const events = [];

  (challengeHistory || []).forEach((entry) => {
    if (!entry.gameType) return;
    const label = GAME_REGISTRY[entry.gameType]?.label || (entry.gameType === "manual" ? "Battle" : entry.gameType);
    const winnerName = entry.winnerId ? byId.get(entry.winnerId) : null;
    const text = winnerName ? `${winnerName} won the ${label} Battle` : `The ${label} Battle happened`;
    events.push({ round: entry.round, phaseOrder: 0, text });
  });

  (exileHistory || []).forEach((entry) => {
    const names = (entry.exiledIds || []).map((id) => byId.get(id)).filter(Boolean);
    if (names.length === 0) return;
    const text = names.length === 1 ? `${names[0]} was exiled` : `${names.join(" & ")} were exiled`;
    events.push({ round: entry.round, phaseOrder: 1, text });
  });

  events.sort((a, b) => a.round - b.round || a.phaseOrder - b.phaseOrder);
  return events;
}

export function hasEnoughHistory(challengeHistory, exileHistory, players) {
  return buildEventPool(challengeHistory, exileHistory, players || []).length >= MIN_EVENTS;
}

// Same cheap proxy reasoning as
// lib/games/seasonTriviaData.js's own hasEnoughHistoryForSelection —
// used only by the RANDOM-selection gate, which doesn't have a
// `players` list on hand; a text-describable event only ever needs a
// winner/exiled name to exist at all, not a specific roster size, so
// this counts qualifying history entries directly.
export function hasEnoughHistoryForSelection(challengeHistory, exileHistory) {
  const battleEvents = (challengeHistory || []).filter((e) => e.gameType).length;
  const exileEvents = (exileHistory || []).filter((e) => (e.exiledIds || []).length > 0).length;
  return battleEvents + exileEvents >= MIN_EVENTS;
}

// Picks up to MAX_EVENTS from the pool. When the pool is larger than
// that, picks a random SUBSET (seeded, so the same subset for every
// player this battle) rather than always just the first N — keeps a
// long season's Timeline varied across replays instead of the same
// early-game events every time. Selected indices are sorted ascending
// before returning, which is what preserves TRUE chronological order
// among whichever events got picked (the pool itself is already
// chronological, so an ascending subset of its indices is too).
export function pickEvents(pool, seed) {
  if (pool.length <= MAX_EVENTS) return pool;
  const indices = shuffle(pool.map((_, i) => i), seed).slice(0, MAX_EVENTS).sort((a, b) => a - b);
  return indices.map((i) => pool[i]);
}
