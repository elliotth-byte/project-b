function seededRandom(seed) {
  let s = seed || 1;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

// Deliberately irregular gaps between beats — a simple, evenly-spaced
// beat would be trivial to replicate and wouldn't feel "odd" at all.
// Mixing short and long gaps is what makes it a genuine memory-and-timing
// challenge rather than just "tap along steadily."
const POSSIBLE_GAPS_MS = [260, 340, 420, 520, 640, 780, 900];

// Same rhythm for every player in the round (seeded off challenge.
// startedAt only, no per-player offset) — same fairness reasoning as
// Whack-a-Mole's standardized mole sequence: "closest to the rhythm
// wins" only means something if everyone's actually comparing against
// the same target.
export function generateRhythm(seed, beatCount = 7) {
  const rand = seededRandom(seed || 1);
  const offsets = [0];
  for (let i = 1; i < beatCount; i++) {
    const gap = POSSIBLE_GAPS_MS[Math.floor(rand() * POSSIBLE_GAPS_MS.length)];
    offsets.push(offsets[i - 1] + gap);
  }
  return offsets;
}

// Greedy nearest-match between the player's tap timestamps and the
// target beat offsets (both in ms from their respective start points) —
// each player tap can only be matched to one target beat, so extra taps
// don't get to "cover" for a missed one. A target beat with no
// reasonably-close tap eats a flat penalty instead of leaving it
// unscored, so tapping fewer times than the rhythm has beats is
// correctly worse, not a free pass.
const MISS_PENALTY_MS = 900;

export function scoreRhythmAttempt(targetOffsets, playerOffsets) {
  const used = new Set();
  let totalDeviation = 0;

  for (const target of targetOffsets) {
    let bestIdx = -1;
    let bestDelta = Infinity;
    playerOffsets.forEach((tap, idx) => {
      if (used.has(idx)) return;
      const delta = Math.abs(tap - target);
      if (delta < bestDelta) { bestDelta = delta; bestIdx = idx; }
    });
    if (bestIdx !== -1 && bestDelta <= MISS_PENALTY_MS) {
      used.add(bestIdx);
      totalDeviation += bestDelta;
    } else {
      totalDeviation += MISS_PENALTY_MS;
    }
  }

  const avgDeviationMs = totalDeviation / targetOffsets.length;
  // Higher score = closer to the rhythm, per the request — an average
  // deviation of 0ms scores 1000; it decays to 0 by roughly the point
  // where you're averaging a full miss on every beat.
  const score = Math.max(0, Math.round(1000 - avgDeviationMs * (1000 / MISS_PENALTY_MS)));
  return { score, avgDeviationMs: Math.round(avgDeviationMs) };
}
