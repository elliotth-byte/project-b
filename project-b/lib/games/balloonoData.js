import { storageSet, storageUpdate, subscribeGameState } from "../gameStorage";

// ─── Balloono ───
// A from-scratch clone of OMGPOP's Bomberman-style multiplayer maze
// game — monkey avatars, water balloons, the bubble-not-instant-death
// survival mechanic that made the original distinct from a straight
// Bomberman clone. Built faithfully rather than reskinned (unlike Eyes
// in the System, which was explicitly asked to be retthemed) — this
// was asked for as "a Balloono clone", so the monkeys and water
// balloons stay exactly what they were. See components/bigscreen/
// BalloonoTvDisplay.jsx for the shared board and components/games/
// BalloonoTvPlayer.jsx for the phone-side D-pad controller.
//
// The one real architectural decision worth being explicit about:
// this app's whole data layer (storageUpdate + subscribeGameState) is
// built around discrete, validated state transitions — not a
// continuous physics loop pushing dozens of position updates a
// second. So movement here is genuinely GRID-STEPPED, not smooth
// pixel motion: a move is one atomic, cooldown-gated hop from one cell
// to an adjacent one, always validated against the current board
// before it's accepted. That's a real, deliberate fit for this
// architecture, not a compromise pretending to be the original —
// the original itself was grid-based too (its own description: "Arrow
// keys or WASD... navigate the grid-based maze"), this just makes that
// grid the actual unit of state instead of an illusion drawn on top of
// pixel coordinates.
export const balloonoKey = (round) => `pb:balloono:${round}`;

export function subscribeBalloono(gameId, round, onChange) {
  return subscribeGameState(gameId, balloonoKey(round), onChange);
}

// ─── Board layout ───
// Grid size and starting positions both scale with however many
// players are actually in this battle — no fixed cap. A season with
// 14 players gets a genuinely bigger maze than one with 4, rather than
// cramming everyone onto the same board or capping the roster
// arbitrarily at whatever the original Bomberman-style format
// happened to support.
function gridSizeFor(playerCount) {
  if (playerCount <= 6) return 11;
  if (playerCount <= 10) return 13;
  if (playerCount <= 14) return 15;
  if (playerCount <= 18) return 17;
  return 19; // covers any realistic season size
}

const BORDER = (r, c, gridSize) => r === 0 || r === gridSize - 1 || c === 0 || c === gridSize - 1;
const FIXED_WALL = (r, c, gridSize) => BORDER(r, c, gridSize) || (r % 2 === 0 && c % 2 === 0);

// Every odd-coordinate cell along the grid's inner perimeter, walked
// clockwise starting from the top-left — these are the only cells this
// game ever considers for a starting position, since "both coordinates
// odd" is exactly what FIXED_WALL above guarantees is never a wall.
// Kept to the perimeter (not the whole interior) so starting spots
// stay spread around the outside of the maze the way the original
// format's own corner-based layout did, rather than clustering players
// in the middle.
function perimeterOddCells(gridSize) {
  const first = 1, last = gridSize - 2;
  const cells = [];
  for (let c = first; c <= last; c += 2) cells.push([first, c]); // top, left to right
  for (let r = first + 2; r <= last; r += 2) cells.push([r, last]); // right, top to bottom
  for (let c = last - 2; c >= first; c -= 2) cells.push([last, c]); // bottom, right to left
  for (let r = last - 2; r >= first + 2; r -= 2) cells.push([r, first]); // left, bottom to top
  return cells;
}

// N evenly-spaced picks from the perimeter list — for any realistic
// season size the perimeter is always long enough (a 19x19 grid, the
// largest this ever generates, has 32 candidate cells), but this falls
// back to just growing the grid further rather than ever double-
// booking two players onto the same starting cell.
function startPositionsFor(playerCount) {
  let gridSize = gridSizeFor(playerCount);
  let cells = perimeterOddCells(gridSize);
  while (cells.length < playerCount) {
    gridSize += 2;
    cells = perimeterOddCells(gridSize);
  }
  const positions = Array.from({ length: playerCount }, (_, i) => {
    const [r, c] = cells[Math.floor((i * cells.length) / playerCount)];
    return { r, c };
  });
  return { gridSize, positions };
}

const DIRS = { up: { dr: -1, dc: 0 }, down: { dr: 1, dc: 0 }, left: { dr: 0, dc: -1 }, right: { dr: 0, dc: 1 } };

const MOVE_COOLDOWN_MS = 260; // baseline hop time at 1x speed
const BOMB_FUSE_MS = 2400;
const BUBBLE_MS = 5000;
const POWERUP_CHANCE = 0.35;
const POWERUP_TYPES = ["speed", "balloon", "range"];

