// Standard "beginner" difficulty: 9x9, 10 mines. Each player gets their
// own seeded board (challenge.startedAt + player id, same pattern as
// Spot the Difference/Word Scramble) rather than a shared one — fair
// because everyone's solving an equally-hard 9x9/10-mine puzzle, just a
// different specific layout, the same way different maze layouts are
// still an equally fair contest.
export const COLS = 9, ROWS = 9, MINES = 10;

function seededRandom(seed) {
  let s = seed || 1;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

const idx = (x, y) => y * COLS + x;
const neighbors = (x, y) => {
  const out = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (dx === 0 && dy === 0) continue;
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS) out.push({ x: nx, y: ny });
  }
  return out;
};

// Mines are placed AFTER the first click, never on or adjacent to it —
// classic first-click-safe convention, so nobody's first tap is ever a
// dead loss before they've even seen the board.
export function generateBoard(seed, safeX, safeY) {
  const rand = seededRandom(seed || 1);
  const isMine = new Array(COLS * ROWS).fill(false);
  const forbidden = new Set([idx(safeX, safeY), ...neighbors(safeX, safeY).map((n) => idx(n.x, n.y))]);

  let placed = 0;
  while (placed < MINES) {
    const i = Math.floor(rand() * COLS * ROWS);
    if (isMine[i] || forbidden.has(i)) continue;
    isMine[i] = true;
    placed++;
  }

  const adjacent = new Array(COLS * ROWS).fill(0);
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    if (isMine[idx(x, y)]) continue;
    adjacent[idx(x, y)] = neighbors(x, y).filter((n) => isMine[idx(n.x, n.y)]).length;
  }

  return { isMine, adjacent };
}

// Flood-fill reveal from (x,y) — expands through connected zero-adjacent
// cells and stops at the first ring of numbered cells, same as the
// classic game. Returns the set of newly-revealed indices.
export function floodReveal(board, revealed, x, y) {
  const toReveal = new Set();
  const stack = [{ x, y }];
  while (stack.length) {
    const cur = stack.pop();
    const i = idx(cur.x, cur.y);
    if (revealed.has(i) || toReveal.has(i) || board.isMine[i]) continue;
    toReveal.add(i);
    if (board.adjacent[i] === 0) {
      neighbors(cur.x, cur.y).forEach((n) => {
        if (!revealed.has(idx(n.x, n.y)) && !toReveal.has(idx(n.x, n.y))) stack.push(n);
      });
    }
  }
  return toReveal;
}

export function cellIndex(x, y) { return idx(x, y); }
