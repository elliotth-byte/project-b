import { storageSet, storageUpdate, subscribeGameState } from "../gameStorage";

// ─── Tartarus Treadmill — Big Screen ───
// A single lane, one wall at slot 0 (safe) and a drop-off at the far
// end — cross past the last slot and you've fallen into Tartarus,
// eliminated instantly. The belt itself drifts everyone's position
// every STEP_MS of real time, in whichever direction it's currently
// running; players fight it (or ride it) by tapping Push Left/Push
// Right on their own phone, and tap Jump to survive a falling obstacle
// that's about to land on their exact slot. Direction flips
// unpredictably and the belt speeds up over time, same escalating-
// pressure shape as lib/games/simonTvData.js's own growing sequence.
//
// Two genuinely different kinds of hazard, both real risks at once:
//   1. Obstacles — a slot gets marked, a warning shows, and anyone
//      still standing there at impact (without a well-timed jump) is
//      out.
//   2. Each other — "bouncy heads": try to move into a slot someone
//      else already occupies and neither of you gets to just stand
//      there — you're both shoved one slot further in the belt's own
//      current direction instead, exactly the kind of push that can
//      shove one of you into the drop-off if you're not careful about
//      who you crowd.
// Belt drift and obstacle impacts are resolved on a fixed real-time
// step (STEP_MS) via advanceTreadmillTransition below, using the same
// fixed-timestep catch-up approach as every other timed mechanic here
// (compute how many whole steps are due from elapsed wall-clock time,
// apply them one at a time, then advance lastStepAt by exactly that
// many steps rather than snapping to `now` — keeping the simulation's
// own clock stable rather than drifting later and later relative to
// real time as polls land at slightly different moments). Player moves
// and jumps, by contrast, are applied immediately/optimistically the
// instant they're tapped (see submitMove/submitJump) — there's no
// reason to make a "sprint" feel laggy by tying it to the belt's own
// step cadence.

const LANE_LENGTH = 20; // valid slots are 0..LANE_LENGTH-1; reaching >= LANE_LENGTH is the fall
const STEP_MS = 700;
const INITIAL_BELT_SPEED = 1;
const MAX_BELT_SPEED = 3;
const SPEED_RAMP_EVERY_STEPS = 15;
const MIN_STEPS_BETWEEN_SWITCH = 8;
const MAX_STEPS_BETWEEN_SWITCH = 16;
const OBSTACLE_SPAWN_CHANCE = 0.4;
const OBSTACLE_WARNING_STEPS = 2;
const JUMP_WINDOW_MS = 900; // how close (either side) a jump's timestamp must be to an obstacle's real impact moment to count

function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomSwitchGap(rng) {
  return MIN_STEPS_BETWEEN_SWITCH + Math.floor(rng() * (MAX_STEPS_BETWEEN_SWITCH - MIN_STEPS_BETWEEN_SWITCH + 1));
}

export const tartarusTreadmillKey = (round) => `pb:tartarustreadmill:${round}`;

export function subscribeTartarusTreadmill(gameId, round, onChange) {
  return subscribeGameState(gameId, tartarusTreadmillKey(round), onChange);
}

export async function initTartarusTreadmill(gameId, round, participants, seed, db) {
  const set = db?.set || storageSet;
  const rng = mulberry32(seed || Date.now());
  const positions = {};
  const alive = {};
  const usableSlots = LANE_LENGTH - 4; // leave a couple of slots of buffer at each end for spread-out starts
  participants.forEach((p, i) => {
    positions[p.id] = 2 + (i % Math.max(1, usableSlots));
    alive[p.id] = true;
  });
  await set(gameId, tartarusTreadmillKey(round), {
    participantIds: participants.map((p) => p.id),
    positions,
    alive,
    eliminatedInRound: {},
    winnerId: null,
    ended: false,
    beltDirection: rng() < 0.5 ? 1 : -1,
    beltSpeed: INITIAL_BELT_SPEED,
    stepCount: 0,
    stepsUntilSwitch: randomSwitchGap(rng),
    obstacles: [], // { id, slot, spawnStep, impactStep }
    nextObstacleId: 1,
    lastJumpAt: {}, // playerId -> timestamp of their most recent jump
    lastStepAt: Date.now(),
    rngState: Math.floor(rng() * 1e9),
  });
}

