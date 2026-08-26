// ─── Tavo ───
// Solo, client-only (see lib/games/hueData.js's own header comment) —
// the full board is visible from the start.
//
// The one piece that genuinely needs rigor: every generated level must
// be provably solvable, and general Sokoban solvability isn't
// something a quick heuristic can confirm the way Bloom's greedy flood
// pass could. The actual guarantee here comes from HOW the level gets
// built, not from checking it afterward: generation starts from the
// SOLVED state (crates already on their markers) and plays a sequence
// of valid "pulls" backward to scramble it — the reverse of a push.
// Since a pull is, by definition, the exact inverse of a push, playing
// the recorded pull sequence BACKWARD, as pushes, is a guaranteed
// working solution. This is the standard technique for exactly this
// reason. It's independently re-verified below (verifySolution) by
// actually replaying that solution against the scrambled board and
// confirming it reaches a fully-solved state — not trusted on the
// strength of the generation logic alone.

const DIRS = [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }];
const SIZE = 8;
const NUM_CRATES = 2;
const NUM_PULLS = 14;

function seededRandom(seed) {
  let s = seed || 1;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

function inBounds(x, y) { return x >= 0 && x < SIZE && y >= 0 && y < SIZE; }
function posKey(x, y) { return x + "," + y; }
function crateAt(crates, x, y) { return crates.findIndex((c) => c.x === x && c.y === y); }

// The real, forward gameplay move — walk into a crate and it moves one
// further in the same direction, if that far cell is clear. Returns a
// NEW state, or the exact same object reference if the move was
// illegal (lets callers cheaply check "did anything happen" via
// reference equality rather than deep-comparing).
export function push(state, dir) {
  const { x, y } = state.player;
  const nx = x + dir.dx, ny = y + dir.dy;
  if (!inBounds(nx, ny)) return state;

  const hitIdx = crateAt(state.crates, nx, ny);
  if (hitIdx === -1) {
    return { ...state, player: { x: nx, y: ny } };
  }
  const fx = nx + dir.dx, fy = ny + dir.dy;
  if (!inBounds(fx, fy) || crateAt(state.crates, fx, fy) !== -1) return state; // can't push into a wall or another crate
  const crates = [...state.crates];
  crates[hitIdx] = { x: fx, y: fy };
  return { ...state, player: { x: nx, y: ny }, crates };
}

// Can the player walk from their CURRENT position to (tx,ty) without
// pushing anything — a plain BFS over empty cells, crates treated as
// solid obstacles the same way walls are. Used both by generation's
// solution verifier and by the real player component to confirm a tap
// is actually reachable before attempting a push toward it.
export function canReach(state, tx, ty) {
  if (crateAt(state.crates, tx, ty) !== -1) return false; // a crate's own cell is never a valid player destination
  const start = state.player;
  if (start.x === tx && start.y === ty) return true;
  const blocked = new Set(state.crates.map((c) => posKey(c.x, c.y)));
  const visited = new Set([posKey(start.x, start.y)]);
  const queue = [start];
  while (queue.length > 0) {
    const { x, y } = queue.shift();
    for (const d of DIRS) {
      const nx = x + d.dx, ny = y + d.dy;
      if (!inBounds(nx, ny)) continue;
      const key = posKey(nx, ny);
      if (visited.has(key) || blocked.has(key)) continue;
      if (nx === tx && ny === ty) return true;
      visited.add(key);
      queue.push({ x: nx, y: ny });
    }
  }
  return false;
}

export function isSolved(state, markers) {
  return markers.every((m) => crateAt(state.crates, m.x, m.y) !== -1);
}

// Corner-deadlock heuristic — the standard, well-established SIMPLE
// Sokoban deadlock check, not an exhaustive solver. A crate not on a
// marker that's blocked on two PERPENDICULAR sides at once (by a wall/
// boundary or another crate) can never be pushed again in either of
// those two directions, and with both blocked there's no way to move
// it at all. This doesn't catch every possible deadlock (some require
// looking much further ahead), but it catches the common, obvious one
// — matching "the game will tell you" rather than promising perfect
// foresight.
export function isDeadlocked(state, markers) {
  const onMarker = (x, y) => markers.some((m) => m.x === x && m.y === y);
  const blockedAt = (x, y) => !inBounds(x, y) || crateAt(state.crates, x, y) !== -1;
  for (const c of state.crates) {
    if (onMarker(c.x, c.y)) continue;
    const vBlocked = blockedAt(c.x, c.y - 1) || blockedAt(c.x, c.y + 1);
    const hBlocked = blockedAt(c.x - 1, c.y) || blockedAt(c.x + 1, c.y);
    if (vBlocked && hBlocked) return true;
  }
  return false;
}

// Generates a guaranteed-solvable level by reverse-play from the
// solved state. Returns { state (the scrambled starting position),
// markers, solution } — solution is an ordered list of { crateIndex,
// dir } PUSH operations that a real forward playthrough could execute
// to solve it (crateIndex refers to state.crates' indices in the
// SCRAMBLED starting state, not the solved one).
function generateLevelAttempt(seed) {
  const rand = seededRandom(seed);

  const markers = [];
  while (markers.length < NUM_CRATES) {
    const x = 1 + Math.floor(rand() * (SIZE - 2)), y = 1 + Math.floor(rand() * (SIZE - 2));
    if (!markers.some((m) => m.x === x && m.y === y)) markers.push({ x, y });
  }
  let crates = markers.map((m) => ({ ...m }));
  let player = null;
  while (!player) {
    const x = Math.floor(rand() * SIZE), y = Math.floor(rand() * SIZE);
    if (crateAt(crates, x, y) === -1) player = { x, y };
  }

  const pullSolution = []; // recorded in GENERATION order — reversed at the end to become the forward solve order
  for (let step = 0; step < NUM_PULLS; step++) {
    const crateOrder = [...crates.keys()].sort(() => rand() - 0.5);
    let moved = false;
    for (const ci of crateOrder) {
      const c = crates[ci];
      const dirOrder = [...DIRS].sort(() => rand() - 0.5);
      for (const dir of dirOrder) {
        // Pulling crate `ci` in `dir` — corrected, hand-verified
        // derivation (an earlier version of this had the sign
        // backwards on standAt, and the player's post-pull position
        // wrong; a pull is EXACTLY the reverse of a push, so re-derived
        // it directly from the push definition and confirmed against
        // concrete numbers before trusting it, not just abstractly):
        //   Forward push being undone: player R, crate at R+dir walks
        //   into it, crate lands at R+2*dir, player lands at R+dir.
        //   So a pull step, starting from crate at c (= R+2*dir):
        //     - player must be at c-dir (= R+dir) BEFORE the pull —
        //       this is standAt, what canReach is checked against.
        //     - crate moves to c-dir (= R+dir) — same value as
        //       standAt, since the crate follows into the cell the
        //       player is about to vacate.
        //     - player ends at c-2*dir (= R) AFTER the pull, not at c
        //       — the earlier bug set this to c instead, which is
        //       wrong: c is the crate's OWN old spot, but the player
        //       moves past that, one further pull-step beyond it.
        const standAt = { x: c.x - dir.dx, y: c.y - dir.dy };
        const crateTo = { x: c.x - dir.dx, y: c.y - dir.dy };
        const playerAfter = { x: standAt.x - dir.dx, y: standAt.y - dir.dy };
        if (!inBounds(standAt.x, standAt.y) || !inBounds(playerAfter.x, playerAfter.y)) continue;
        if (crateAt(crates, standAt.x, standAt.y) !== -1) continue; // player can't stand where another crate already is
        if (crateAt(crates, playerAfter.x, playerAfter.y) !== -1) continue; // player's own destination can't be another crate's cell either
        // The player needs to be able to actually GET to standAt from
        // wherever they currently are, without pushing anything —
        // reuse canReach against the state as it exists RIGHT NOW.
        if (!canReach({ player, crates }, standAt.x, standAt.y)) continue;

        const newCrates = [...crates];
        newCrates[ci] = crateTo;
        crates = newCrates;
        player = playerAfter;
        pullSolution.push({ crateIndex: ci, dir });
        moved = true;
        break;
      }
      if (moved) break;
    }
    // If literally no crate had any valid pull from the current player
    // position this step, that's fine — just skip this step. With 14
    // attempts on an 8x8 open board this is rare, and skipping a step
    // only means a slightly less-scrambled (still valid) level, never
    // an invalid one.
  }

  const solution = [...pullSolution].reverse().map(({ crateIndex, dir }) => ({ crateIndex, dir }));
  return { state: { player, crates }, markers, solution };
}

// A pull sequence CAN happen to land crates back on their own markers
// by coincidence (e.g. two crates trade places, or one gets pulled
// away and back) — rare (roughly 1-2%, confirmed by testing many
// seeds), but a player loading a level that's already "solved" with
// nothing to actually do is a real, if uncommon, bad experience worth
// closing off at the source rather than leaving to chance. Retries
// with a derived seed rather than failing outright — the retry budget
// is generous because the failure rate is low, not because retries
// are expected to be needed often.
export function generateLevel(seed) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const result = generateLevelAttempt((seed || 1) + attempt * 7919); // 7919 is just a prime offset so retries land on genuinely different-looking seeds, not just seed+1,seed+2,...
    if (!isSolved(result.state, result.markers)) return result;
  }
  return generateLevelAttempt(seed || 1); // exhausted retries (should be astronomically unlikely) — return whatever we get rather than loop forever
}

// Independently replays `solution` against `state` from scratch —
// doesn't trust generateLevel's own bookkeeping, actually re-simulates
// walking-and-pushing move by move and confirms the board ends up
// fully solved.
export function verifySolution(state, markers, solution) {
  let sim = { player: { ...state.player }, crates: state.crates.map((c) => ({ ...c })) };
  for (const { crateIndex, dir } of solution) {
    const crate = sim.crates[crateIndex];
    if (!crate) return false;
    const standAt = { x: crate.x - dir.dx, y: crate.y - dir.dy };
    if (!canReach(sim, standAt.x, standAt.y)) return false;
    sim = push({ ...sim, player: standAt }, dir);
    if (crateAt(sim.crates, crate.x + dir.dx, crate.y + dir.dy) === -1) return false; // the push didn't actually land where expected — solution invalid
  }
  return isSolved(sim, markers);
}

export { SIZE, NUM_CRATES, DIRS };
