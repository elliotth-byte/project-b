// Standard-ish Farkle scoring. Returns { score, usedCount } where
// usedCount is how many of the passed dice contributed to the score —
// the rest are "dead" for this roll and get set aside.
export function scoreFarkleRoll(dice) {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  dice.forEach((d) => counts[d]++);

  if (dice.length === 6) {
    if ([1, 2, 3, 4, 5, 6].every((f) => counts[f] === 1)) return { score: 1500, usedCount: 6 };
    if (counts.slice(1, 7).filter((c) => c === 2).length === 3) return { score: 1500, usedCount: 6 };
  }

  let score = 0;
  let used = 0;
  for (let face = 1; face <= 6; face++) {
    const c = counts[face];
    if (c >= 3) {
      const base = face === 1 ? 1000 : face * 100;
      const multiplier = Math.pow(2, c - 3); // 3-of-a-kind x1, 4x2, 5x4, 6x8
      score += base * multiplier;
      used += c;
      counts[face] = 0;
    }
  }
  score += counts[1] * 100; used += counts[1];
  score += counts[5] * 50; used += counts[5];

  return { score, usedCount: used };
}

export function rollDice(n) {
  return Array.from({ length: n }, () => 1 + Math.floor(Math.random() * 6));
}

export const DIE_FACES = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
