// A whole game's mole spawns are pre-generated as one deterministic
// schedule, seeded off challenge.startedAt (the same value every player's
// client already reads) — so every player faces the EXACT same sequence
// of holes/types/timing, not their own independently-randomized one.
// Without this, comparing "most whacks" wouldn't be a fair contest —
// someone could simply get luckier with more/easier spawns purely by
// chance. This makes it a pure reaction-time/decision-making contest
// instead: everyone sees the same standardized set of moles.

export const HOLES = 9;
export const DURATION_MS = 90 * 1000;
const MOLE_UP_MS = 800; // faster than the old "stays up until whacked"
const SPAWN_INTERVAL_MS = 420; // faster than the old 500-700ms

export const MOLE_TYPES = {
  normal: { points: 1, chance: 0.68 },
  gold: { points: 5, chance: 0.16 },
  red: { points: -3, chance: 0.16 },
};

function seededRandom(seed) {
  let s = seed || 1;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

function pickType(rand) {
  const r = rand();
  if (r < MOLE_TYPES.gold.chance) return "gold";
  if (r < MOLE_TYPES.gold.chance + MOLE_TYPES.red.chance) return "red";
  return "normal";
}

// [{ id, time, holeIndex, type, durationMs }] — `time` is ms since the
// challenge's shared start. Multiple events can (and often do) overlap,
// so several holes show moles — including different types — at once.
export function generateMoleSchedule(seed) {
  const rand = seededRandom(seed);
  const events = [];
  let t = 300; // small initial delay before the first mole
  let id = 0;
  const recentHoles = []; // avoid the same hole popping twice in a row too often

  while (t < DURATION_MS - MOLE_UP_MS) {
    let holeIndex = Math.floor(rand() * HOLES);
    // Mild anti-repeat: retry once if this hole was used very recently.
    if (recentHoles.includes(holeIndex)) holeIndex = Math.floor(rand() * HOLES);
    recentHoles.push(holeIndex);
    if (recentHoles.length > 3) recentHoles.shift();

    events.push({ id: id++, time: t, holeIndex, type: pickType(rand), durationMs: MOLE_UP_MS });
    t += SPAWN_INTERVAL_MS * (0.7 + rand() * 0.6); // some jitter so it's not a perfect metronome
  }

  return events;
}
