// ─── Naiads' Aqueduct ───
// The classic rotate-the-tiles "Pipes" logic puzzle (as seen on sites
// like puzzle-pipes.com), reskinned as a Greek aqueduct: channels of
// water connecting a spring (the source cell, top-left) out across the
// whole grid. Tap a tile to rotate it 90°; the puzzle is solved when
// every tile's openings line up with its neighbors' — no dangling end
// anywhere, and nothing points off the edge of the grid.
//
// SEEDED off the shared challenge.startedAt, same reasoning as
// slidingPuzzleData.js's own header comment — every player racing this
// battle gets the IDENTICAL grid, since (like Sliding Puzzle, unlike
// Minotaur's Maze's genuinely-personal maze) this is a "race the same
// layout" puzzle, not one where independent personal instances make
// sense. Timing/scoring is still based on each player's own
// usePersistedStart timestamp, exactly like Sliding Puzzle, so a late
// joiner isn't penalized for time they weren't actually playing.
//
// GENERATION: a randomized-DFS spanning-tree carve over the grid graph
// (byte-for-byte the same algorithm as minotaurMazeData.js's maze carve,
// just interpreted differently) — every carved edge becomes an opening
// on BOTH cells it connects, so the carve directly produces each cell's
// TRUE pipe shape (1 opening = dead-end cap, 2 = straight or corner,
// 3 = T-junction, 4 = cross). Because it's a spanning tree (no cycles,
// every cell reachable), the true, unrotated layout is trivially
// "solved" by construction — solvability doesn't need a separate check,
// same reasoning as the maze/sliding-puzzle generators' own shuffle-vs-
// permutation tricks. Each cell's on-screen rotation is then randomized
// independently to scramble it.

export const SIZE = 8; // 8x8 grid — big enough to be a real puzzle, small enough to stay legible and finishable within a timed battle

// Bit flags for the 4 openings a tile can have, clockwise from the top.
export const UP = 1, RIGHT = 2, DOWN = 4, LEFT = 8;
const ALL_DIRS = [
  { bit: UP, dr: -1, dc: 0, opposite: DOWN },
  { bit: RIGHT, dr: 0, dc: 1, opposite: LEFT },
  { bit: DOWN, dr: 1, dc: 0, opposite: UP },
  { bit: LEFT, dr: 0, dc: -1, opposite: RIGHT },
];

// Same seeded LCG as slidingPuzzleData.js/minotaurMazeData.js — kept
// identical on purpose, see minotaurMazeData.js's own comment on this.
function seededRandom(seed) {
  let s = seed || 1;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

// Rotates a 4-bit opening mask 90° clockwise (UP->RIGHT->DOWN->LEFT->UP).
export function rotateCW(mask) {
  return ((mask << 1) | (mask >> 3)) & 0xf;
}

export const SOURCE = { r: 0, c: 0 };

// Builds { trueShapes, rotations, size, source }. `trueShapes[r][c]` is
// the cell's UNROTATED (as-carved) opening mask. `rotations[r][c]` is
// how many quarter-turns (0-3) that cell starts rotated by on screen —
// the puzzle's actual starting (scrambled) state is
// rotateCW^rotations(trueShapes[r][c]), computed by currentMask() below.
export function generateAqueduct(seed, size = SIZE) {
  const rand = seededRandom(seed || 1);
  const trueShapes = Array.from({ length: size }, () => Array(size).fill(0));
  const visited = Array.from({ length: size }, () => Array(size).fill(false));

  visited[SOURCE.r][SOURCE.c] = true;
  const stack = [[SOURCE.r, SOURCE.c]];

  while (stack.length > 0) {
    const [r, c] = stack[stack.length - 1];
    const options = ALL_DIRS
      .map((d) => ({ ...d, nr: r + d.dr, nc: c + d.dc }))
      .filter((d) => d.nr >= 0 && d.nr < size && d.nc >= 0 && d.nc < size && !visited[d.nr][d.nc]);

    if (options.length === 0) { stack.pop(); continue; }

    const pick = options[Math.floor(rand() * options.length)];
    trueShapes[r][c] |= pick.bit;
    trueShapes[pick.nr][pick.nc] |= pick.opposite;
    visited[pick.nr][pick.nc] = true;
    stack.push([pick.nr, pick.nc]);
  }

  // Randomize each cell's starting rotation, continuing the same rand()
  // sequence right after the carve.
  const rotations = Array.from({ length: size }, () => Array(size).fill(0));
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      rotations[r][c] = Math.floor(rand() * 4);
    }
  }

  return { trueShapes, rotations, size, source: SOURCE };
}

// The cell's actual, currently-displayed opening mask given its true
// shape and however many quarter-turns it's been rotated so far.
export function currentMask(trueShape, rotationSteps) {
  let mask = trueShape;
  const steps = ((rotationSteps % 4) + 4) % 4;
  for (let i = 0; i < steps; i++) mask = rotateCW(mask);
  return mask;
}

// Rotates a single cell one quarter-turn clockwise (mutation-free —
// returns a new rotations grid). This is the only "move" in the game.
export function rotateCell(rotations, r, c) {
  const next = rotations.map((row) => row.slice());
  next[r][c] = (next[r][c] + 1) % 4;
  return next;
}

// Whether cell (r,c) is currently fully consistent with all four of its
// neighbors AND the grid border: every opening it has is matched by a
// reciprocal opening on the appropriate neighbor, and it has no opening
// pointing off the edge of the grid. Used both for the live win check
// (a grid is solved iff every cell passes this) and as the per-cell
// partial-progress signal for a DNF.
export function isCellConsistent(trueShapes, rotations, r, c, size) {
  const mask = currentMask(trueShapes[r][c], rotations[r][c]);
  for (const d of ALL_DIRS) {
    const has = (mask & d.bit) !== 0;
    const nr = r + d.dr, nc = c + d.dc;
    const inBounds = nr >= 0 && nr < size && nc >= 0 && nc < size;
    if (!inBounds) {
      if (has) return false; // opening pointing off the grid
      continue;
    }
    const neighborMask = currentMask(trueShapes[nr][nc], rotations[nr][nc]);
    const neighborHasBack = (neighborMask & d.opposite) !== 0;
    if (has !== neighborHasBack) return false; // dangling or mismatched end
  }
  return true;
}

// Count of currently-locally-consistent cells across the whole grid —
// the DNF partial-progress metric. Monotonically hits `size*size` iff
// (and only iff) the puzzle is fully solved, since every cell being
// individually consistent with its neighbors/border is exactly the win
// condition, cell by cell.
export function consistentCellCount(trueShapes, rotations, size) {
  let count = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (isCellConsistent(trueShapes, rotations, r, c, size)) count++;
    }
  }
  return count;
}

export function isSolved(trueShapes, rotations, size) {
  return consistentCellCount(trueShapes, rotations, size) === size * size;
}

// Which of a cell's openings, in the CURRENT rotation, are actually
// live/flowing once the puzzle is solved and the source-fill animation
// runs — reuses currentMask so the renderer never has to re-derive it.
export function openingsOf(trueShapes, rotations, r, c) {
  return currentMask(trueShapes[r][c], rotations[r][c]);
}
