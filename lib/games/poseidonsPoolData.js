import { storageSet, storageUpdate, subscribeGameState } from "../gameStorage";

// ─── Poseidon's Pool (and Poseidon's Pool — Big Screen) ───
// Every alive participant controls exactly one ball, which is
// simultaneously their identity on the table AND their own cue ball —
// there is no separate neutral cue ball the way a real pool game has
// one. Aim + power, take the shot, and the struck ball travels,
// bounces off the cushions, and can collide with (and knock around)
// other players' balls in a chain reaction. Any ball that ends up
// resting inside a pocket at the end of a shot is SUNK, and that ball's
// owner is eliminated on the spot — including the shooter's own ball,
// if their shot scratches. Last remaining ball on the table wins.
//
// ─── Why this is a precomputed-outcome / shot-queue design, not
// frame-by-frame synced physics ───
// This app's shared state is Supabase-row-based, updated via CAS
// storageUpdate calls and read via realtime + a ~45s resync poll (see
// lib/gameStorage.js) — there is no channel fast enough to stream
// continuous ball positions at 60fps to every client in lockstep.
// Trying to do that here would either desync visibly between clients or
// fight the architecture at every turn. Instead, exactly one shot at a
// time is fully simulated, synchronously, in ONE server-side function
// call (simulateShot below) the instant it's popped off the queue —
// every cushion bounce, every ball-ball collision, all the way to every
// ball coming to rest or falling into a pocket — and the COMPLETE
// outcome (final resting positions, which ball(s) sank, and enough
// keyframes per moving ball to animate a smooth-looking path) is
// written to shared state in that one atomic write. From that instant
// on, the actual game state (who's eliminated, where every ball now
// rests) is already finalized — every client just independently
// replays the same precomputed trajectories over the shot's own real
// duration, purely for visual smoothness. There is no possibility of
// two clients disagreeing about the outcome of a shot, only about how
// satisfying the replay looks.
//
// ─── Concurrent shots: always queue, then drain one at a time via tick
// ───
// Multiple players' cooldowns can expire around the same real moment,
// but two shots' physics can never be resolved as if they overlapped —
// that would need genuine concurrent physics and isn't worth the
// complexity for a shot-resolution game like this. Of the two designs
// the spec allows, this uses the simpler, more robust one: submitShot
// NEVER resolves a shot itself — it only ever validates the shooter
// (not on cooldown, not eliminated, a legal angle/power) and APPENDS to
// `queue` inside its own CAS storageUpdate. Resolution happens only in
// tickPoseidonsPool, which pops and fully resolves exactly one queued
// shot per call, and only when the table isn't still mid-replay of the
// PREVIOUS shot (tracked via `currentShot.resolvingUntil` — a real
// timestamp the previous shot's own resolution set, sized to that
// shot's own trajectory length, so the next shot never overwrites state
// while every client is still mid-animating the last one).
//
// This is race-free under this codebase's actual CAS primitive
// (lib/dbAdapter.js's `update`: read value+version, run the updater
// against a private draft, write back conditioned on the version being
// unchanged, retry from a FRESH read on conflict, up to 6 attempts) for
// two independent reasons:
//   1. submitShot's own write is a pure, order-independent APPEND to an
//      array. If two players submit at nearly the same instant, one
//      write's CAS wins, the other retries against the now-fresh state
//      (which already has the first player's queue entry) and appends
//      after it — no data is ever lost, and the two shots simply end up
//      in SOME well-defined queue order, never simulated together.
//   2. tickPoseidonsPool's pop-and-resolve is itself ONE storageUpdate
//      call — the entire physics simulation for the popped shot runs
//      inside the updater callback, against that call's own fresh draft,
//      and only the winning CAS write actually commits it. If the TV
//      and several phones all call tick at once, every one of them
//      calls storageUpdate, but only ONE of those calls can win the
//      race for any given queue-draining step — the losers retry from a
//      fresh read, see the queue (or `currentShot.resolvingUntil`)
//      already advanced by the winner, and simply no-op. There is no
//      window where two callers could both believe they're the one
//      popping the front of the queue and both write a resolved shot —
//      the version check makes that structurally impossible, not just
//      unlikely.
//
// ─── Physics ───
// A straightforward, deliberately non-"realistic" 2D simulation, not a
// physics engine: balls are circles with position + velocity on a
// rectangular table; cushions reflect the relevant velocity component
// with a small energy loss; a struck ball's momentum transfers to
// whatever it hits via the standard equal-mass 2D elastic collision
// formula (exchange the velocity component ALONG the collision normal,
// leave the tangential component alone), scaled by a restitution factor
// just under 1 for a touch of energy loss per hit; constant-magnitude
// friction decelerates every moving ball, every internal step, until it
// stops; a ball whose center comes within POCKET_R of a pocket is sunk.
// The internal step is a fine dt (1/120 simulated second) so two balls
// can't tunnel through each other even near the table's own top speed —
// this loop runs synchronously in one call and does NOT need to be
// paced in real time, it's just computing the eventual outcome. A
// keyframe is recorded for every still-moving ball every few internal
// steps (plus an exact keyframe the instant it sinks, and one final
// keyframe at rest) — enough points for the client to linearly
// interpolate a smooth-looking replay, not a sparse teleport.
//
// ─── Elimination / win condition ───
// ANY ball resting in a pocket when a shot's simulation ends is sunk,
// and that ball's owner is eliminated — this deliberately includes the
// shooter's own ball (a self-scratch), exactly as a real accidental
// scratch would read. Last remaining ball wins. If the last TWO
// balls' owners are somehow eliminated on the exact same resolved shot
// (a shot that sinks both the shooter's own ball and the one other
// remaining ball), that's treated as a tie for the win between
// whichever two were still active immediately before that shot — see
// tickPoseidonsPool's own `stillAlive.length === 0` branch — falling
// back to this app's generic finishedAt-order tiebreak (lib/challenges/
// scores.js) for final ranking purposes, same as every other
// shared-win case in this app (River Styx, The Wine-Dark Sea).
//
// db: optional override on init/tick — see lib/games/
// plinkoBracketData.js's initPlinkoBracket for why (server-side
// auto-start/housekeeping passes its own db wrapper; a client call uses
// the default storage functions).

