import { storageSet, storageUpdate, subscribeGameState } from "../gameStorage";

// ─── Real-Time Mini Golf — Big Screen ───
// Everyone's ball rolls on the SAME shared course, shown on the TV
// (see components/bigscreen/MiniGolfTvDisplay.jsx) — a player's phone
// (components/games/MiniGolfTvPlayer.jsx) is purely an aiming device:
// drag back to set angle + power, release to putt. "Real-time" means
// there are no turns — everyone can putt whenever their own ball is at
// rest, so multiple balls can be mid-roll on the course at once. First
// three balls to reach the hole win (fewer than three total players
// just needs everyone to finish — see winnersNeededFor).
//
// The course itself — walls, bumpers, the rotating windmill, the
// sliding gate — is authored once as the exported COURSE constant and
// never touches shared state; only what actually changes over time
// (ball positions/velocities, and simTime, which every moving
// obstacle's current position is deterministically computed FROM)
// lives in storage. That's the same "static reference data imported
// directly, not duplicated into state" choice as
// lib/games/spyfallData.js's own SPYFALL_LOCATIONS.
//
// Physics runs as a fixed-timestep simulation advanced by "catch-up"
// on every tick — see lib/games/tartarusTreadmillData.js's own header
// comment for why (elapsed wall-clock time is converted into a whole
// number of STEP_MS-sized steps, applied one at a time, and the
// state's own clock — here, `lastTick` and `simTime` — advances by
// exactly that many steps' worth of time, never snapping to `now`, to
// avoid drift). Collision resolution is deliberately simple —
// discrete (not swept) circle/segment checks, at most one collision
// resolved per ball per step — which can occasionally miss a double
// bounce in a tight corner. That's an accepted arcade-physics
// trade-off, not a bug: STEP_MS is kept small and speeds capped so a
// ball can't realistically tunnel through anything course-sized in a
// single step.
const STEP_MS = 40;
const STEP_SEC = STEP_MS / 1000;
const MAX_STEPS_PER_TICK = 50; // ~2s of catch-up per tick — generous but bounded
const FRICTION_DECEL = 260; // units/s^2 shaved off a ball's speed every second it's rolling
const MIN_SPEED = 8; // below this a ball counts as stopped, and puttable again
const MAX_PUTT_SPEED = 560;
const BALL_RADIUS = 10;
const WALL_RESTITUTION = 0.7;
const BLADE_IMPULSE_FACTOR = 0.6; // fraction of the windmill blade's own tangential speed transferred on a hit
const GATE_IMPULSE_FACTOR = 0.3; // fraction of the sliding gate's own vertical speed transferred on a hit

export const MINIGOLF_STEP_MS = STEP_MS;
export const MINIGOLF_MAX_PUTT_SPEED = MAX_PUTT_SPEED;
export const MINIGOLF_BALL_RADIUS = BALL_RADIUS;

