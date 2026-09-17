import { storageSet, storageUpdate, subscribeGameState } from "../gameStorage";

// ─── Eyes in the System ───
// Panopticon's own take on Big Brother's "Bugs in the System" HOH
// format: three zones (A, B, C), each scattered with colored eyes: a
// glance-and-count competition rather than a knowledge one. The
// original used bugs; eyes fit this show's own name and theme far
// better — a panopticon IS the all-seeing structure, so "which zone
// has the most red eyes watching it" is a much more natural fit than
// an arbitrary insect theme would be. See components/games/
// EyesInTheSystemIcons.jsx for the actual SVG.
//
// This file is the shared engine — round generation (used by both the
// normal 8-round mode and the Big Screen head-to-head bracket) and the
// normal-mode data model. See lib/games/eyesInTheSystemTvData.js for
// the separate Big Screen bracket model, which reuses generateRound
// from here but has a genuinely different structure around it (two
// players at a time, winner-picks-next elimination, rather than
// everyone playing the same 8 rounds independently).
export const EYE_COLOR_KEYS = ["red", "green", "gold", "violet"];
const ZONE_KEYS = ["A", "B", "C"];
const ROUNDS_PER_GAME = 8;

function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Scatters `count` eyes of one color within one zone's own local
// 0-100 x 0-100 coordinate space (each zone renders at whatever actual
// pixel size fits its container — these are always percentages, never
// absolute pixels). A coarse grid-plus-jitter approach: divides the
// zone into a grid with at least as many cells as the total eye count
// across ALL colors in that zone (passed in as `totalInZone`), assigns
// this color's eyes to a random subset of cells, and jitters each
// position within its cell — keeps eyes from landing directly on top
// of each other without needing genuine collision detection.
function scatterPositions(count, totalInZone, cellAssignments, rng) {
  const positions = [];
  for (let i = 0; i < count; i++) {
    const cell = cellAssignments.pop();
    const [cellX, cellY, cellSize] = cell;
    const jitterX = (rng() - 0.5) * cellSize * 0.6;
    const jitterY = (rng() - 0.5) * cellSize * 0.6;
    positions.push({
      x: Math.max(6, Math.min(94, cellX + jitterX)),
      y: Math.max(6, Math.min(94, cellY + jitterY)),
      rotation: Math.floor(rng() * 360),
    });
  }
  return positions;
}

function buildCellGrid(totalCells, rng) {
  const cols = Math.ceil(Math.sqrt(totalCells * 1.3)); // a bit more room than strictly needed, so jitter has space to work with
  const rows = Math.ceil(totalCells / cols) + 1;
  const cellW = 100 / cols;
  const cellH = 100 / rows;
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push([cellW * c + cellW / 2, cellH * r + cellH / 2, Math.min(cellW, cellH)]);
    }
  }
  return shuffle(cells, rng);
}

// One full round: a target color, three zones each scattered with a
// mix of all four colors, and a guaranteed-unique correct answer (the
// target color's count is never tied across the three zones — picked
// as three genuinely distinct values from the start, rather than
// generated independently and hoping, which is what makes the
// generation itself simple and still always fair).
export function generateRound(rng) {
  const targetColor = EYE_COLOR_KEYS[Math.floor(rng() * EYE_COLOR_KEYS.length)];
  const targetCountPool = shuffle([2, 3, 4, 5, 6, 7], rng).slice(0, 3);
  const decoyColors = EYE_COLOR_KEYS.filter((c) => c !== targetColor);

  const zones = ZONE_KEYS.map((zoneKey, i) => {
    const colorCounts = { [targetColor]: targetCountPool[i] };
    decoyColors.forEach((c) => { colorCounts[c] = 1 + Math.floor(rng() * 5); });
    const totalInZone = Object.values(colorCounts).reduce((a, b) => a + b, 0);
    const cellAssignments = buildCellGrid(totalInZone, rng);

    const eyes = [];
    EYE_COLOR_KEYS.forEach((color) => {
      const positions = scatterPositions(colorCounts[color], totalInZone, cellAssignments, rng);
      positions.forEach((pos) => eyes.push({ color, ...pos }));
    });

    return { zone: zoneKey, eyes, targetCount: colorCounts[targetColor] };
  });

  const correctZone = zones.reduce((best, z) => (z.targetCount > best.targetCount ? z : best)).zone;
  return { targetColor, zones, correctZone };
}

export function placementValue(state, playerId) {
  const entry = state.results?.[playerId];
  if (!entry) return 0;
  // score-desc primary, time-asc tiebreak folded in beneath it — same
  // large-multiplier-plus-inverse-time approach used throughout this
  // app's other games (see e.g. lib/games/artAuctionData.js's own
  // PIECE_MULTIPLIER comment) so a single reported number carries both.
  return entry.correctCount * 1e10 - entry.totalTimeMs;
}

// ─── Normal mode (score-desc, everyone plays the same 8 rounds independently) ───
export const eyesKey = (round) => `pb:eyesinthesystem:${round}`;

export function subscribeEyes(gameId, round, onChange) {
  return subscribeGameState(gameId, eyesKey(round), onChange);
}

export async function initEyesInTheSystem(gameId, round, participants, seed, db) {
  const set = db?.set || storageSet;
  const baseSeed = seed || Date.now();
  // Every player gets the exact same 8 rounds, in the same order — a
  // shared, pre-generated sequence rather than each phone generating
  // its own independently, since fairness here means everyone counts
  // the same eyes, not just the same number of them.
  const rng = mulberry32(baseSeed);
  const rounds = Array.from({ length: ROUNDS_PER_GAME }, () => generateRound(rng));
  await set(gameId, eyesKey(round), { rounds, results: {} });
}

// A player's own progress through the 8 rounds — kept per-player, on
// their own row, since (unlike the Big Screen bracket) nobody's
// waiting on anyone else here. answers: [{ correct: bool, timeMs }] in
// round order; called once after each answer, and once more (final)
// after the 8th.
export async function submitEyesAnswer(gameId, round, playerId, roundIndex, chosenZone, timeMs) {
  return storageUpdate(gameId, eyesKey(round), (fresh) => {
    if (!fresh) return fresh;
    const existing = fresh.results[playerId] || { answers: [], correctCount: 0, totalTimeMs: 0 };
    if (existing.answers[roundIndex]) return fresh; // already answered this one — no double-submit
    const correct = fresh.rounds[roundIndex].correctZone === chosenZone;
    const nextAnswers = [...existing.answers];
    nextAnswers[roundIndex] = { correct, timeMs };
    return {
      ...fresh,
      results: {
        ...fresh.results,
        [playerId]: {
          answers: nextAnswers,
          correctCount: existing.correctCount + (correct ? 1 : 0),
          totalTimeMs: existing.totalTimeMs + timeMs,
        },
      },
    };
  });
}

export const EYES_ROUNDS_PER_GAME = ROUNDS_PER_GAME;
