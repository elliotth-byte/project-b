// ─── Shared board/tile engine for River Styx and The Wine-Dark Sea ───
// Greek-mythology reskins of Tsuro (boardgamegeek.com/boardgame/2513)
// and its expansion Tsuro of the Seas (boardgamegeek.com/boardgame/79066),
// same credit-the-source approach this app already takes with Spyfall
// and The Golden Fleece (see those games' own header comments). Both
// games share the exact same board geometry and tile-matching math —
// only the deck size, the marker vocabulary (marker vs boat), and
// whether a sea-monster roams the board differ — so that shared core
// lives here, and lib/games/riverStyxData.js / wineDarkSeaData.js each
// layer their own turn/deck/win-condition state on top of it.
//
// ─── Board ───
// A 6x6 grid, 36 cells, indexed 0..35 row-major (row = floor(idx/6),
// col = idx % 6).
//
// ─── Tiles ───
// Every tile has 4 paths connecting 8 edge points — 2 per side of the
// square, laid out clockwise starting at the top-left-ish point:
//   0,1 — top edge, left to right
//   2,3 — right edge, top to bottom
//   4,5 — bottom edge, right to left
//   6,7 — left edge, bottom to top
// A tile's "design" is a perfect matching of these 8 points into 4
// pairs — paths are free to cross visually inside the tile, exactly
// like the real game. Rotating a tile 90° clockwise maps every point
// i to (i+2) mod 8 (given/confirmed geometry — a quarter turn shifts
// you two point-slots around the same 8-point ring).
//
// ─── Where the tile catalog below comes from ───
// The real, licensed physical tile catalogs for Tsuro (35 tiles) and
// Tsuro of the Seas (55 "wake" tiles) aren't precisely sourceable here,
// so — same honesty precedent as this app's Golden Fleece treasure
// list (see goldenFleeceData.js's own header) — the deck is generated
// PROGRAMMATICALLY instead of hand-copied: enumerate every valid 4-pair
// perfect matching of the 8 points (there are 105 of them), then dedupe
// under the tile's own 4-fold rotational symmetry (two matchings that
// are rotations of each other count as the same physical tile, since a
// player can always just rotate the tile they're holding) so no two
// tiles in the deck are secretly the same design. That leaves exactly
// 35 rotationally-distinct designs — which, satisfyingly, is exactly
// the real base game's own tile count, a real structural fact about
// this puzzle rather than a coincidence this file forces. This is a
// procedurally-generated EQUIVALENT set matching the real games'
// mathematical structure, not a byte-for-byte port of the licensed
// physical tile catalog.
export const BOARD_SIZE = 6;
export const CELL_COUNT = BOARD_SIZE * BOARD_SIZE;

export function cellIndex(row, col) {
  return row * BOARD_SIZE + col;
}
export function cellRowCol(cell) {
  return { row: Math.floor(cell / BOARD_SIZE), col: cell % BOARD_SIZE };
}

export function rotatePoint(point, rotation) {
  return (point + 2 * rotation) % 8;
}

// Which side of the tile each point sits on, and which point on the
// NEIGHBORING tile it lines up with once tiles sit edge to edge.
const POINT_CROSS = {
  0: { side: "top", mapTo: 5 },
  1: { side: "top", mapTo: 4 },
  2: { side: "right", mapTo: 7 },
  3: { side: "right", mapTo: 6 },
  4: { side: "bottom", mapTo: 1 },
  5: { side: "bottom", mapTo: 0 },
  6: { side: "left", mapTo: 3 },
  7: { side: "left", mapTo: 2 },
};

// Steps from `cell` out through `point`, onto whichever neighboring
// cell/point that leads to — or null if that point faces off the edge
// of the board entirely (the "walked off the board" elimination case).
export function crossToNeighbor(cell, point) {
  const { row, col } = cellRowCol(cell);
  const info = POINT_CROSS[point];
  let nrow = row, ncol = col;
  if (info.side === "top") nrow -= 1;
  else if (info.side === "bottom") nrow += 1;
  else if (info.side === "left") ncol -= 1;
  else if (info.side === "right") ncol += 1;
  if (nrow < 0 || nrow >= BOARD_SIZE || ncol < 0 || ncol >= BOARD_SIZE) return null;
  return { cell: cellIndex(nrow, ncol), point: info.mapTo };
}