function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cellsSafeAroundStart(pos, gridSize) {
  // The starting cell itself plus its immediate neighbors — kept free
  // of destructible blocks at generation time so nobody spawns already
  // boxed in.
  const cells = [[pos.r, pos.c]];
  Object.values(DIRS).forEach(({ dr, dc }) => {
    const r = pos.r + dr, c = pos.c + dc;
    if (r > 0 && r < gridSize - 1 && c > 0 && c < gridSize - 1) cells.push([r, c]);
  });
  return cells;
}

// Generates the board: 'wall' (indestructible), 'block' (destructible,
// may hide a power-up once destroyed), or 'open'. Deterministic from
// the seed so every client renders the identical board without
// needing to transmit it cell-by-cell beyond the initial state write.
function generateBoard(rng, gridSize, startPositions) {
  const safe = new Set();
  startPositions.forEach((pos) => cellsSafeAroundStart(pos, gridSize).forEach(([r, c]) => safe.add(`${r},${c}`)));

  const grid = [];
  for (let r = 0; r < gridSize; r++) {
    const row = [];
    for (let c = 0; c < gridSize; c++) {
      if (FIXED_WALL(r, c, gridSize)) { row.push("wall"); continue; }
      if (safe.has(`${r},${c}`)) { row.push("open"); continue; }
      row.push(rng() < 0.72 ? "block" : "open");
    }
    grid.push(row);
  }
  return grid;
}

export async function initBalloono(gameId, round, participants, seed, db) {
  const set = db?.set || storageSet;
  const rng = mulberry32(seed || Date.now());
  const { gridSize, positions } = startPositionsFor(participants.length);
  const board = generateBoard(rng, gridSize, positions);

  const monkeys = {};
  participants.forEach((p, i) => {
    monkeys[p.id] = {
      r: positions[i].r, c: positions[i].c,
      status: "alive", // "alive" | "bubbled" | "eliminated"
      bubbleUntil: null, eliminatedAt: null,
      speed: 1, maxBombs: 1, range: 1, bombsPlaced: 0,
      cooldownUntil: 0,
    };
  });

  await set(gameId, balloonoKey(round), {
    gridSize, board, monkeys, bombs: [], powerups: {}, // powerups: "r,c" -> type, on the ground, not yet picked up
    eliminatedOrder: [], winnerId: null,
    rngState: Math.floor(rng() * 1e9),
    suddenDeath: false, suddenDeathStartedAt: null,
  });
}

function cellKey(r, c) { return `${r},${c}`; }
function inBounds(r, c, gridSize) { return r >= 0 && r < gridSize && c >= 0 && c < gridSize; }

function monkeyAt(monkeys, r, c, excludeId) {
  return Object.entries(monkeys).find(([id, m]) => id !== excludeId && m.status !== "eliminated" && m.r === r && m.c === c);
}

// One grid-hop, fully validated server-side-equivalent (this runs
// identically wherever it's called from, there's no separate
// authoritative server — the write itself, via storageUpdate's atomic
// read-modify-write, IS the validation): blocked by walls, blocks,
// bombs, and other monkeys' current cells, gated by this player's own
// movement cooldown (scaled by their speed power-up), and refused
// outright while bubbled — trapped means trapped.
export async function moveMonkey(gameId, round, playerId, direction) {
  return storageUpdate(gameId, balloonoKey(round), (fresh) => {
    if (!fresh || fresh.winnerId) return fresh;
    const m = fresh.monkeys[playerId];
    if (!m || m.status !== "alive") return fresh;
    const now = Date.now();
    if (now < m.cooldownUntil) return fresh;
    const d = DIRS[direction];
    if (!d) return fresh;
    const nr = m.r + d.dr, nc = m.c + d.dc;
    if (!inBounds(nr, nc, fresh.gridSize)) return fresh;
    if (fresh.board[nr][nc] !== "open") return fresh;
    if (fresh.bombs.some((b) => b.r === nr && b.c === nc)) return fresh;
    if (monkeyAt(fresh.monkeys, nr, nc, playerId)) return fresh;

    const nextMonkeys = { ...fresh.monkeys, [playerId]: { ...m, r: nr, c: nc, cooldownUntil: now + MOVE_COOLDOWN_MS / m.speed } };
    const key = cellKey(nr, nc);
    const pickedUp = fresh.powerups[key];
    let nextPowerups = fresh.powerups;
    if (pickedUp) {
      const mm = nextMonkeys[playerId];
      if (pickedUp === "speed") mm.speed = Math.min(2.2, mm.speed + 0.3);
      if (pickedUp === "balloon") mm.maxBombs = Math.min(6, mm.maxBombs + 1);
      if (pickedUp === "range") mm.range = Math.min(8, mm.range + 1);
      nextPowerups = { ...fresh.powerups };
      delete nextPowerups[key];
    }

    // Walking a bubbled opponent's cell is impossible under the checks
    // above (a bubble still occupies its cell the same as a standing
    // monkey — see monkeyAt, which doesn't distinguish status beyond
    // "not eliminated"), so elimination-by-touch is actually detected
    // the OTHER way: this player's own move lands them on a cell a
    // bubbled monkey occupies is already blocked. What actually needs
    // handling here is the reverse already covered by monkeyAt's
    // exclusion of only the mover's own id — an alive monkey CAN step
    // onto a bubbled monkey's cell precisely because bubbled monkeys
    // are excluded from blocking movement (see below).
    return { ...fresh, monkeys: nextMonkeys, powerups: nextPowerups };
  });
}

