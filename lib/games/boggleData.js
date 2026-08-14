// Standard 4x4 Boggle dice faces (the actual letter sets from the real
// game, not just weighted-random letters) — gives a much more realistic,
// solvable board than picking letters by raw English-letter frequency
// would, since a few dice intentionally carry rarer letters like Q/X/Z
// paired with vowels to keep them usable.
const DICE = [
  "AAEEGN", "ABBJOO", "ACHOPS", "AFFKPS",
  "AOOTTW", "CIMOTU", "DEILRX", "DELRVY",
  "DISTTY", "EEGHNW", "EEINSU", "EHRTVW",
  "EIOSST", "ELRTTY", "HIMNQU", "HLNNRZ",
];

function seededRandom(seed) {
  let s = seed || 1;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

// Returns a flat 16-cell array (row-major, 4x4) of letters — "QU" is kept
// as a single cell (standard Boggle rule) rather than split into Q/U.
export function generateBoggleBoard(seed) {
  const rand = seededRandom(seed || 1);
  const dice = [...DICE];
  for (let i = dice.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [dice[i], dice[j]] = [dice[j], dice[i]];
  }
  return dice.map((die) => {
    const face = die[Math.floor(rand() * die.length)];
    return face === "Q" ? "QU" : face;
  });
}

export function isAdjacent(a, b, cols = 4) {
  const ar = Math.floor(a / cols), ac = a % cols;
  const br = Math.floor(b / cols), bc = b % cols;
  return Math.abs(ar - br) <= 1 && Math.abs(ac - bc) <= 1 && a !== b;
}

// Standard Boggle scoring by word length.
export function boggleWordScore(word) {
  const len = word.length;
  if (len <= 4) return 1;
  if (len === 5) return 2;
  if (len === 6) return 3;
  if (len === 7) return 5;
  return 11;
}