// Course space is a fixed 1000x600 unit canvas — both the physics and
// every renderer (TV, phone preview) work in these same units, so
// nothing needs rescaling between them.
export const COURSE = {
  bounds: { width: 1000, height: 600 },
  start: { x: 70, y: 300 },
  finish: { x: 930, y: 300, r: 24 },
  walls: [
    // outer boundary
    { x1: 20, y1: 20, x2: 980, y2: 20 },
    { x1: 20, y1: 580, x2: 980, y2: 580 },
    { x1: 20, y1: 20, x2: 20, y2: 580 },
    { x1: 980, y1: 20, x2: 980, y2: 580 },
    // first chicane — hangs down from the top wall, gap below it
    { x1: 220, y1: 20, x2: 220, y2: 380 },
    // second chicane — rises up from the bottom wall, gap above it
    { x1: 360, y1: 580, x2: 360, y2: 220 },
    // a static narrow gate — a fixed 80-unit slot dead center to thread
    { x1: 500, y1: 20, x2: 500, y2: 260 },
    { x1: 500, y1: 340, x2: 500, y2: 580 },
    // fixed housing on either side of the sliding gate's own travel slot
    { x1: 880, y1: 20, x2: 880, y2: 230 },
    { x1: 880, y1: 370, x2: 880, y2: 580 },
  ],
  bumpers: [
    { x: 620, y: 160, r: 28, restitution: 0.9, boost: 1.3 },
    { x: 660, y: 300, r: 32, restitution: 0.9, boost: 1.3 },
    { x: 620, y: 440, r: 28, restitution: 0.9, boost: 1.3 },
  ],
  // A rotating two-armed blade through a pivot — both arms are solid,
  // so it sweeps the whole diameter of its circle every half-turn.
  windmill: { pivot: { x: 780, y: 300 }, armLength: 90, angularSpeed: 1.6, startAngle: 0 },
  // A gate that slides up and down within its own slot (bounded by the
  // two fixed housing walls above), alternately opening the top or the
  // bottom of the slot as it goes — never both at once, since its
  // length is less than the slot's height.
  gate: { x: 880, slotTop: 230, slotBottom: 370, length: 70, periodSec: 4 },
};

export function winnersNeededFor(participantCount) {
  return Math.max(1, Math.min(3, participantCount));
}

export const miniGolfKey = (round) => `pb:minigolf:${round}`;

export function subscribeMiniGolf(gameId, round, onChange) {
  return subscribeGameState(gameId, miniGolfKey(round), onChange);
}

function closestPointOnSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { x: x1, y: y1 };
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return { x: x1 + t * dx, y: y1 + t * dy };
}

// The windmill's current arm positions and the sliding gate's current
// segment — both computed purely from simTime, so every client (TV,
// every phone) renders the identical moving geometry from shared
// state alone, with no separate wall-clock math to fall out of sync.
export function movingObstacleSegments(simTime) {
  const { pivot, armLength, angularSpeed, startAngle } = COURSE.windmill;
  const angle = startAngle + angularSpeed * simTime;
  const arm1 = { x: pivot.x + armLength * Math.cos(angle), y: pivot.y + armLength * Math.sin(angle) };
  const arm2 = { x: pivot.x + armLength * Math.cos(angle + Math.PI), y: pivot.y + armLength * Math.sin(angle + Math.PI) };

  const gate = COURSE.gate;
  const amp = (gate.slotBottom - gate.slotTop - gate.length) / 2;
  const omega = (2 * Math.PI) / gate.periodSec;
  const topY = gate.slotTop + amp * (1 + Math.sin(omega * simTime));
  const dTopYdt = amp * omega * Math.cos(omega * simTime);

  return [
    { kind: "blade", x1: pivot.x, y1: pivot.y, x2: arm1.x, y2: arm1.y, pivot, angularSpeed },
    { kind: "blade", x1: pivot.x, y1: pivot.y, x2: arm2.x, y2: arm2.y, pivot, angularSpeed },
    { kind: "gate", x1: gate.x, y1: topY, x2: gate.x, y2: topY + gate.length, dTopYdt },
  ];
}