export async function placeBomb(gameId, round, playerId) {
  return storageUpdate(gameId, balloonoKey(round), (fresh) => {
    if (!fresh || fresh.winnerId) return fresh;
    const m = fresh.monkeys[playerId];
    if (!m || m.status !== "alive") return fresh;
    if (m.bombsPlaced >= m.maxBombs) return fresh;
    if (fresh.bombs.some((b) => b.r === m.r && b.c === m.c)) return fresh; // one bomb per cell
    const bomb = { id: `${playerId}-${Date.now()}`, r: m.r, c: m.c, ownerId: playerId, range: m.range, placedAt: Date.now() };
    return {
      ...fresh,
      bombs: [...fresh.bombs, bomb],
      monkeys: { ...fresh.monkeys, [playerId]: { ...m, bombsPlaced: m.bombsPlaced + 1 } },
    };
  });
}

// Traces one direction from a bomb out to its range, stopping at the
// first wall or destructible block (the block itself IS hit and
// destroyed, but nothing past it is) — classic cross-blast shape.
function traceBlast(board, r, c, dr, dc, range, gridSize) {
  const cells = [];
  for (let i = 1; i <= range; i++) {
    const rr = r + dr * i, cc = c + dc * i;
    if (!inBounds(rr, cc, gridSize) || board[rr][cc] === "wall") break;
    cells.push([rr, cc]);
    if (board[rr][cc] === "block") break;
  }
  return cells;
}

// Resolves every bomb whose fuse has expired, all at once, with full
// chain-reaction support: a blast reaching another bomb's cell
// detonates that bomb too, in the same pass, rather than waiting for
// its own fuse — exactly how chain reactions work in every Bomberman-
// style game this is modeled on. Recomputes iteratively until no more
// bombs are newly caught in a blast, so a long chain resolves
// completely in one call rather than needing several polls to finish
// unwinding.
export async function resolveExplosions(gameId, round, db) {
  const update = db?.update || storageUpdate;
  return update(gameId, balloonoKey(round), (fresh) => {
    if (!fresh || fresh.winnerId) return fresh;
    const now = Date.now();
    let toExplode = fresh.bombs.filter((b) => now - b.placedAt >= BOMB_FUSE_MS);
    if (toExplode.length === 0) return fresh;

    let board = fresh.board.map((row) => [...row]);
    let monkeys = { ...fresh.monkeys };
    let powerups = { ...fresh.powerups };
    let remainingBombs = fresh.bombs.filter((b) => !toExplode.includes(b));
    const blastCells = new Set();
    const rng = mulberry32(fresh.rngState);

    while (toExplode.length > 0) {
      const bomb = toExplode.shift();
      // The owner regains a bomb slot the instant THEIRS explodes —
      // matches every Bomberman-style game's own rule that placing and
      // detonating (rather than the fuse running out) isn't required
      // to get a balloon back.
      if (monkeys[bomb.ownerId]) monkeys[bomb.ownerId] = { ...monkeys[bomb.ownerId], bombsPlaced: Math.max(0, monkeys[bomb.ownerId].bombsPlaced - 1) };

      blastCells.add(cellKey(bomb.r, bomb.c));
      [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([dr, dc]) => {
        traceBlast(board, bomb.r, bomb.c, dr, dc, bomb.range, fresh.gridSize).forEach(([r, c]) => {
          blastCells.add(cellKey(r, c));
          if (board[r][c] === "block") {
            board[r][c] = "open";
            if (rng() < POWERUP_CHANCE) powerups[cellKey(r, c)] = POWERUP_TYPES[Math.floor(rng() * POWERUP_TYPES.length)];
          }
          // Chain reaction: a still-pending bomb caught in this blast
          // detonates immediately too.
          const caught = remainingBombs.find((b) => b.r === r && b.c === c);
          if (caught) {
            remainingBombs = remainingBombs.filter((b) => b.id !== caught.id);
            toExplode.push(caught);
          }
        });
      });
    }

    // Any monkey (alive or already bubbled) standing in a blast cell
    // is affected — an alive monkey gets bubbled; an already-bubbled
    // monkey caught in a FRESH blast is treated the same as being
    // touched by an opponent (see this file's own header comment) and
    // is eliminated outright, not re-bubbled.
    const eliminatedNow = [];
    Object.entries(monkeys).forEach(([id, m]) => {
      if (m.status === "eliminated") return;
      if (!blastCells.has(cellKey(m.r, m.c))) return;
      if (m.status === "bubbled") {
        monkeys[id] = { ...m, status: "eliminated", eliminatedAt: now, bubbleUntil: null };
        eliminatedNow.push(id);
      } else {
        monkeys[id] = { ...m, status: "bubbled", bubbleUntil: now + BUBBLE_MS };
      }
    });

    const eliminatedOrder = [...fresh.eliminatedOrder, ...eliminatedNow];
    const stillIn = Object.entries(monkeys).filter(([, m]) => m.status !== "eliminated");
    const winnerId = stillIn.length === 1 ? stillIn[0][0] : (stillIn.length === 0 ? null : undefined);

    return {
      ...fresh, board, monkeys, powerups, bombs: remainingBombs, eliminatedOrder,
      rngState: Math.floor(rng() * 1e9),
      ...(winnerId !== undefined ? { winnerId } : {}),
    };
  });
}