function normalizeMatching(pairs) {
  const norm = pairs.map(([a, b]) => (a < b ? [a, b] : [b, a]));
  norm.sort((a, b) => a[0] - b[0]);
  return norm;
}
function matchingKey(pairs) {
  return JSON.stringify(normalizeMatching(pairs));
}
function rotateMatching(pairs, steps) {
  return pairs.map(([a, b]) => [rotatePoint(a, steps), rotatePoint(b, steps)]);
}

function enumerateAllMatchings() {
  const out = [];
  function recurse(points, current) {
    if (points.length === 0) {
      out.push(normalizeMatching(current));
      return;
    }
    const [p, ...rest] = points;
    for (let i = 0; i < rest.length; i++) {
      const q = rest[i];
      const remaining = rest.slice(0, i).concat(rest.slice(i + 1));
      current.push([p, q]);
      recurse(remaining, current);
      current.pop();
    }
  }
  recurse([0, 1, 2, 3, 4, 5, 6, 7], []);
  return out;
}

function buildCanonicalDesigns() {
  const all = enumerateAllMatchings();
  const seen = new Set();
  const designs = [];
  for (const m of all) {
    const key = matchingKey(m);
    if (seen.has(key)) continue;
    let rotated = m;
    for (let r = 0; r < 4; r++) {
      seen.add(matchingKey(rotated));
      rotated = rotateMatching(rotated, 1);
    }
    designs.push(m);
  }
  return designs;
}

// 35 rotationally-distinct tile designs, in a fixed deterministic
// order (purely a function of the enumeration above — no randomness).
export const ALL_TILE_DESIGNS = buildCanonicalDesigns();

export function rotatedDesign(designIndex, rotation) {
  return rotateMatching(ALL_TILE_DESIGNS[designIndex], rotation % 4);
}

export function partnerPoint(matching, point) {
  for (const [a, b] of matching) {
    if (a === point) return b;
    if (b === point) return a;
  }
  return null; // shouldn't happen — every point appears in exactly one pair
}

// ─── Starting slots ───
// Real Tsuro lets you place your marker on any outer-edge point,
// facing inward. Enumerated here in a fixed clockwise perimeter order
// (top row left-to-right, right column top-to-bottom, bottom row
// right-to-left, left column bottom-to-top) so evenly-spaced picks
// (see pickStartSlots) spread players sensibly around the board
// instead of clustering.
export function boundarySlots() {
  const slots = [];
  const addIfEdge = (cell, point, side) => {
    const { row, col } = cellRowCol(cell);
    const isEdge =
      (side === "top" && row === 0) ||
      (side === "bottom" && row === BOARD_SIZE - 1) ||
      (side === "left" && col === 0) ||
      (side === "right" && col === BOARD_SIZE - 1);
    if (isEdge) slots.push({ cell, point });
  };
  // Top row, left-to-right, using the two top-edge points (0,1).
  for (let col = 0; col < BOARD_SIZE; col++) {
    const cell = cellIndex(0, col);
    addIfEdge(cell, 0, "top");
    addIfEdge(cell, 1, "top");
  }
  // Right column, top-to-bottom (points 2,3).
  for (let row = 0; row < BOARD_SIZE; row++) {
    const cell = cellIndex(row, BOARD_SIZE - 1);
    addIfEdge(cell, 2, "right");
    addIfEdge(cell, 3, "right");
  }
  // Bottom row, right-to-left (points 4,5 already run right-to-left).
  for (let col = BOARD_SIZE - 1; col >= 0; col--) {
    const cell = cellIndex(BOARD_SIZE - 1, col);
    addIfEdge(cell, 4, "bottom");
    addIfEdge(cell, 5, "bottom");
  }
  // Left column, bottom-to-top (points 6,7 already run bottom-to-top).
  for (let row = BOARD_SIZE - 1; row >= 0; row--) {
    const cell = cellIndex(row, 0);
    addIfEdge(cell, 6, "left");
    addIfEdge(cell, 7, "left");
  }
  return slots;
}

// Evenly-spaced starting slots for `n` players around the perimeter.
export function pickStartSlots(n) {
  const all = boundarySlots();
  const picks = [];
  for (let i = 0; i < n; i++) {
    picks.push(all[Math.floor((i * all.length) / n)]);
  }
  return picks;
}

