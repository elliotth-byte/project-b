// Shared by both new maze variants (see Maze2DPlayer.jsx's siblings
// MazeInvisiblePlayer.jsx and MazeTriviaPlayer.jsx): a maze with 5 gems
// that must be collected IN ORDER (1 -> 2 -> 3 -> 4 -> 5), each gem
// sitting at its own "platform." The two variants differ only in HOW
// you navigate to each gem — this file just generates the shared shape
// both of them need.
const GEM_COUNT = 5;

function seededRandom(seed) {
  let s = seed || 1;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

// Same recursive-backtracker as Maze2DPlayer.jsx's generator.
function carveMaze(rand, size) {
  const grid = Array.from({ length: size }, () => Array(size).fill(1));
  const cellAt = (r, c) => r > 0 && r < size - 1 && c > 0 && c < size - 1;
  function carve(r, c) {
    grid[r][c] = 0;
    const dirs = [[-2, 0], [2, 0], [0, -2], [0, 2]].sort(() => rand() - 0.5);
    for (const [dr, dc] of dirs) {
      const nr = r + dr, nc = c + dc;
      if (cellAt(nr, nc) && grid[nr][nc] === 1) {
        grid[r + dr / 2][c + dc / 2] = 0;
        carve(nr, nc);
      }
    }
  }
  carve(1, 1);
  return grid;
}

// Picks 5 open cells, spread out and roughly increasing in distance from
// start, to serve as the sequential gem platforms.
function pickGems(grid, size, rand) {
  const open = [];
  for (let r = 1; r < size - 1; r++) {
    for (let c = 1; c < size - 1; c++) {
      if (grid[r][c] === 0 && !(r === 1 && c === 1)) open.push({ r, c, dist: Math.abs(r - 1) + Math.abs(c - 1) });
    }
  }
  open.sort((a, b) => a.dist - b.dist);
  // Split into 5 roughly-equal bands by distance-from-start and take one
  // random cell from each band, so gems spread across the whole maze
  // rather than clustering near the start or the far corner.
  const bandSize = Math.max(1, Math.floor(open.length / GEM_COUNT));
  const gems = [];
  for (let i = 0; i < GEM_COUNT; i++) {
    const bandStart = i * bandSize;
    const bandEnd = i === GEM_COUNT - 1 ? open.length : bandStart + bandSize;
    const band = open.slice(bandStart, bandEnd);
    const pick = band[Math.floor(rand() * band.length)] || open[open.length - 1];
    gems.push({ r: pick.r, c: pick.c });
  }
  return gems;
}

export function generateMazeWithGems(seed, size) {
  const rand = seededRandom(seed);
  const grid = carveMaze(rand, size);
  const start = { r: 1, c: 1 };
  const gems = pickGems(grid, size, rand);
  return { grid, start, gems, size };
}

// A rough straight-line (Bresenham) path of cells between two points —
// used by the Trivia Maze variant as each gem's "shortcut," carved open
// through the surrounding walls except for one gate cell partway along
// it. It doesn't need to be a perfectly verified shortest path; a
// straight line is reliably shorter than the maze's winding route for
// any maze of a reasonable size, which is all that actually matters here.
export function straightLinePath(from, to) {
  const points = [];
  let x0 = from.c, y0 = from.r, x1 = to.c, y1 = to.r;
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  while (true) {
    points.push({ r: y0, c: x0 });
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
  }
  return points;
}
