// ─── Delphi's Dig ───
// Solo, client-only puzzle, same shape as naiadsAqueductData.js/
// tavoData.js: pure generation off a shared seed, no server state
// needed since every player just races their own clock against an
// identical board.
//
// The board is N rows x 3 columns of buried tablet fragments. Each of
// the N equations (one number, one operator, one more number) gets its
// own sigil. Naively you'd expect a sigil's three fragments to sit in
// the same row — they don't. Each column is its OWN independent
// shuffle of all N sigils, so a sigil's column-A fragment, column-B
// fragment, and column-C fragment usually land in three different
// rows entirely. That's the actual puzzle: the grid you see is not a
// list of N equations, it's 3N independent fragments, and finding
// which three belong together is exactly as much the challenge as the
// arithmetic once they're found.
//
// Two-stage dig per fragment (state machine lives in the component,
// not here): hidden -> peeked (shows the sigil only) -> dug (shows the
// real number/operator). A sigil's equation isn't answerable until all
// three of its fragments — one per column — have reached "dug".

export const NUM_EQUATIONS = 6;
export const SYMBOLS = ["⚡", "🔱", "🦉", "🏹", "🗡️", "🕊️"]; // Zeus, Poseidon, Athena, Artemis, Ares, Aphrodite
const OPS = ["+", "-", "×", "÷"];

function seededRandom(seed) {
  let s = seed || 1;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

function pickInt(rng, lo, hi) { return lo + Math.floor(rng() * (hi - lo + 1)); }

function shuffled(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function evaluate(a, op, b) {
  if (op === "+") return a + b;
  if (op === "-") return a - b;
  if (op === "×") return a * b;
  if (op === "÷") return a / b;
  return NaN;
}

function makeEquation(rng) {
  const op = OPS[pickInt(rng, 0, OPS.length - 1)];
  if (op === "+") { const a = pickInt(rng, 2, 15), b = pickInt(rng, 2, 15); return { a, op, b, result: a + b }; }
  if (op === "×") { const a = pickInt(rng, 2, 9), b = pickInt(rng, 2, 9); return { a, op, b, result: a * b }; }
  if (op === "÷") { const b = pickInt(rng, 2, 9), result = pickInt(rng, 2, 9); return { a: b * result, op, b, result }; }
  // subtraction — keep it positive and non-trivial
  const b = pickInt(rng, 2, 12);
  const a = b + pickInt(rng, 1, 12);
  return { a, op, b, result: a - b };
}

// Builds the N equations plus the scrambled N x 3 grid. Every player in
// a given battle passes the same `seed` (challenge.startedAt) and gets
// byte-for-byte the same board.
export function generateBoard(seed, numEquations = NUM_EQUATIONS) {
  const rng = seededRandom(seed || 1);
  const equations = Array.from({ length: numEquations }, () => makeEquation(rng));

  // One independent shuffle per column: colOrder[c][r] = which equation's
  // fragment sits at row r of column c.
  const colOrder = [0, 1, 2].map(() => shuffled(Array.from({ length: numEquations }, (_, i) => i), rng));

  const grid = Array.from({ length: numEquations }, (_, r) =>
    [0, 1, 2].map((c) => {
      const eq = colOrder[c][r];
      const value = c === 0 ? equations[eq].a : c === 1 ? equations[eq].op : equations[eq].b;
      return { eq, symbol: SYMBOLS[eq % SYMBOLS.length], value };
    })
  );

  return { equations, grid, numEquations };
}

export const COLUMN_LABELS = ["1st Term", "Operator", "2nd Term"];