export const poolKey = (round) => `pb:poseidonspool:${round}`;
const key = poolKey;

export function subscribePoseidonsPool(gameId, round, onChange) {
  return subscribeGameState(gameId, key(round), onChange);
}

const MIN_PARTICIPANTS = 2;

// ─── Table geometry (shared by both phone-with-table and TV rendering
// — a fixed virtual coordinate space, scaled to fit whatever the actual
// on-screen table element is by each component). Standard 6-pocket
// layout: 4 corners + 2 side-middles on the long rails. ───
export const TABLE_W = 1000;
export const TABLE_H = 520;
export const BALL_R = 16;
export const POCKET_R = 30;
export const POCKETS = [
  { x: 0, y: 0 },
  { x: TABLE_W, y: 0 },
  { x: 0, y: TABLE_H },
  { x: TABLE_W, y: TABLE_H },
  { x: TABLE_W / 2, y: 0 },
  { x: TABLE_W / 2, y: TABLE_H },
];

// ─── Simulation constants ───
const DT = 1 / 120; // internal simulation step — fine enough that no two balls can tunnel through each other at this table's own top speed
const MAX_STEPS = 620; // ~5.2 simulated seconds — a hard safety ceiling against a pathological chain of bounces never settling
const SAMPLE_EVERY = 4; // a keyframe every 4 internal steps (~1/30s) — smooth enough to interpolate, small enough to keep the written state light
const STOP_EPS = 6; // units/sec below which a ball is considered stopped
const CUSHION_REST = 0.86; // energy retained on a cushion bounce
const BALL_REST = 0.97; // energy retained (of the exchanged normal component) on a ball-ball collision
const FRICTION_DECEL = 340; // units/sec^2 — constant-magnitude deceleration applied to every moving ball every step
const MIN_POWER_SPEED = 180; // initial speed at power = 0 (a shot always does SOMETHING)
const MAX_POWER_SPEED = 920; // initial speed at power = 1
const MIN_REPLAY_MS = 900; // even a very short shot gets held as "current" long enough to read as a shot, not a teleport

function clamp01(n) { return Math.max(0, Math.min(1, n)); }

