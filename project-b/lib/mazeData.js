// Unchanged from the original artifact — deterministic maze generation and
// first-person view math, no storage dependency at all. Because the maze is
// fully determined by (rows, cols, seed), every player's browser generates
// the identical maze locally — only the seed itself needs to be synced,
// which is a nice property this project's storage layer barely needs to work for.

export function generateMaze(rows, cols, seed) {
  const rng = (s) => { s = Math.sin(s) * 10000; return s - Math.floor(s); };
  let s = seed || Date.now();
  const rand = () => { s++; return rng(s); };

  const grid = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ top: true, right: true, bottom: true, left: true, visited: false })));
  const stack = [];
  const start = grid[0][0];
  start.visited = true;
  stack.push([0, 0]);

  while (stack.length > 0) {
    const [r, c] = stack[stack.length - 1];
    const neighbors = [];
    if (r > 0 && !grid[r - 1][c].visited) neighbors.push([r - 1, c, "top", "bottom"]);
    if (r < rows - 1 && !grid[r + 1][c].visited) neighbors.push([r + 1, c, "bottom", "top"]);
    if (c > 0 && !grid[r][c - 1].visited) neighbors.push([r, c - 1, "left", "right"]);
    if (c < cols - 1 && !grid[r][c + 1].visited) neighbors.push([r, c + 1, "right", "left"]);

    if (neighbors.length === 0) { stack.pop(); continue; }
    const [nr, nc, wall, oppWall] = neighbors[Math.floor(rand() * neighbors.length)];
    grid[r][c][wall] = false;
    grid[nr][nc][oppWall] = false;
    grid[nr][nc].visited = true;
    stack.push([nr, nc]);
  }
  return grid;
}

// facing: 0=N,1=E,2=S,3=W. Returns array of depth slices {openAhead, leftOpen, rightOpen}
export function firstPersonView(maze, r, c, facing, rows, cols) {
  const dirs = [
    { wall: "top", dr: -1, dc: 0, left: "left", right: "right" },
    { wall: "right", dr: 0, dc: 1, left: "top", right: "bottom" },
    { wall: "bottom", dr: 1, dc: 0, left: "right", right: "left" },
    { wall: "left", dr: 0, dc: -1, left: "bottom", right: "top" },
  ];
  const slices = [];
  let cr = r, cc = c;
  for (let d = 0; d < 6; d++) {
    if (cr < 0 || cc < 0 || cr >= rows || cc >= cols) break;
    const cell = maze[cr][cc];
    const dir = dirs[facing];
    const openAhead = !cell[dir.wall];
    slices.push({ leftOpen: !cell[dir.left], rightOpen: !cell[dir.right], openAhead });
    if (!openAhead) break;
    cr += dir.dr; cc += dir.dc;
  }
  return slices;
}

export const MAZE_DIRS = [
  { wall: "top", dr: -1, dc: 0 },
  { wall: "right", dr: 0, dc: 1 },
  { wall: "bottom", dr: 1, dc: 0 },
  { wall: "left", dr: 0, dc: -1 },
];

export const STORAGE_KEY_MAZE3D = "traitors:maze3d";
