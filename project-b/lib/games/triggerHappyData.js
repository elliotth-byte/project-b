// ─── Trigger Happy — Regular Mode ───
// Solo, self-contained memory game, same category as
// lib/games/slidingPuzzleData.js: every player's client independently
// derives the identical grid from the shared challenge.startedAt as a
// deterministic seed, so everyone studies (and is later scored
// against) the exact same layout, with zero real shared server state
// needed. Study a grid of the 5 Hermes' Grasp relics scattered across
// 20 cells, pull the lever to blank it, then replicate exactly where
// every relic was from memory.
import { RELICS } from "./hermesGraspData";

export const GRID_ROWS = 4;
export const GRID_COLS = 5;
export const TOTAL_CELLS = GRID_ROWS * GRID_COLS; // 20 — 4 of each of the 5 relics

// Same small LCG as lib/games/slidingPuzzleData.js. Fed the raw
// challenge.startedAt seed directly (not pre-multiplied) — see
// lib/games/lifesTapestryData.js's own header comment on
// pickVariantIndex for the real, confirmed precision-loss bug that
// caused: multiplying an incoming large seed by a big constant BEFORE
// ever reaching this function's own internal multiply collapses every
// real startedAt timestamp to the same result once it exceeds
// Number.MAX_SAFE_INTEGER. A plain seed (or a small additive offset on
// top of one, for a second independent stream) is always safe here.
export function seededRandom(seed) {
  let s = seed || 1;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

// Distributes the 5 RELICS as evenly as possible across `totalCells`
// (exactly totalCells/5 of each when it divides evenly, as it does for
// both this mode's 20 cells and Big Screen's 15 — a remainder, if the
// grid size ever didn't divide evenly, would just be handed to the
// first few relics in RELICS order). Shared by both this file and
// lib/games/triggerHappyTvData.js so the "how many of each relic"
// logic never has to be duplicated or drift between modes.
export function distributeRelicIds(totalCells) {
  const perRelic = Math.floor(totalCells / RELICS.length);
  const remainder = totalCells - perRelic * RELICS.length;
  const ids = [];
  RELICS.forEach((r, i) => {
    const count = perRelic + (i < remainder ? 1 : 0);
    for (let k = 0; k < count; k++) ids.push(r.id);
  });
  return ids;
}

// Fisher-Yates over `arr` driven by the seeded stream above — pulled
// out on its own since both this file's generateLayout (seeded, for
// fairness across every independently-computing client) and
// triggerHappyTvData's own layout builder (plain Math.random, since
// that one's a single shared server-authoritative value, not
// independently re-derived per client) need the identical shuffle
// mechanics, just fed a different random source.
export function shuffleWithRand(arr, rand) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Returns an array of TOTAL_CELLS relic ids, index = cell position
// (row-major), identical for every client given the same seed.
export function generateLayout(seed) {
  const rand = seededRandom(seed || 1);
  return shuffleWithRand(distributeRelicIds(TOTAL_CELLS), rand);
}

// How many of `placed`'s cells match `layout` at the same index — the
// core accuracy count both modes score on (0..layout.length).
export function countCorrect(layout, placed) {
  if (!placed) return 0;
  return layout.reduce((count, relicId, i) => count + (placed[i] === relicId ? 1 : 0), 0);
}
