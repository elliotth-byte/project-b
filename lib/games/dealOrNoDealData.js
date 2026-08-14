// A compact, single-player version of the classic format — 16 cases
// instead of 26, and offers appear after fewer, bigger case-reveals so a
// full playthrough fits comfortably inside a challenge's time budget.
export const CASE_VALUES = [1, 5, 10, 25, 75, 100, 200, 300, 500, 750, 1000, 2500, 5000, 10000, 25000, 50000];

// How many cases get opened before each banker offer — 6 rounds, opening
// 14 of the 15 non-player cases total, leaving exactly one other case
// (plus the player's own) for the final go/no-go decision.
export const ROUND_OPEN_COUNTS = [5, 3, 2, 2, 1, 1];

// The offer starts well below the true expected value (early rounds are
// supposed to feel like a bad deal, same as the show) and climbs toward
// it as fewer, higher-stakes cases remain.
const OFFER_FACTOR_BY_ROUND = [0.45, 0.55, 0.65, 0.75, 0.85, 0.92];

export function seededShuffle(values, seed) {
  let s = seed || 1;
  const rand = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const arr = [...values];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function computeOffer(remainingValues, roundIndex) {
  const avg = remainingValues.reduce((a, b) => a + b, 0) / remainingValues.length;
  const factor = OFFER_FACTOR_BY_ROUND[Math.min(roundIndex, OFFER_FACTOR_BY_ROUND.length - 1)];
  return Math.round((avg * factor) / 5) * 5; // round to nearest $5, keeps it feeling like a real offer, not a raw average
}

export function formatMoney(n) {
  return "$" + n.toLocaleString();
}