// Pure, testable single-ball physics step. Returns a new ball object;
// never mutates the one it's given.
export function resolveBallStep(ball, simTime) {
  if (!ball || ball.finished) return ball;
  let { vx, vy } = ball;
  const { x, y } = ball;
  const speed = Math.hypot(vx, vy);

  if (speed < MIN_SPEED) {
    return { ...ball, vx: 0, vy: 0, atRest: true };
  }

  const newSpeed = Math.max(0, speed - FRICTION_DECEL * STEP_SEC);
  const scale = newSpeed > 0 ? newSpeed / speed : 0;
  vx *= scale;
  vy *= scale;

  if (newSpeed < MIN_SPEED) {
    return { ...ball, vx: 0, vy: 0, atRest: true };
  }

  let nx = x + vx * STEP_SEC;
  let ny = y + vy * STEP_SEC;

  // Bumpers first — checked and resolved before walls/moving
  // obstacles, and only one collision is resolved per ball per step
  // (see this file's own header comment on why that's an accepted
  // simplification).
  for (const b of COURSE.bumpers) {
    const dx = nx - b.x;
    const dy = ny - b.y;
    const dist = Math.hypot(dx, dy);
    const minDist = BALL_RADIUS + b.r;
    if (dist < minDist) {
      const nrm = dist > 0 ? { x: dx / dist, y: dy / dist } : { x: 1, y: 0 };
      const vDotN = vx * nrm.x + vy * nrm.y;
      let rvx = vx - 2 * vDotN * nrm.x;
      let rvy = vy - 2 * vDotN * nrm.y;
      const factor = (b.restitution ?? WALL_RESTITUTION) * (b.boost || 1);
      rvx *= factor;
      rvy *= factor;
      return {
        ...ball,
        x: b.x + nrm.x * (minDist + 0.5),
        y: b.y + nrm.y * (minDist + 0.5),
        vx: rvx,
        vy: rvy,
        atRest: false,
      };
    }
  }

  const segments = [...COURSE.walls.map((w) => ({ ...w, kind: "wall" })), ...movingObstacleSegments(simTime)];
  for (const seg of segments) {
    const cp = closestPointOnSegment(nx, ny, seg.x1, seg.y1, seg.x2, seg.y2);
    const dx = nx - cp.x;
    const dy = ny - cp.y;
    const dist = Math.hypot(dx, dy);
    if (dist < BALL_RADIUS) {
      const nrm = dist > 0 ? { x: dx / dist, y: dy / dist } : { x: 0, y: -1 };
      const vDotN = vx * nrm.x + vy * nrm.y;
      let rvx = (vx - 2 * vDotN * nrm.x) * WALL_RESTITUTION;
      let rvy = (vy - 2 * vDotN * nrm.y) * WALL_RESTITUTION;

      if (seg.kind === "blade") {
        // A rotating segment doesn't just bounce the ball — being hit
        // BY the moving blade also transfers a fraction of its own
        // tangential speed at the contact point, same idea as getting
        // swatted rather than just walking into a static wall.
        const rvec = { x: cp.x - seg.pivot.x, y: cp.y - seg.pivot.y };
        const tangential = { x: -rvec.y * seg.angularSpeed, y: rvec.x * seg.angularSpeed };
        rvx += tangential.x * BLADE_IMPULSE_FACTOR;
        rvy += tangential.y * BLADE_IMPULSE_FACTOR;
      } else if (seg.kind === "gate") {
        rvy += seg.dTopYdt * GATE_IMPULSE_FACTOR;
      }

      return {
        ...ball,
        x: cp.x + nrm.x * (BALL_RADIUS + 0.5),
        y: cp.y + nrm.y * (BALL_RADIUS + 0.5),
        vx: rvx,
        vy: rvy,
        atRest: false,
      };
    }
  }

  return { ...ball, x: nx, y: ny, vx, vy, atRest: false };
}

function physicsStep(fresh) {
  const simTime = fresh.simTime;
  const balls = { ...fresh.balls };
  let finishOrder = fresh.finishOrder;

  for (const pid of fresh.participantIds) {
    const ball = balls[pid];
    if (!ball || ball.finished) continue;
    const updated = resolveBallStep(ball, simTime);
    const dx = updated.x - COURSE.finish.x;
    const dy = updated.y - COURSE.finish.y;
    if (Math.hypot(dx, dy) < COURSE.finish.r) {
      balls[pid] = { ...updated, finished: true, vx: 0, vy: 0, atRest: true, finishRank: finishOrder.length + 1 };
      finishOrder = [...finishOrder, pid];
    } else {
      balls[pid] = updated;
    }
  }

  let ended = fresh.ended;
  let winnerIds = fresh.winnerIds;
  if (!ended && finishOrder.length >= fresh.winnersNeeded) {
    ended = true;
    winnerIds = finishOrder.slice(0, fresh.winnersNeeded);
  }

  return { ...fresh, balls, finishOrder, simTime: simTime + STEP_SEC, ended, winnerIds };
}

