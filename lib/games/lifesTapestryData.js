// ─── Life's a Tapestry ───
// A clone of the classic Survivor challenge: a woven image is cut into
// a grid and its rows/columns are cyclically shifted (never a plain
// tile-swap) — you put it back together by cyclically shifting whole
// rows left/right and whole columns up/down, matching the small
// reference image, then locking it in.
//
// Same "shuffle via simulated legal moves" solvability trick as
// lib/games/slidingPuzzleData.js: a cyclic row/column shift is its own
// kind of move, and reversing that exact same move (opposite direction)
// always undoes it — so any sequence of these moves applied to the
// solved grid is, by construction, always fully solvable by moves of
// the same kind. There's no separate parity check needed the way a
// raw random permutation of tiles would require.
//
// Same shared-seed fairness as Sliding Puzzle/Whack-a-Mole/Stroop/Red
// Light Green Light — everyone races the identical scramble, seeded off
// the challenge's own startedAt, not their own independently-random one.
export const ROWS = 4;
export const COLS = 5;
const SHUFFLE_OPS = 26;

function seededRandom(seed) {
  let s = seed || 1;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

function solvedGrid() {
  // Each cell holds its own "home" index (0..ROWS*COLS-1) — the slice of
  // the source image it should show once solved. Solved means every
  // cell's value equals its own position.
  return Array.from({ length: ROWS * COLS }, (_, i) => i);
}

function rowPositions(r) {
  return Array.from({ length: COLS }, (_, c) => r * COLS + c);
}
function colPositions(c) {
  return Array.from({ length: ROWS }, (_, r) => r * COLS + c);
}

function rotatePositions(grid, positions, dir) {
  const next = [...grid];
  const values = positions.map((p) => grid[p]);
  // dir > 0 rotates "forward" (right for a row, down for a column) —
  // the last value wraps around to the front. dir < 0 rotates the
  // other way — the first value wraps around to the back.
  const rotated = dir > 0 ? [values[values.length - 1], ...values.slice(0, -1)] : [...values.slice(1), values[0]];
  positions.forEach((p, i) => { next[p] = rotated[i]; });
  return next;
}

// dir: -1 = left, 1 = right
export function shiftRow(grid, r, dir) {
  return rotatePositions(grid, rowPositions(r), dir);
}
// dir: -1 = up, 1 = down
export function shiftCol(grid, c, dir) {
  return rotatePositions(grid, colPositions(c), dir);
}

export function generateScramble(seed) {
  const rand = seededRandom(seed || 1);
  let grid = solvedGrid();
  let lastOp = null;

  for (let i = 0; i < SHUFFLE_OPS; i++) {
    let op;
    do {
      const isRow = rand() < 0.5;
      const idx = Math.floor(rand() * (isRow ? ROWS : COLS));
      const dir = rand() < 0.5 ? -1 : 1;
      op = { isRow, idx, dir };
      // Avoid immediately undoing the previous move (same reasoning as
      // slidingPuzzleData's own neighbor filter) so the shuffle doesn't
      // waste moves wandering back and forth.
    } while (lastOp && op.isRow === lastOp.isRow && op.idx === lastOp.idx && op.dir === -lastOp.dir);
    grid = op.isRow ? shiftRow(grid, op.idx, op.dir) : shiftCol(grid, op.idx, op.dir);
    lastOp = op;
  }

  return grid;
}

export function isSolved(grid) {
  return grid.every((v, i) => v === i);
}

// How many cells currently show their correct home slice — used as the
// partial-progress score for anyone who runs out of time without
// finishing.
export function correctCount(grid) {
  return grid.reduce((count, v, i) => count + (v === i ? 1 : 0), 0);
}

// ─── The woven images themselves ───
// Five different weavings, each a black-figure-style Greek terracotta
// illustration of a different deity, all sharing the exact same
// composition — the same border, the same medallion, the same plain
// robed silhouette — so that whichever one a given Battle draws, the
// tiles read as genuinely similar while scrambled (the real puzzle's
// whole difficulty) and only resolve into a specific, recognizable god
// once actually reassembled. Which variant a Battle gets is seeded off
// the challenge's own startedAt (see pickVariantIndex below), so
// everyone in the same Battle sees the same one, and it varies from
// Battle to Battle the way the real challenge cycles through several
// different tapestries.
//
// Built as inline SVG rather than real image files so there's nothing
// to upload/host — every tile pulls its own slice of the picture via
// CSS background-position (see LifesTapestryPlayer.jsx), the same way
// a real jigsaw's box art gets cut into pieces.
export const TAPESTRY_W = 500;
export const TAPESTRY_H = 400;

const INK = "#1a0f08";
const CLAY = "#c2703d";

function borderAndMedallion() {
  return `<defs>
    <pattern id='tapWeave' width='10' height='10' patternTransform='rotate(45)' patternUnits='userSpaceOnUse'>
      <rect width='10' height='10' fill='#3a2013'/>
      <rect width='5' height='10' fill='#42250f'/>
    </pattern>
    <pattern id='tapMeander' width='40' height='40' patternUnits='userSpaceOnUse'>
      <rect width='40' height='40' fill='#2a1810'/>
      <path d='M2 12 H30 V30 H12 V20 H38' stroke='${CLAY}' stroke-width='6' fill='none'/>
    </pattern>
  </defs>
  <rect width='${TAPESTRY_W}' height='${TAPESTRY_H}' fill='url(#tapWeave)'/>
  <rect x='13' y='13' width='${TAPESTRY_W - 26}' height='${TAPESTRY_H - 26}' fill='none' stroke='url(#tapMeander)' stroke-width='26'/>
  <circle cx='250' cy='205' r='148' fill='${CLAY}' stroke='${INK}' stroke-width='9'/>`;
}

// Every variant shares this exact robed silhouette — a plain head
// circle over a single-taper robe, nothing else — which is the whole
// point: it's what makes scrambled tiles from any variant look like
// scrambled tiles from any other. headExtra (a helmet, wings — part of
// the figure's own outline against the clay background) and headDetail
// (a beard, hair — drawn in CLAY on top of the already-black head/robe,
// the same way a real black-figure vase incises fine lines through the
// glaze to show the clay underneath) are the only things that vary.
function baseFigure(headExtra = "", headDetail = "") {
  return `<path d='M233 128 L267 128 Q298 144 298 176 L303 312
             Q303 330 284 330 L216 330 Q197 330 197 312 L202 176
             Q202 144 233 128 Z' fill='${INK}'/>
    <circle cx='250' cy='100' r='27' fill='${INK}'/>
    ${headExtra}
    ${headDetail}`;
}

function wrapTapestry(inner, label) {
  return `<svg xmlns='http://www.w3.org/2000/svg' width='${TAPESTRY_W}' height='${TAPESTRY_H}' viewBox='0 0 ${TAPESTRY_W} ${TAPESTRY_H}'>
    ${borderAndMedallion()}
    ${inner}
    <text x='250' y='378' font-size='15' fill='${CLAY}' text-anchor='middle' font-family='Georgia, serif' letter-spacing='2'>${label}</text>
  </svg>`;
}

const ZEUS_SVG = wrapTapestry(`
  ${baseFigure("", `<path d='M238 118 Q250 132 262 118 L259 127 Q250 138 241 127 Z' fill='${CLAY}'/>`)}
  <path d='M328 92 L308 128 L324 130 L302 168 L316 136 L300 134 Z' fill='${INK}'/>
`, "ZEUS");

const APHRODITE_SVG = wrapTapestry(`
  ${baseFigure("", `
    <path d='M234 90 Q228 98 234 108 M242 86 Q234 96 240 108' stroke='${CLAY}' stroke-width='5' fill='none' stroke-linecap='round'/>
    <path d='M266 90 Q272 98 266 108 M258 86 Q266 96 260 108' stroke='${CLAY}' stroke-width='5' fill='none' stroke-linecap='round'/>
  `)}
  <path d='M162 152 Q180 140 198 150 Q208 155 203 165 Q190 171 176 165 Q164 160 162 152 Z' fill='${INK}'/>
  <path d='M198 150 L216 144 L206 157 Z' fill='${INK}'/>
`, "APHRODITE");

const ATHENA_SVG = wrapTapestry(`
  ${baseFigure(`
    <path d='M220 92 Q250 58 280 92 Q280 76 250 66 Q220 76 220 92 Z' fill='${INK}'/>
    <path d='M242 62 Q250 36 258 62 Q265 44 272 64 Q260 74 250 71 Q240 74 242 62 Z' fill='${INK}'/>
  `)}
  <ellipse cx='330' cy='150' rx='17' ry='19' fill='${INK}'/>
  <path d='M317 137 L308 126 M343 137 L352 126' stroke='${INK}' stroke-width='4' fill='none' stroke-linecap='round'/>
  <circle cx='325' cy='147' r='3' fill='${CLAY}'/><circle cx='336' cy='147' r='3' fill='${CLAY}'/>
`, "ATHENA");

const POSEIDON_SVG = wrapTapestry(`
  ${baseFigure("", `<path d='M234 120 Q250 140 266 120 L263 132 Q250 146 237 132 Z' fill='${CLAY}'/>`)}
  <path d='M326 88 L326 172 M326 88 L312 116 M326 88 L340 116 M304 116 L348 116' stroke='${INK}' stroke-width='7' fill='none' stroke-linecap='round'/>
  <path d='M196 342 Q214 332 232 342 Q250 332 268 342 Q286 332 304 342' stroke='${INK}' stroke-width='6' fill='none' stroke-linecap='round'/>
`, "POSEIDON");

const HERMES_SVG = wrapTapestry(`
  ${baseFigure(`
    <path d='M223 90 Q198 82 202 62 Q220 66 231 86 Z' fill='${INK}'/>
    <path d='M277 90 Q302 82 298 62 Q280 66 269 86 Z' fill='${INK}'/>
  `)}
  <path d='M328 98 L328 176' stroke='${INK}' stroke-width='6' fill='none' stroke-linecap='round'/>
  <path d='M328 98 Q315 110 328 122 Q341 134 328 146 Q315 158 328 170' stroke='${INK}' stroke-width='4' fill='none'/>
  <path d='M310 96 Q319 85 330 96 M346 96 Q337 85 326 96' stroke='${INK}' stroke-width='4' fill='none' stroke-linecap='round'/>
`, "HERMES");

export const TAPESTRY_VARIANTS = [
  { id: "zeus", label: "Zeus", svg: ZEUS_SVG },
  { id: "aphrodite", label: "Aphrodite", svg: APHRODITE_SVG },
  { id: "athena", label: "Athena", svg: ATHENA_SVG },
  { id: "poseidon", label: "Poseidon", svg: POSEIDON_SVG },
  { id: "hermes", label: "Hermes", svg: HERMES_SVG },
].map((v) => ({ ...v, dataUri: `data:image/svg+xml,${encodeURIComponent(v.svg)}` }));

// Deliberately a different seed transform than generateScramble's own
// (see above) — the variant pick and the scramble shape are otherwise
// unrelated, and there's no reason for them to move in lockstep just
// because they happen to share the same underlying startedAt seed.
export function pickVariantIndex(seed) {
  // A plain offset, not a large multiply — seededRandom's own internal
  // multiply already loses precision once the seed it's fed exceeds
  // Number.MAX_SAFE_INTEGER (a real, confirmed bug here: an earlier
  // version multiplied the incoming seed by a large constant first,
  // which collapsed every real startedAt timestamp to the same result).
  // A small additive offset keeps this seed safely in the same range
  // Date.now()-style seeds already work in everywhere else in this file.
  const rand = seededRandom((seed || 1) + 7919);
  return Math.floor(rand() * TAPESTRY_VARIANTS.length);
}