function seededRandom(seed) {
  let s = seed || 1;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

// Evenly spaced around the hue wheel via the golden-ratio-ish offset —
// same approach as lib/games/crownsData.js's own colorForIndex.
function colorForIndex(i) {
  return `hsl(${Math.round((i * 137.508) % 360)}, 72%, 58%)`;
}

// ─── Cooldown scaling — "Cooldown adjusts to challenge length" ───
// The per-player cooldown is deliberately proportional to the Battle's
// own configured length (same "keep the RELATIVE pacing roughly
// constant across wildly different battle lengths" reasoning as
// lib/games/laurelThiefData.js's own cooldownMsFor), clamped to a
// sensible floor and ceiling:
//   - a floor of 4s keeps even a very short Battle from turning into an
//     unreadable tap-spam contest (and matches the shot-queue's own
//     replay window, which is itself typically 1-3s per shot — a
//     cooldown much below that wouldn't even let a player's OWN next
//     shot clear the queue any faster).
//   - a ceiling of 20s keeps a long Battle from leaving players idle
//     for most of it waiting out their own cooldown — the real
//     bottleneck on a long Battle with several players is the shared
//     table itself (only one shot resolves, and gets its own replay
//     window, at a time table-wide), not any individual's cooldown, so
//     there's little benefit to letting per-player cooldown climb
//     indefinitely with duration.
//   - durationSec / 20 as the raw baseline is aimed at roughly 20 shot
//     opportunities per surviving player across the whole Battle before
//     either clamp kicks in (e.g. a 6-minute/360s Battle: 18s cooldown,
//     ~20 shots; an 8-minute/480s Battle already at the ceiling: 20s
//     cooldown, ~24 shots; a 2-minute/120s Big Screen-paced Battle: 6s
//     cooldown, ~20 shots) — plenty of shots to actually play out an
//     elimination format without the table clearing itself out in the
//     first thirty seconds.
const MIN_COOLDOWN_SEC = 4;
const MAX_COOLDOWN_SEC = 20;
const COOLDOWN_TARGET_SHOTS = 20;
const DEFAULT_FALLBACK_DURATION_SEC = 480;

export function poolCooldownMs(challengeDurationSec) {
  const sec = challengeDurationSec || DEFAULT_FALLBACK_DURATION_SEC;
  const perShotSec = Math.max(MIN_COOLDOWN_SEC, Math.min(MAX_COOLDOWN_SEC, sec / COOLDOWN_TARGET_SHOTS));
  return Math.round(perShotSec * 1000);
}

function startingPositions(participantIds, seed) {
  const rand = seededRandom(seed || 1);
  const n = participantIds.length;
  const center = { x: TABLE_W / 2, y: TABLE_H / 2 };
  const minSep = BALL_R * 3.4; // comfortably more than 2*BALL_R so no two balls start overlapping or touching
  const desiredR = Math.min(TABLE_W, TABLE_H) * 0.34;
  const neededR = (minSep * n) / (2 * Math.PI);
  const maxAllowedR = Math.min(TABLE_W, TABLE_H) / 2 - BALL_R - 50; // stay well clear of the cushions/pockets
  const radius = Math.max(desiredR, Math.min(neededR, maxAllowedR));
  const angleOffset = rand() * Math.PI * 2;
  const positions = {};
  participantIds.forEach((id, i) => {
    const angle = angleOffset + (i * (Math.PI * 2)) / n;
    positions[id] = { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
  });
  return positions;
}

// participants: [{ id, name }]. Called once from ChallengeHost.jsx's
// startChallenge / lib/roundEngine.js's autoStartRandomChallenge, same
// as every other shared-state game here. challengeDurationSec (from
// settings.challengeDurationSec) drives poolCooldownMs — see that
// function's own comment.
export async function initPoseidonsPool(gameId, round, participants, seed, challengeDurationSec, db) {
  const set = db?.set || storageSet;
  const participantIds = participants.map((p) => p.id);
  const now = Date.now();

  if (participantIds.length < MIN_PARTICIPANTS) {
    await set(gameId, key(round), {
      participantIds,
      balls: participantIds.length ? { [participantIds[0]]: { x: TABLE_W / 2, y: TABLE_H / 2, eliminated: false } } : {},
      ballDefs: participantIds.length ? { [participantIds[0]]: { color: colorForIndex(0), number: 1 } } : {},
      queue: [], cooldownUntil: {}, cooldownMs: poolCooldownMs(challengeDurationSec),
      eliminatedOrder: [], shotLog: [], currentShot: null,
      startedAt: now, winnerIds: participantIds.slice(0, 1), gameEnded: true, endReason: "degenerate", degenerate: true, endedAt: now,
    });
    return;
  }

  const positions = startingPositions(participantIds, seed);
  const balls = {};
  const ballDefs = {};
  participantIds.forEach((id, i) => {
    balls[id] = { x: positions[id].x, y: positions[id].y, eliminated: false };
    ballDefs[id] = { color: colorForIndex(i), number: i + 1 };
  });

  await set(gameId, key(round), {
    participantIds,
    balls, // playerId -> { x, y, eliminated } — the table's authoritative, at-rest positions between shots
    ballDefs, // playerId -> { color, number } — cosmetic, assigned once at init
    queue: [], // [{ id, playerId, angle (radians), power (0-1), submittedAt }] — FIFO, drained one at a time by tickPoseidonsPool
    cooldownUntil: {}, // playerId -> ms epoch this player's next shot may be SUBMITTED at
    cooldownMs: poolCooldownMs(challengeDurationSec),
    eliminatedOrder: [], // playerId, in the order they were sunk — see placementValue
    shotLog: [], // recent resolved-shot summaries, newest last, for the activity feed: { at, playerId, sunkIds, selfScratch }
    // The most recently RESOLVED shot's full outcome — every client
    // animates this, purely cosmetically, for `resolvingUntil - startedAt`
    // real ms. `balls` above is already the authoritative post-shot
    // state the instant this is written; this is replay data only.
    currentShot: null, // { id, playerId, angle, power, startedAt, durationMs, resolvingUntil, trajectories, sunkIds }
    startedAt: now,
    winnerIds: [],
    gameEnded: false,
    endReason: null, // "lastStanding" | "timeout" | "degenerate"
    endedAt: null,
    degenerate: false,
  });
}

// The core, pure physics function — deterministic given its inputs, no
// I/O, safe to call synchronously inside a storageUpdate callback.
// `activeBalls`: [{ id, x, y }] for every currently NOT-eliminated
// player's ball. Returns the complete outcome of firing the shooter's
// ball at `angle` (radians) and `power` (0-1).
export function simulateShot(activeBalls, shooterId, angle, power) {
  const speed0 = MIN_POWER_SPEED + clamp01(power) * (MAX_POWER_SPEED - MIN_POWER_SPEED);
  const balls = activeBalls.map((b) => ({
    id: b.id,
    x: b.x,
    y: b.y,
    vx: b.id === shooterId ? Math.cos(angle) * speed0 : 0,
    vy: b.id === shooterId ? Math.sin(angle) * speed0 : 0,
    sunk: false,
  }));

  const trajectories = {};
  balls.forEach((b) => { trajectories[b.id] = [{ t: 0, x: b.x, y: b.y }]; });
  const sunkIds = [];
  const finalized = new Set();

  let step = 0;
  let moving = true;
  while (moving && step < MAX_STEPS) {
    step++;
    moving = false;

    // ─── friction + integrate ───
    for (const b of balls) {
      if (b.sunk) continue;
      const speed = Math.hypot(b.vx, b.vy);
      if (speed <= STOP_EPS) { b.vx = 0; b.vy = 0; continue; }
      const newSpeed = Math.max(0, speed - FRICTION_DECEL * DT);
      const scale = newSpeed / speed;
      b.vx *= scale; b.vy *= scale;
      b.x += b.vx * DT; b.y += b.vy * DT;
      if (newSpeed > STOP_EPS) moving = true;
    }

    // ─── pockets — checked before cushions, so a ball heading into a
    // corner/side pocket falls in rather than getting clamped by the
    // wall-bounce logic just below ───
    for (const b of balls) {
      if (b.sunk) continue;
      for (const p of POCKETS) {
        if (Math.hypot(b.x - p.x, b.y - p.y) <= POCKET_R) {
          b.sunk = true; b.vx = 0; b.vy = 0;
          sunkIds.push(b.id);
          trajectories[b.id].push({ t: Math.round(step * DT * 1000), x: p.x, y: p.y });
          finalized.add(b.id);
          break;
        }
      }
    }

    // ─── cushions ───
    for (const b of balls) {
      if (b.sunk) continue;
      if (b.x < BALL_R) { b.x = BALL_R; b.vx = -b.vx * CUSHION_REST; moving = true; }
      if (b.x > TABLE_W - BALL_R) { b.x = TABLE_W - BALL_R; b.vx = -b.vx * CUSHION_REST; moving = true; }
      if (b.y < BALL_R) { b.y = BALL_R; b.vy = -b.vy * CUSHION_REST; moving = true; }
      if (b.y > TABLE_H - BALL_R) { b.y = TABLE_H - BALL_R; b.vy = -b.vy * CUSHION_REST; moving = true; }
    }

    // ─── ball-ball collisions — standard equal-mass elastic collision:
    // separate any overlap, then exchange the velocity component ALONG
    // the collision normal (tangential component untouched) ───
    for (let i = 0; i < balls.length; i++) {
      const A = balls[i];
      if (A.sunk) continue;
      for (let j = i + 1; j < balls.length; j++) {
        const B = balls[j];
        if (B.sunk) continue;
        const dx = B.x - A.x, dy = B.y - A.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0.0001 && dist < BALL_R * 2) {
          const nx = dx / dist, ny = dy / dist;
          const overlap = BALL_R * 2 - dist;
          A.x -= (nx * overlap) / 2; A.y -= (ny * overlap) / 2;
          B.x += (nx * overlap) / 2; B.y += (ny * overlap) / 2;
          const relVx = A.vx - B.vx, relVy = A.vy - B.vy;
          const velAlongNormal = relVx * nx + relVy * ny;
          if (velAlongNormal > 0) {
            const impulse = velAlongNormal * BALL_REST;
            A.vx -= impulse * nx; A.vy -= impulse * ny;
            B.vx += impulse * nx; B.vy += impulse * ny;
            moving = true;
          }
        }
      }
    }

    // ─── keyframe sampling ───
    if (step % SAMPLE_EVERY === 0) {
      const tMs = Math.round(step * DT * 1000);
      for (const b of balls) {
        if (finalized.has(b.id)) continue;
        trajectories[b.id].push({ t: tMs, x: b.x, y: b.y });
      }
    }
  }

  const totalMs = Math.round(step * DT * 1000);
  for (const b of balls) {
    if (!finalized.has(b.id)) trajectories[b.id].push({ t: totalMs, x: b.x, y: b.y });
  }

  return {
    finalPositions: balls.filter((b) => !b.sunk).map((b) => ({ id: b.id, x: b.x, y: b.y })),
    sunkIds,
    trajectories,
    durationMs: Math.max(MIN_REPLAY_MS, totalMs),
  };
}

// A living player submits a shot: aim `angle` (radians) at `power`
// (0-1). Rejected as a silent no-op (same convention as every other
// action function in this app) if the game's over, this player is
// eliminated or unknown, or their own cooldown hasn't expired yet. The
// shot is only ever APPENDED to the queue here — see this file's header
// for why resolution is deliberately never done inline in this call.
export async function submitShot(gameId, round, playerId, angle, power) {
  return storageUpdate(gameId, key(round), (fresh) => {
    if (!fresh || fresh.gameEnded) return fresh;
    if (!fresh.participantIds.includes(playerId)) return fresh;
    if (fresh.balls[playerId]?.eliminated) return fresh;
    const now = Date.now();
    if (now < (fresh.cooldownUntil[playerId] || 0)) return fresh;
    if (!Number.isFinite(angle) || !Number.isFinite(power)) return fresh;

    const entry = { id: `${now}-${Math.random().toString(36).slice(2, 8)}`, playerId, angle, power: clamp01(power), submittedAt: now };
    return {
      ...fresh,
      queue: [...fresh.queue, entry],
      cooldownUntil: { ...fresh.cooldownUntil, [playerId]: now + fresh.cooldownMs },
    };
  });
}

// The authoritative tick: pops and fully resolves exactly ONE queued
// shot per call, unless the table is still mid-replay of the previously
// resolved shot (`currentShot.resolvingUntil` hasn't passed yet) — see
// this file's header for the full race-safety reasoning. Also the
// outer-timeout safety net: if the queue's empty and the Battle's own
// challenge.endsAt has passed with 2+ balls still on the table, every
// remaining ball's owner is declared a joint winner (same "shared
// victory on timeout" convention as riverStyxData.js/wineDarkSeaData.js
// for their own "still 2+ crossing when the deck runs dry" case).
// Called on its own short interval by both the phone and the TV
// display, AND from lib/roundEngine.js's housekeeping pass — safe to
// call as often as anyone likes.
export async function tickPoseidonsPool(gameId, round, endsAt, db) {
  const update = db?.update || storageUpdate;
  return update(gameId, key(round), (fresh) => {
    if (!fresh || fresh.gameEnded) return fresh;
    const now = Date.now();

    if (fresh.currentShot && now < fresh.currentShot.resolvingUntil) return fresh; // still mid-replay — never pop early

    if (fresh.queue.length > 0) {
      const [next, ...restQueue] = fresh.queue;

      // Re-validate: the shooter could since have been eliminated by an
      // earlier queued shot that resolved first.
      if (fresh.balls[next.playerId]?.eliminated) {
        return { ...fresh, queue: restQueue };
      }

      const aliveBefore = fresh.participantIds
        .filter((pid) => !fresh.balls[pid].eliminated)
        .map((pid) => ({ id: pid, x: fresh.balls[pid].x, y: fresh.balls[pid].y }));

      const sim = simulateShot(aliveBefore, next.playerId, next.angle, next.power);

      const balls = { ...fresh.balls };
      sim.finalPositions.forEach((fp) => { balls[fp.id] = { ...balls[fp.id], x: fp.x, y: fp.y }; });
      const eliminatedOrder = [...fresh.eliminatedOrder];
      sim.sunkIds.forEach((pid) => {
        balls[pid] = { ...balls[pid], eliminated: true };
        if (!eliminatedOrder.includes(pid)) eliminatedOrder.push(pid);
      });

      const stillAlive = fresh.participantIds.filter((pid) => !balls[pid].eliminated);
      let gameEnded = fresh.gameEnded;
      let endReason = fresh.endReason;
      let endedAt = fresh.endedAt;
      let winnerIds = fresh.winnerIds;
      if (stillAlive.length <= 1) {
        gameEnded = true;
        endReason = "lastStanding";
        endedAt = now;
        // The ordinary case: exactly one ball remains — they win. The
        // simultaneous-double-elimination edge case: this very shot
        // sank BOTH of the last two balls at once, leaving zero — treat
        // it as a tie between whoever was still alive immediately
        // BEFORE this shot resolved (aliveBefore), per this file's
        // header comment.
        winnerIds = stillAlive.length === 1 ? stillAlive : aliveBefore.map((b) => b.id);
      }

      return {
        ...fresh,
        queue: restQueue,
        balls,
        eliminatedOrder,
        currentShot: {
          id: next.id, playerId: next.playerId, angle: next.angle, power: next.power,
          startedAt: now, durationMs: sim.durationMs, resolvingUntil: now + sim.durationMs,
          trajectories: sim.trajectories, sunkIds: sim.sunkIds,
        },
        shotLog: [...fresh.shotLog, { at: now, playerId: next.playerId, sunkIds: sim.sunkIds, selfScratch: sim.sunkIds.includes(next.playerId) }].slice(-24),
        gameEnded, endReason, endedAt, winnerIds,
      };
    }

    if (endsAt && now >= endsAt) {
      const stillAlive = fresh.participantIds.filter((pid) => !fresh.balls[pid].eliminated);
      if (stillAlive.length === 0) return fresh; // degenerate — shouldn't happen, nothing sane to declare
      return { ...fresh, gameEnded: true, endReason: "timeout", endedAt: now, winnerIds: stillAlive };
    }

    return fresh;
  });
}

// Winner(s) score highest (a shared win, from the simultaneous-
// double-elimination case or a timeout with 2+ still standing, all
// score identically at the top); everyone else scores by how long they
// survived — later elimination (a higher index in eliminatedOrder)
// ranks above earlier elimination. Same shape as
// lib/games/riverStyxData.js's own placementValue.
export function placementValue(state, playerId) {
  if (!state) return 0;
  const total = state.participantIds?.length || 1;
  if (state.winnerIds?.includes(playerId)) return total + 1;
  const fellAt = state.eliminatedOrder.indexOf(playerId);
  if (fellAt === -1) return total; // still active, game not over yet — provisional top score
  return fellAt + 1;
}
