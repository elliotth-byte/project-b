// ─── The Labyrinth of the Minotaur ───
// SOLO, self-contained tilt/gyroscope maze game. Every player gets their
// own deterministically-generated maze — seeded off THEIR OWN persisted
// start timestamp (see MinotaurMazePlayer.jsx's usePersistedStart call),
// not the shared challenge.startedAt — so mazes aren't shared between
// players the way Sliding Puzzle's/Life's a Tapestry's scrambles are.
// There's no reason for everyone to race an identical layout here (no
// shared real-time element like Red Light Green Light's light schedule),
// and seeding per-player also means a maze is stable across a given
// player's own re-renders/reconnects without needing to persist the
// maze itself anywhere.
//
// Generated via randomized DFS ("recursive backtracker") — a classic
// perfect maze: exactly one path between any two cells, no loops, fully
// solvable by construction. No separate solvability check needed, same
// reasoning as slidingPuzzleData.js/lifesTapestryData.js's own
// shuffle-via-legal-moves tricks sidestepping their own solvability
// concerns.
export const GRID = 10; // 10x10 cells

// Same seeded LCG as lib/games/slidingPuzzleData.js / lifesTapestryData.js
// — kept byte-for-byte identical on purpose so every mini-game in this
// app that needs a deterministic shuffle behaves the same way.
function seededRandom(seed) {
  let s = seed || 1;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

// vWalls[r][c] (c in 0..size): wall to the LEFT of column c in row r —
// vWalls[r][0] and vWalls[r][size] are the outer left/right border and
// always stay true.
// hWalls[r][c] (r in 0..size): wall ABOVE row r at column c — hWalls[0][c]
// and hWalls[size][c] are the outer top/bottom border and always stay true.
// Start is top-left (0,0), exit is bottom-right (size-1,size-1) — as far
// apart on the grid as the maze allows.
export function generateMaze(seed, size = GRID) {
  const rand = seededRandom(seed || 1);
  const vWalls = Array.from({ length: size }, () => Array(size + 1).fill(true));
  const hWalls = Array.from({ length: size + 1 }, () => Array(size).fill(true));
  const visited = Array.from({ length: size }, () => Array(size).fill(false));

  const start = [0, 0];
  const goal = [size - 1, size - 1];
  visited[start[0]][start[1]] = true;
  const stack = [start];

  while (stack.length > 0) {
    const [r, c] = stack[stack.length - 1];
    const neighbors = [];
    if (r > 0 && !visited[r - 1][c]) neighbors.push([r - 1, c, "up"]);
    if (r < size - 1 && !visited[r + 1][c]) neighbors.push([r + 1, c, "down"]);
    if (c > 0 && !visited[r][c - 1]) neighbors.push([r, c - 1, "left"]);
    if (c < size - 1 && !visited[r][c + 1]) neighbors.push([r, c + 1, "right"]);

    if (neighbors.length === 0) { stack.pop(); continue; }

    const [nr, nc, dir] = neighbors[Math.floor(rand() * neighbors.length)];
    if (dir === "up") hWalls[r][c] = false;
    else if (dir === "down") hWalls[r + 1][c] = false;
    else if (dir === "left") vWalls[r][c] = false;
    else if (dir === "right") vWalls[r][c + 1] = false;

    visited[nr][nc] = true;
    stack.push([nr, nc]);
  }

  return { size, vWalls, hWalls, start, goal };
}

// Whether you can pass from cell (r,c) toward `dir` — used both by the
// BFS distance map below and available for anything else that needs a
// pure "is there a wall here" check.
function canPass(maze, r, c, dir) {
  const { vWalls, hWalls } = maze;
  if (dir === "up") return !hWalls[r][c];
  if (dir === "down") return !hWalls[r + 1][c];
  if (dir === "left") return !vWalls[r][c];
  if (dir === "right") return !vWalls[r][c + 1];
  return false;
}

// Flat list of wall line segments in CELL UNITS (0..size on both axes) —
// the renderer scales these into pixels itself. Every interior wall the
// DFS carve left standing, plus the full outer border (vWalls[r][0]/
// [size] and hWalls[0]/[size][c] are always true by construction above).
export function wallSegments(maze) {
  const { size, vWalls, hWalls } = maze;
  const segs = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c <= size; c++) {
      if (vWalls[r][c]) segs.push({ x1: c, y1: r, x2: c, y2: r + 1 });
    }
  }
  for (let r = 0; r <= size; r++) {
    for (let c = 0; c < size; c++) {
      if (hWalls[r][c]) segs.push({ x1: c, y1: r, x2: c + 1, y2: r });
    }
  }
  return segs;
}

// BFS distance (in cells) from every cell to the GOAL, computed by
// flooding outward from the goal through the maze's actual open
// passages. distances[start] is the maze's true shortest-path length —
// used both to floor the finish-tier score (see FINISH_BASE in
// MinotaurMazePlayer.jsx) and, per-cell, as the "how far through the
// maze has this player actually progressed" partial score for anyone
// who runs out of time without finishing.
export function bfsDistances(maze) {
  const { size, goal } = maze;
  const dist = Array.from({ length: size }, () => Array(size).fill(-1));
  const [gr, gc] = goal;
  dist[gr][gc] = 0;
  const queue = [[gr, gc]];
  let head = 0;
  const dirs = [["up", -1, 0], ["down", 1, 0], ["left", 0, -1], ["right", 0, 1]];

  while (head < queue.length) {
    const [r, c] = queue[head++];
    for (const [dir, dr, dc] of dirs) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
      if (dist[nr][nc] !== -1) continue;
      if (!canPass(maze, r, c, dir)) continue;
      dist[nr][nc] = dist[r][c] + 1;
      queue.push([nr, nc]);
    }
  }
  return dist;
}

// "Cells of shortest-path progress made" from wherever the ball
// currently is — maxDist (the true shortest start->goal distance) minus
// however many of those cells remain, clamped to never go negative (a
// player who wanders off the shortest path shouldn't score BELOW where
// they started) or above maxDist (reaching the goal cell scores exactly
// maxDist here; the real finish bonus is layered on top of this in
// MinotaurMazePlayer.jsx via FINISH_BASE).
export function progressForCell(distances, maxDist, r, c) {
  const d = distances?.[r]?.[c];
  if (d == null || d < 0) return 0;
  return Math.max(0, Math.min(maxDist, maxDist - d));
}

// Pixel-space (x,y) -> the grid cell it falls in, clamped to the board.
export function cellAt(x, y, size, cellPx) {
  const c = Math.max(0, Math.min(size - 1, Math.floor(x / cellPx)));
  const r = Math.max(0, Math.min(size - 1, Math.floor(y / cellPx)));
  return { r, c };
}

// ─── Shared black-figure Greek-pottery palette ───
// Same INK/CLAY pair as lib/games/lifesTapestryData.js — CLAY for detail
// drawn ON TOP of an INK silhouette, INK for anything (walls, the
// labrys's haft) rendered directly against the lighter clay/parchment
// background.
export const INK = "#1a0f08";
export const CLAY = "#c2703d";
export const WEAVE_DARK = "#2a1810";
export const WEAVE_LIGHT = "#3a2013";

export const WALL_THICKNESS_RATIO = 0.16; // fraction of one cell's width
export const BALL_RADIUS_RATIO = 0.26;
export const GOAL_RADIUS_RATIO = 0.34;
