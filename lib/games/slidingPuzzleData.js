// ─── Sliding Puzzle ───
// Classic 15-puzzle: a 4x4 grid of numbered tiles (1-15) plus one empty
// slot, scrambled, with the goal of sliding tiles back into numeric
// order (empty slot ending bottom-right).
//
// Solvability matters here — a truly random permutation of tiles is only
// solvable half the time (a parity thing), and there's no way to fix
// that from the UI once a player's staring at an actually-unsolvable
// board. Sidestepped entirely by shuffling via simulated random legal
// MOVES from the solved state, rather than a random permutation — every
// move preserves solvability by construction, so however scrambled it
// looks, it's always guaranteed solvable.
//
// Same shared-seed fairness as Whack-a-Mole/Stroop/Red Light Green
// Light — everyone races the identical scramble, not their own
// independently-random one.
export const SIZE = 4; // 4x4 -> 15 numbered tiles + 1 empty
const SHUFFLE_MOVES = 150;

function seededRandom(seed) {
  let s = seed || 1;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

function solvedBoard() {
  // 0 represents the empty slot. Tiles 1..15 in order, empty last.
  return Array.from({ length: SIZE * SIZE }, (_, i) => (i === SIZE * SIZE - 1 ? 0 : i + 1));
}

function neighborsOf(emptyIdx) {
  const r = Math.floor(emptyIdx / SIZE), c = emptyIdx % SIZE;
  const out = [];
  if (r > 0) out.push(emptyIdx - SIZE);
  if (r < SIZE - 1) out.push(emptyIdx + SIZE);
  if (c > 0) out.push(emptyIdx - 1);
  if (c < SIZE - 1) out.push(emptyIdx + 1);
  return out;
}

export function generateScramble(seed) {
  const rand = seededRandom(seed || 1);
  const board = solvedBoard();
  let emptyIdx = board.indexOf(0);
  let lastEmptyIdx = -1;

  for (let i = 0; i < SHUFFLE_MOVES; i++) {
    const options = neighborsOf(emptyIdx).filter((n) => n !== lastEmptyIdx); // avoid immediately undoing the previous move, so the shuffle doesn't waste moves wandering back and forth
    const pick = options.length > 0 ? options[Math.floor(rand() * options.length)] : neighborsOf(emptyIdx)[0];
    [board[emptyIdx], board[pick]] = [board[pick], board[emptyIdx]];
    lastEmptyIdx = emptyIdx;
    emptyIdx = pick;
  }

  return board;
}

export function isSolved(board) {
  const solved = solvedBoard();
  return board.every((v, i) => v === solved[i]);
}

// How many tiles are currently in their correct final position — used
// as the partial-progress score for anyone who runs out of time without
// finishing.
export function correctCount(board) {
  const solved = solvedBoard();
  return board.reduce((count, v, i) => count + (v === solved[i] ? 1 : 0), 0);
}

// Attempts to slide the tile at `idx` into the empty slot — returns the
// new board if idx is adjacent to the empty slot, or null (no-op) if
// it's not a legal move.
export function trySlide(board, idx) {
  const emptyIdx = board.indexOf(0);
  if (!neighborsOf(emptyIdx).includes(idx)) return null;
  const next = [...board];
  [next[emptyIdx], next[idx]] = [next[idx], next[emptyIdx]];
  return next;
}
