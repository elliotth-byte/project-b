// Unchanged from the original artifact — pure card/poker/roulette math,
// no storage dependency, so nothing needed to change for the migration.

export const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
export const SUITS = ["♠", "♥", "♦", "♣"];

export function freshDeck() {
  const d = [];
  for (const s of SUITS) for (const r of RANKS) d.push({ r, s, v: RANKS.indexOf(r) + 2 });
  return d.sort(() => Math.random() - 0.5);
}

export function bjValue(cards) {
  let sum = 0, aces = 0;
  for (const c of cards) {
    if (c.r === "A") { aces++; sum += 11; }
    else if (["K", "Q", "J", "10"].includes(c.r)) sum += 10;
    else sum += parseInt(c.r);
  }
  while (sum > 21 && aces > 0) { sum -= 10; aces--; }
  return sum;
}

export function pokerRank(cards) {
  // 7 cards -> best 5 category score (0..8), tie-broken by high vals
  const vals = cards.map((c) => c.v).sort((a, b) => b - a);
  const counts = {}; vals.forEach((v) => counts[v] = (counts[v] || 0) + 1);
  const suits = {}; cards.forEach((c) => suits[c.s] = (suits[c.s] || 0) + 1);
  const flush = Object.values(suits).some((n) => n >= 5);
  const uniq = [...new Set(vals)].sort((a, b) => b - a);
  let straight = false;
  for (let i = 0; i <= uniq.length - 5; i++) if (uniq[i] - uniq[i + 4] === 4) { straight = true; break; }
  if (uniq.includes(14) && [5, 4, 3, 2].every((v) => uniq.includes(v))) straight = true;
  const groups = Object.values(counts).sort((a, b) => b - a);
  let cat = 0;
  if (straight && flush) cat = 8; else if (groups[0] === 4) cat = 7; else if (groups[0] === 3 && groups[1] >= 2) cat = 6;
  else if (flush) cat = 5; else if (straight) cat = 4; else if (groups[0] === 3) cat = 3;
  else if (groups[0] === 2 && groups[1] === 2) cat = 2; else if (groups[0] === 2) cat = 1;
  return cat * 1000000 + vals.slice(0, 5).reduce((a, v, i) => a + v * Math.pow(15, 4 - i), 0);
}

export const POKER_NAMES = ["High Card", "Pair", "Two Pair", "Trips", "Straight", "Flush", "Full House", "Quads", "Str. Flush"];

export const ROULETTE_WHEEL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
export const ROULETTE_REDS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];

export const STORAGE_KEY_CASINO = "traitors:casino";