// Shoves a single player's slot by `delta`, clamping at the safe wall
// (0) and marking them eliminated the instant they'd cross past the
// last valid slot — shared by both belt drift and the bounce-off-
// another-player collision path below, so "how falling actually works"
// only has one implementation.
function shovePlayer(positions, alive, eliminatedInRound, stepCount, playerId, delta) {
  if (!alive[playerId]) return;
  const next = positions[playerId] + delta;
  if (next >= LANE_LENGTH) {
    alive[playerId] = false;
    eliminatedInRound[playerId] = stepCount;
    // Position itself is left wherever it lands past the edge — purely
    // cosmetic once eliminated, nothing reads a dead player's position
    // for gameplay purposes again.
    positions[playerId] = next;
  } else {
    positions[playerId] = Math.max(0, next);
  }
}

function aliveIds(alive) {
  return Object.keys(alive).filter((id) => alive[id]);
}

// Returns undefined while the battle's still ongoing (2+ survivors —
// don't touch winnerId/ended at all), or { winnerId, ended: true } once
// it's over. winnerId itself can legitimately be null (a genuine
// simultaneous double-KO, the last two-or-more standing eliminated by
// the exact same step — same "tie" honesty as every other last-one-
// standing game here) which is exactly why `ended` has to be its own
// field: winnerId alone can't distinguish "still in progress" from "a
// concluded tie" — both would otherwise read as null.
function checkForWinner(state) {
  const survivors = aliveIds(state.alive);
  if (survivors.length <= 1) {
    return { winnerId: survivors.length === 1 ? survivors[0] : null, ended: true };
  }
  return undefined;
}

// One virtual step: belt drift for everyone alive, then obstacle
// impacts scheduled for this exact step, then (maybe) a fresh obstacle
// spawn, then direction-switch/speed-ramp bookkeeping. Order matters —
// drift happens before impact resolution so a player who's about to be
// pushed onto a dangerous slot this same step doesn't get an unearned
// free pass, and impacts resolve before a new obstacle spawns so a
// slot can't have two unrelated obstacles claim it on the same step.
function applyOneStep(state, stepTimestamp, rng) {
  const positions = { ...state.positions };
  const alive = { ...state.alive };
  const eliminatedInRound = { ...state.eliminatedInRound };
  const nextStepCount = state.stepCount + 1;

  aliveIds(alive).forEach((id) => {
    shovePlayer(positions, alive, eliminatedInRound, nextStepCount, id, state.beltDirection * state.beltSpeed);
  });

  const dueObstacles = state.obstacles.filter((o) => o.impactStep === nextStepCount);
  const remainingObstacles = state.obstacles.filter((o) => o.impactStep !== nextStepCount);
  dueObstacles.forEach((o) => {
    aliveIds(alive).forEach((id) => {
      if (positions[id] !== o.slot) return;
      const lastJump = state.lastJumpAt[id];
      const jumpedInTime = lastJump != null && Math.abs(lastJump - stepTimestamp) <= JUMP_WINDOW_MS;
      if (!jumpedInTime) {
        alive[id] = false;
        eliminatedInRound[id] = nextStepCount;
      }
    });
  });

  let obstacles = remainingObstacles;
  let nextObstacleId = state.nextObstacleId;
  if (rng() < OBSTACLE_SPAWN_CHANCE) {
    const targetSlot = 1 + Math.floor(rng() * (LANE_LENGTH - 2)); // never the safe wall itself or dead last slot
    obstacles = [...obstacles, { id: nextObstacleId, slot: targetSlot, spawnStep: nextStepCount, impactStep: nextStepCount + OBSTACLE_WARNING_STEPS }];
    nextObstacleId += 1;
  }

  let stepsUntilSwitch = state.stepsUntilSwitch - 1;
  let beltDirection = state.beltDirection;
  if (stepsUntilSwitch <= 0) {
    beltDirection = -beltDirection;
    stepsUntilSwitch = randomSwitchGap(rng);
  }

  let beltSpeed = state.beltSpeed;
  if (nextStepCount % SPEED_RAMP_EVERY_STEPS === 0) {
    beltSpeed = Math.min(MAX_BELT_SPEED, beltSpeed + 1);
  }

  const nextState = {
    ...state,
    positions, alive, eliminatedInRound,
    stepCount: nextStepCount,
    obstacles, nextObstacleId,
    beltDirection, beltSpeed, stepsUntilSwitch,
  };
  const result = checkForWinner(nextState);
  if (result !== undefined) { nextState.winnerId = result.winnerId; nextState.ended = true; }
  return nextState;
}

