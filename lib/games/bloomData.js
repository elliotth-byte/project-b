// ─── Bloom ───
// Solo, client-only (same reasoning as lib/games/hueData.js's own
// header comment) — the full board is visible from the start, nothing
// progressively revealed a reload could exploit.
//
// No par calculation here, by design — scoring is purely "how many
// sweeps did it actually take," lower is better, with no benchmark
// number to compute or compare against.

const COLORS = ["#f4c542", "#7a4a3a", "#e8798a", "#c99bdb", "#6a6ee0"]; // yellow, brown, coral, lavender, periwinkle — matches the palette shown
const BOARD_SIZE = 8; // 8x8, a clean, classic flood-fill board size

function seededRandom(seed) {
  let s = seed || 1;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

// Grid is a flat array, row-major, length BOARD_SIZE*BOARD_SIZE. Each
// cell is a color INDEX (0-4), not the hex itself, so re-coloring the
// palette later never means regenerating boards.
export function generateBoard(seed) {
  const rand = seededRandom(seed);
  const cells = [];
  for (let i = 0; i < BOARD_SIZE * BOARD_SIZE; i++) cells.push(Math.floor(rand() * COLORS.length));
  const centerIndex = Math.floor(BOARD_SIZE / 2) * BOARD_SIZE + Math.floor(BOARD_SIZE / 2);
  return { cells, size: BOARD_SIZE, centerIndex };
}

// One sweep: recolor the whole connected "patch" (the region already
// absorbed) to `colorIndex`, then flood-fill outward absorbing every
// cell reachable from the patch through cells that are ALSO now that
// same color — a proper cascading flood fill, not just immediate
// neighbors, so absorbing color A can chain through a large connected
// region of A in one tap, exactly like the real game.
//
// `patchIndices` is the set of cell indices currently part of the
// patch — the caller tracks this across sweeps rather than this
// function re-deriving it from board state alone, since after a sweep
// some cells' stored color changes to match the patch's new color
// without actually BEING part of the patch yet (they get absorbed by
// the flood-fill below only if actually adjacent-reachable).
export function sweep(board, patchIndices, colorIndex) {
  const cells = [...board.cells];
  const size = board.size;
  const patch = new Set(patchIndices);
  patch.forEach((idx) => { cells[idx] = colorIndex; });

  const queue = [...patch];
  while (queue.length > 0) {
    const idx = queue.pop();
    const row = Math.floor(idx / size), col = idx % size;
    const neighbors = [];
    if (row > 0) neighbors.push(idx - size);
    if (row < size - 1) neighbors.push(idx + size);
    if (col > 0) neighbors.push(idx - 1);
    if (col < size - 1) neighbors.push(idx + 1);
    for (const n of neighbors) {
      if (!patch.has(n) && cells[n] === colorIndex) {
        patch.add(n);
        cells[n] = colorIndex;
        queue.push(n);
      }
    }
  }

  return { cells, patchIndices: [...patch] };
}

export function isBloomComplete(board, patchIndices) {
  return patchIndices.length === board.cells.length;
}

export { COLORS, BOARD_SIZE };