// ─── Deck ───
export function shuffledIndexes(length) {
  const arr = Array.from({ length }, (_, i) => i % ALL_TILE_DESIGNS.length);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ─── Movement resolution ───
// `positions`: { [playerId]: { cell: number|null, point: number|null,
//   status: "active"|"eliminated" } }.
// `tilesByCell`: { [cell]: { designIndex, rotation } } — includes the
// tile that was JUST placed at `placedCell` (caller adds it before
// calling this).
//
// Every player currently resting at `placedCell` (there can be more
// than one, approaching from different points, if they were all
// waiting on this same still-empty cell) starts moving simultaneously
// this turn — a real chain reaction that can cascade through any
// number of already-placed tiles beyond it. Advanced in lock-step, one
// hop at a time, so two markers converging on the exact same point at
// the exact same moment (whether that's mid-network or the point where
// they'd both come to rest) collide and are BOTH eliminated, exactly
// like the real game's dragons crashing into each other.
export function resolveMovement(positions, tilesByCell, placedCell) {
  const nextPositions = {};
  Object.entries(positions).forEach(([id, p]) => { nextPositions[id] = { ...p }; });

  const moverIds = Object.keys(positions).filter(
    (id) => positions[id].status === "active" && positions[id].cell === placedCell
  );
  if (moverIds.length === 0) return { positions: nextPositions, eliminatedIds: [], restedIds: [] };

  const movers = {};
  moverIds.forEach((id) => {
    movers[id] = { cell: positions[id].cell, point: positions[id].point, done: false };
  });

  const eliminatedIds = [];
  const restedIds = [];

  // Positions of everyone ELSE currently resting on the board (only
  // gap cells — i.e. cells with no tile — ever hold a resting marker),
  // so a mover landing exactly on one of these also collides.
  const staticRestKey = (id) => `${positions[id].cell}:${positions[id].point}`;
  const staticResters = Object.keys(positions).filter(
    (id) => positions[id].status === "active" && !moverIds.includes(id) && positions[id].cell != null
  );

  let guard = 0;
  while (moverIds.some((id) => !movers[id].done) && guard < 200) {
    guard++;
    const stillMoving = moverIds.filter((id) => !movers[id].done);
    const stepResults = {}; // id -> { landed: "gap"|"edge"|"tile", cell, point }

    stillMoving.forEach((id) => {
      const m = movers[id];
      const tile = tilesByCell[m.cell];
      if (!tile) {
        stepResults[id] = { landed: "gap", cell: m.cell, point: m.point };
        return;
      }
      const matching = rotatedDesign(tile.designIndex, tile.rotation);
      const exitPoint = partnerPoint(matching, m.point);
      const crossed = crossToNeighbor(m.cell, exitPoint);
      if (!crossed) {
        stepResults[id] = { landed: "edge" };
        return;
      }
      stepResults[id] = { landed: "tile", cell: crossed.cell, point: crossed.point };
    });

    // Group everyone (movers landing this hop + static resters) by
    // position key to detect collisions.
    const byKey = {};
    stillMoving.forEach((id) => {
      const r = stepResults[id];
      if (r.landed === "edge") return; // handled separately below
      const key = `${r.cell}:${r.point}`;
      (byKey[key] = byKey[key] || []).push(id);
    });
    staticResters.forEach((id) => {
      const key = staticRestKey(id);
      if (byKey[key]) byKey[key].push(id);
    });

    const collidedIds = new Set();
    Object.values(byKey).forEach((ids) => {
      if (ids.length > 1) ids.forEach((id) => collidedIds.add(id));
    });

    stillMoving.forEach((id) => {
      const r = stepResults[id];
      if (r.landed === "edge") {
        movers[id].done = true;
        eliminatedIds.push(id);
        nextPositions[id] = { cell: null, point: null, status: "eliminated" };
        return;
      }
      if (collidedIds.has(id)) {
        movers[id].done = true;
        if (!eliminatedIds.includes(id)) eliminatedIds.push(id);
        nextPositions[id] = { cell: null, point: null, status: "eliminated" };
        return;
      }
      if (r.landed === "gap") {
        movers[id].done = true;
        restedIds.push(id);
        nextPositions[id] = { cell: r.cell, point: r.point, status: "active" };
        return;
      }
      // landed === "tile" and no collision — keep moving next hop.
      movers[id].cell = r.cell;
      movers[id].point = r.point;
    });

    // A static rester who just collided also needs their position
    // marked eliminated, even though they weren't in `movers`.
    collidedIds.forEach((id) => {
      if (!moverIds.includes(id)) {
        if (!eliminatedIds.includes(id)) eliminatedIds.push(id);
        nextPositions[id] = { cell: null, point: null, status: "eliminated" };
      }
    });
  }

  return { positions: nextPositions, eliminatedIds, restedIds };
}