// Pure, testable transition — advances as many whole STEP_MS-sized
// steps as elapsed wall-clock time justifies, then stops (freezing the
// board) once a winner's been decided, exactly like every other
// last-one-standing shared battle here.
export function tartarusTreadmillTransition(fresh, now) {
  if (!fresh || fresh.ended) return fresh;

  const rng = mulberry32(fresh.rngState);
  let state = fresh;
  let elapsed = now - state.lastStepAt;
  let stepsApplied = 0;
  while (elapsed >= STEP_MS && !state.ended) {
    const stepTimestamp = state.lastStepAt + STEP_MS;
    state = applyOneStep(state, stepTimestamp, rng);
    state.lastStepAt = stepTimestamp;
    elapsed -= STEP_MS;
    stepsApplied += 1;
    if (stepsApplied > 500) break; // safety valve against a pathological elapsed gap (e.g. a battle resumed after a very long pause) ever looping unboundedly
  }
  if (stepsApplied === 0) return fresh;
  return { ...state, rngState: Math.floor(rng() * 1e9) };
}

export async function tickTartarusTreadmill(gameId, round, db) {
  const update = db?.update || storageUpdate;
  const now = Date.now();
  return update(gameId, tartarusTreadmillKey(round), (fresh) => tartarusTreadmillTransition(fresh, now));
}

// Pure move logic, pulled out for the same reason
// tartarusTreadmillTransition is pure and separate from
// tickTartarusTreadmill — a standalone test can exercise the bounce
// rule directly with zero storage mocking.
export function applyMove(fresh, playerId, direction) {
  if (!fresh || fresh.ended || !fresh.alive[playerId]) return fresh;
  if (direction !== 1 && direction !== -1) return fresh;

  const positions = { ...fresh.positions };
  const alive = { ...fresh.alive };
  const eliminatedInRound = { ...fresh.eliminatedInRound };
  const from = positions[playerId];
  const to = Math.max(0, from + direction);
  const occupantId = Object.keys(positions).find((id) => id !== playerId && alive[id] && positions[id] === to);

  if (occupantId && to !== from) {
    // Bouncy heads — neither of you gets the contested slot. Both of
    // you get shoved one slot further in whichever direction the belt
    // is currently running, from your OWN current slot (not into each
    // other), which is what makes crowding near the drop-off end
    // genuinely dangerous rather than just "wasted".
    shovePlayer(positions, alive, eliminatedInRound, fresh.stepCount, playerId, fresh.beltDirection);
    shovePlayer(positions, alive, eliminatedInRound, fresh.stepCount, occupantId, fresh.beltDirection);
  } else {
    positions[playerId] = to;
  }

  const nextState = { ...fresh, positions, alive, eliminatedInRound };
  const result = checkForWinner(nextState);
  if (result !== undefined) { nextState.winnerId = result.winnerId; nextState.ended = true; }
  return nextState;
}

export function applyJump(fresh, playerId, now) {
  if (!fresh || fresh.ended || !fresh.alive[playerId]) return fresh;
  return { ...fresh, lastJumpAt: { ...fresh.lastJumpAt, [playerId]: now } };
}

export async function submitMove(gameId, round, playerId, direction) {
  return storageUpdate(gameId, tartarusTreadmillKey(round), (fresh) => applyMove(fresh, playerId, direction));
}

export async function submitJump(gameId, round, playerId) {
  return storageUpdate(gameId, tartarusTreadmillKey(round), (fresh) => applyJump(fresh, playerId, Date.now()));
}

// Same shape as every other last-one-standing Big Screen game's own
// placementValue (see e.g. lib/games/simonTvData.js) — a winner tops
// everyone, an eliminated player ranks by how far into the battle they
// survived (their own elimination step), and anyone still alive when
// the challenge's own timer runs out ranks by the current step, which
// is always higher than any past elimination's step.
export function placementValue(state, playerId) {
  if (state.winnerId === playerId) return 100000;
  const elimStep = state.eliminatedInRound?.[playerId];
  if (elimStep != null) return 1000 + elimStep;
  if (state.alive?.[playerId]) return 1000 + state.stepCount;
  return 0;
}

export const TARTARUS_LANE_LENGTH = LANE_LENGTH;
export const TARTARUS_STEP_MS = STEP_MS;
export const TARTARUS_OBSTACLE_WARNING_STEPS = OBSTACLE_WARNING_STEPS;
