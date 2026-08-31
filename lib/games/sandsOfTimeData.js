import { storageGet, storageUpdate } from "../gameStorage";

// ─── Sands of Time ───
// Four hourglasses running simultaneously, each with its own duration
// (10-60s, seeded so every player faces the identical four — same
// shared-seed fairness as every other Battle in this app). A player
// can re-flip an hourglass once it's at least FLIP_THRESHOLD_FRACTION
// drained, keeping it going indefinitely — but each flip fades it a
// step further, until by MAX_FADE_FLIPS flips it's fully invisible,
// forcing the player to time later flips from memory/rhythm rather
// than what they can actually see. The run ends the instant ANY one
// hourglass fully drains without being re-flipped in time; score is
// just how long the run lasted — pure endurance, no "finish" state to
// race toward.
//
// Server-persisted rather than just a single usePersistedStart
// timestamp, because this game's own reset-avoidance IS the point of
// playing it well — a refresh must never hand a player a free do-over
// right before an hourglass would have run out. Flip validity is
// re-checked HERE, server-side, against the real elapsed time, not
// trusted from whatever the client claims — a client could otherwise
// send a flip request whenever it wanted, bypassing the UI's own
// disabled-button logic entirely.
export const NUM_HOURGLASSES = 4;
export const FLIP_THRESHOLD_FRACTION = 0.6; // can only re-flip once this fraction of the sand has drained
export const MAX_FADE_FLIPS = 5; // fully invisible once an hourglass has been flipped this many times

export const SAND_COLORS = [
  { name: "Rose", hex: "#ff2d95" },
  { name: "Cyan", hex: "#00d9ff" },
  { name: "Emerald", hex: "#00ff9d" },
  { name: "Amber", hex: "#ffd700" },
];

function seededRandom(seed) {
  let s = seed || 1;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

// NUM_HOURGLASSES distinct durations, each an integer 10-60 (inclusive)
// seconds, seeded from the challenge instance so every player faces
// the identical four.
export function generateHourglassDurations(seed) {
  const rand = seededRandom(seed || 1);
  const durations = [];
  while (durations.length < NUM_HOURGLASSES) {
    const candidate = 10 + Math.floor(rand() * 51); // 10-60 inclusive
    if (!durations.includes(candidate)) durations.push(candidate);
  }
  return durations;
}

export function elapsedFraction(lastFlippedAt, durationSec, now) {
  const elapsedMs = Math.max(0, now - lastFlippedAt);
  return Math.min(1, elapsedMs / (durationSec * 1000));
}

// Strictly less than 1 (not <=) — once it's actually reached 1, that
// hourglass has run out and the run is over; there's no "flip" left to
// offer at that point, the loss has already happened.
export function canFlip(lastFlippedAt, durationSec, now) {
  const frac = elapsedFraction(lastFlippedAt, durationSec, now);
  return frac >= FLIP_THRESHOLD_FRACTION && frac < 1;
}

export function hasRunOut(lastFlippedAt, durationSec, now) {
  return elapsedFraction(lastFlippedAt, durationSec, now) >= 1;
}

// 1 (fully visible, never flipped) down to 0 (fully invisible) in
// MAX_FADE_FLIPS even steps — capped at 0 rather than going negative
// for any flip beyond the 5th.
export function opacityForFlipCount(flipCount) {
  return Math.max(0, 1 - Math.min(flipCount, MAX_FADE_FLIPS) / MAX_FADE_FLIPS);
}

function stateKey(round, challengeStartedAt) {
  return `pb:sands-of-time:${round}:${challengeStartedAt}`;
}

// First call for a player creates their run (all four hourglasses
// starting fresh, fully visible); every later call — a remount, a tab
// switch, a refresh — reads back the SAME run already in progress,
// exactly like usePersistedStart's own single-timestamp version, just
// carrying the richer per-hourglass state this game needs.
export async function getOrInitPlayerState(gameId, round, challengeStartedAt, playerId) {
  const res = await storageUpdate(gameId, stateKey(round, challengeStartedAt), (fresh) => {
    const existing = fresh || {};
    if (existing[playerId]) return existing;
    const now = Date.now();
    existing[playerId] = {
      startedAt: now,
      hourglasses: Array.from({ length: NUM_HOURGLASSES }, () => ({ lastFlippedAt: now, flipCount: 0 })),
      done: false,
      finalScoreMs: null,
    };
    return existing;
  });
  return res?.value?.[playerId] || null;
}

export async function peekPlayerState(gameId, round, challengeStartedAt, playerId) {
  const value = await storageGet(gameId, stateKey(round, challengeStartedAt));
  return value?.[playerId] || null;
}

export async function recordFlip(gameId, round, challengeStartedAt, playerId, hourglassIndex) {
  const durations = generateHourglassDurations(challengeStartedAt);
  const res = await storageUpdate(gameId, stateKey(round, challengeStartedAt), (fresh) => {
    const existing = fresh || {};
    const playerState = existing[playerId];
    if (!playerState || playerState.done) return existing; // no active run, or already locked in -- nothing to flip
    const hg = playerState.hourglasses[hourglassIndex];
    if (!hg) return existing;
    const now = Date.now();
    if (!canFlip(hg.lastFlippedAt, durations[hourglassIndex], now)) return existing; // not actually eligible right now -- silently ignored, not an error
    hg.lastFlippedAt = now;
    hg.flipCount += 1;
    return existing;
  });
  return res?.value?.[playerId] || null;
}

// Locks the run permanently — once done, a later getOrInitPlayerState
// call for this same player+challenge-instance still returns this same
// locked state rather than ever starting a new run.
export async function recordLoss(gameId, round, challengeStartedAt, playerId, finalScoreMs) {
  const res = await storageUpdate(gameId, stateKey(round, challengeStartedAt), (fresh) => {
    const existing = fresh || {};
    const playerState = existing[playerId];
    if (!playerState || playerState.done) return existing;
    playerState.done = true;
    playerState.finalScoreMs = finalScoreMs;
    return existing;
  });
  return res?.value?.[playerId] || null;
}
