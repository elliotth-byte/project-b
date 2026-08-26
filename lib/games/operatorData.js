// ─── Operator ───
// Solo, client-only (same reasoning as lib/games/hueData.js's own
// header comment) — the puzzle is fully visible from the start, no
// progressively-revealed information a reload could exploit.
//
// The one piece that actually needs care: the puzzle MUST be solvable,
// every time, no exceptions — an unsolvable target would be a real bug,
// same seriousness as guaranteeing Scavenger Hunt's item pool could
// never make the whole game unwinnable. The way this is guaranteed
// isn't "pick 5 numbers and a target, hope they connect" — the target
// is computed by literally performing a real chain of valid operations
// on the five numbers, so a solution provably exists by construction,
// not by chance.

function seededRandom(seed) {
  let s = seed || 1;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

function shuffle(arr, rand) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const MAX_INTERMEDIATE_VALUE = 999; // keeps generated targets from blowing up into unreasonable numbers via repeated multiplication

export function applyOperator(op, a, b) {
  if (op === "+") return a + b;
  if (op === "-") return a - b; // only ever called when validOperators has already confirmed a >= b
  if (op === "×") return a * b;
  if (op === "÷") return a / b; // only ever called when validOperators has already confirmed an even division
  return null;
}

// Which operators are actually legal for this specific pair, keeping
// every intermediate result a non-negative whole number — no negative
// tiles, no fractional tiles, matching what the tiles-based UI can
// actually display.
export function validOperators(a, b) {
  const ops = [];
  if (a + b <= MAX_INTERMEDIATE_VALUE) ops.push("+");
  if (a >= b) ops.push("-"); // never produces a negative tile
  if (a * b <= MAX_INTERMEDIATE_VALUE) ops.push("×");
  if (b !== 0 && a % b === 0) ops.push("÷"); // only when it divides evenly — no fractional tiles
  return ops;
}

// Builds the puzzle by actually solving it forward: start from one of
// the five numbers, then chain in a random subset of the remaining
// four (order shuffled) using whatever operators are legal at each
// step. Combines at least 2 and up to all 5 numbers — a puzzle that
// only needs 2 of the 5 is still a valid, if easier, puzzle; nothing
// in the rules requires using every tile.
export function generatePuzzle(seed) {
  const rand = seededRandom(seed);
  const numbers = [];
  for (let i = 0; i < 5; i++) numbers.push(1 + Math.floor(rand() * 9));

  const remainingIndices = shuffle([1, 2, 3, 4], rand);
  const numToChain = 1 + Math.floor(rand() * 4); // combine 1 to 4 of the remaining 4 numbers (so 2 to 5 total)

  let current = numbers[0];
  let combinedCount = 1;
  for (let k = 0; k < numToChain; k++) {
    const idx = remainingIndices[k];
    const next = numbers[idx];
    const ops = validOperators(current, next);
    if (ops.length === 0) continue; // this specific pairing has no legal operator (e.g. would go negative or fractional) — skip it, try the next number in the chain instead
    const op = ops[Math.floor(rand() * ops.length)];
    current = applyOperator(op, current, next);
    combinedCount++;
  }

  // Degenerate case: every single chain attempt got skipped (only
  // possible if numToChain rolled very low AND the very first pairing
  // happened to have zero legal ops, astronomically unlikely with 1-9
  // ranges but not worth leaving to chance) — fall back to the
  // simplest guaranteed-legal op, addition, which is ALWAYS valid for
  // any two positive numbers within range.
  if (combinedCount < 2) {
    current = numbers[0] + numbers[1];
  }

  return { numbers, target: current };
}

// Re-validates a full board state against the target — used both to
// confirm the win condition and (defensively) to make sure the UI
// itself never produced an impossible intermediate tile.
export function isSolved(tiles, target) {
  return tiles.length === 1 && tiles[0].value === target;
}