export async function initMiniGolf(gameId, round, participants, now, db) {
  const set = db?.set || storageSet;
  const balls = {};
  participants.forEach((p, i) => {
    const offset = (i - (participants.length - 1) / 2) * 16;
    balls[p.id] = {
      x: COURSE.start.x,
      y: Math.max(40, Math.min(COURSE.bounds.height - 40, COURSE.start.y + offset)),
      vx: 0,
      vy: 0,
      atRest: true,
      finished: false,
      finishRank: null,
    };
  });
  const state = {
    participantIds: participants.map((p) => p.id),
    balls,
    finishOrder: [],
    winnersNeeded: winnersNeededFor(participants.length),
    ended: false,
    winnerIds: null,
    simTime: 0,
    lastTick: now || Date.now(),
  };
  await set(gameId, miniGolfKey(round), state);
}

export function applySubmitPutt(fresh, playerId, angle, power) {
  if (!fresh || fresh.ended) return fresh;
  const ball = fresh.balls[playerId];
  if (!ball || ball.finished) return fresh;
  if (!ball.atRest) return fresh; // can't putt mid-roll
  if (typeof angle !== "number" || typeof power !== "number" || Number.isNaN(angle) || Number.isNaN(power)) return fresh;
  const clampedPower = Math.max(0, Math.min(1, power));
  const speed = clampedPower * MAX_PUTT_SPEED;
  const vx = Math.cos(angle) * speed;
  const vy = Math.sin(angle) * speed;
  return {
    ...fresh,
    balls: { ...fresh.balls, [playerId]: { ...ball, vx, vy, atRest: speed < MIN_SPEED } },
  };
}

// Fixed-timestep catch-up — see this file's own header comment.
export function miniGolfTransition(fresh, now) {
  if (!fresh || fresh.ended) return fresh;
  const elapsed = now - fresh.lastTick;
  if (elapsed <= 0) return fresh;
  const stepsDue = Math.floor(elapsed / STEP_MS);
  if (stepsDue <= 0) return fresh;
  const stepsToApply = Math.min(stepsDue, MAX_STEPS_PER_TICK);

  let state = fresh;
  let stepsApplied = 0;
  for (let i = 0; i < stepsToApply; i++) {
    state = physicsStep(state);
    stepsApplied++;
    if (state.ended) break;
  }
  return { ...state, lastTick: fresh.lastTick + stepsApplied * STEP_MS };
}

export async function submitPutt(gameId, round, playerId, angle, power) {
  return storageUpdate(gameId, miniGolfKey(round), (fresh) => applySubmitPutt(fresh, playerId, angle, power));
}

export async function tickMiniGolf(gameId, round, db) {
  const update = db?.update || storageUpdate;
  const now = Date.now();
  return update(gameId, miniGolfKey(round), (fresh) => miniGolfTransition(fresh, now));
}

// Finishers rank by arrival order, well above anything a non-finisher
// can reach; a non-finisher's running value rewards getting physically
// closer to the hole — same "continuous progress" idea as
// lib/games/acrophobiaData.js's own placementValue, just distance-based
// instead of vote-based.
export function placementValue(state, playerId) {
  const ball = state?.balls?.[playerId];
  if (!ball) return 0;
  if (ball.finished) return 100000 - (ball.finishRank - 1) * 100;
  const dx = ball.x - COURSE.finish.x;
  const dy = ball.y - COURSE.finish.y;
  return Math.max(0, Math.round(1000 - Math.hypot(dx, dy)));
}