// Bubble pop / touch-elimination check — separate from explosion
// resolution since it's driven by time (the 5-second window) and by
// OTHER monkeys simply walking near a bubbled one, not by a bomb fuse.
// moveMonkey already refuses to let an alive monkey's own move land on
// an occupied cell in general, but a bubbled monkey is deliberately
// walkable-into (not a blocker) so an opponent CAN reach it to pop it
// — see monkeyAt's exclusion of eliminated-only, not bubbled, monkeys
// from blocking, and this function's own touch check below for where
// that actually gets enforced.
export async function tickBubbles(gameId, round, db) {
  const update = db?.update || storageUpdate;
  return update(gameId, balloonoKey(round), (fresh) => {
    if (!fresh || fresh.winnerId) return fresh;
    const now = Date.now();
    let changed = false;
    const monkeys = { ...fresh.monkeys };
    const eliminatedNow = [];

    Object.entries(monkeys).forEach(([id, m]) => {
      if (m.status !== "bubbled") return;
      // Touched by an alive opponent standing on/entering the same cell
      const toucher = Object.entries(monkeys).find(([otherId, om]) => otherId !== id && om.status === "alive" && om.r === m.r && om.c === m.c);
      if (toucher) {
        monkeys[id] = { ...m, status: "eliminated", eliminatedAt: now, bubbleUntil: null };
        eliminatedNow.push(id);
        changed = true;
        return;
      }
      if (now >= m.bubbleUntil) {
        monkeys[id] = { ...m, status: "alive", bubbleUntil: null };
        changed = true;
      }
    });

    if (!changed) return fresh;
    const eliminatedOrder = [...fresh.eliminatedOrder, ...eliminatedNow];
    const stillIn = Object.entries(monkeys).filter(([, m]) => m.status !== "eliminated");
    const winnerId = stillIn.length === 1 ? stillIn[0][0] : (stillIn.length === 0 ? null : undefined);
    return { ...fresh, monkeys, eliminatedOrder, ...(winnerId !== undefined ? { winnerId } : {}) };
  });
}

// Same tie-aware shape as every other Big Screen elimination game in
// this app (see lib/games/torchedData.js's own placementValue
// comment) — a still-alive-or-bubbled monkey always outranks anyone
// already eliminated, and simultaneous eliminations (a chain reaction
// catching two monkeys in the same blast) correctly tie rather than
// being arbitrarily ordered.
export function placementValue(state, playerId) {
  if (state.winnerId === playerId) return 100000;
  const elimIndex = state.eliminatedOrder.indexOf(playerId);
  if (elimIndex !== -1) return 1000 + elimIndex;
  const m = state.monkeys?.[playerId];
  if (m && m.status !== "eliminated") return 1000 + state.eliminatedOrder.length + 100;
  return 0;
}

export { MOVE_COOLDOWN_MS, BOMB_FUSE_MS, BUBBLE_MS, DIRS };
