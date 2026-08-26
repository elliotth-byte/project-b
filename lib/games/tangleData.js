// ─── Tangle ───
// Solo, client-only (see lib/games/hueData.js's own header comment) —
// the full graph is visible from the start.
//
// Same generation philosophy as every solvability-critical game in
// this batch (Tavo's crate levels, Operator's arithmetic targets):
// don't generate a random structure and hope it happens to be
// solvable — build it FROM a state that's already known-good, then
// scramble around that. Here: place nodes on a circle where NO two
// straight chords between them can possibly cross (a well-defined,
// checkable property of points in convex position), pick edges that
// satisfy that non-crossing rule, and only THEN scramble node
// POSITIONS (never the edge list) to create the tangled starting
// puzzle. The solution always exists — moving nodes back to any
// layout equivalent to the original circle order untangles it — 
// because the edge structure was never anything but planar to begin
// with.

function seededRandom(seed) {
  let s = seed || 1;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

const NODE_COUNT = 7;
const TARGET_EDGES = 9;
const BOARD_W = 320;
const BOARD_H = 320;
const MARGIN = 36; // keeps nodes off the very edge of the play area

// ─── Geometry: general-position line segment intersection ───
// Standard orientation-based test. Deliberately does NOT special-case
// collinear overlaps beyond the textbook onSegment check — for a
// dragged-node puzzle, exact collinearity is a measure-zero event that
// essentially never happens with floating-point coordinates, and
// treating a poorly-defined edge case wrong here would be far less
// consequential than getting the ordinary crossing case wrong.
function orientation(p, q, r) {
  const val = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
  if (Math.abs(val) < 1e-9) return 0; // collinear (within floating-point tolerance)
  return val > 0 ? 1 : 2;
}

function onSegment(p, q, r) {
  return (
    q.x <= Math.max(p.x, r.x) + 1e-9 && q.x >= Math.min(p.x, r.x) - 1e-9 &&
    q.y <= Math.max(p.y, r.y) + 1e-9 && q.y >= Math.min(p.y, r.y) - 1e-9
  );
}

export function segmentsIntersect(p1, p2, p3, p4) {
  const o1 = orientation(p1, p2, p3);
  const o2 = orientation(p1, p2, p4);
  const o3 = orientation(p3, p4, p1);
  const o4 = orientation(p3, p4, p2);

  if (o1 !== o2 && o3 !== o4) return true; // general, non-collinear crossing case

  if (o1 === 0 && onSegment(p1, p3, p2)) return true;
  if (o2 === 0 && onSegment(p1, p4, p2)) return true;
  if (o3 === 0 && onSegment(p3, p1, p4)) return true;
  if (o4 === 0 && onSegment(p3, p2, p4)) return true;

  return false;
}

// ─── Circular non-crossing test (for GENERATION only, not live play) ───
// Two chords among points placed in circular order 0..N-1 cross iff
// their endpoints strictly interleave going around the circle — this
// is a completely different (and much cheaper) test from the general
// segmentsIntersect above, valid only because generation constrains
// points to that specific convex arrangement. Never used once the
// board is scrambled into arbitrary positions — segmentsIntersect
// takes over entirely at that point.
function chordsCrossOnCircle(a, b, c, d) {
  const lo = Math.min(a, b), hi = Math.max(a, b);
  const inArc = (x) => x > lo && x < hi;
  return inArc(c) !== inArc(d);
}

export function computeCrossings(nodes, edges) {
  const crossing = new Set();
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const [a, b] = edges[i];
      const [c, d] = edges[j];
      if (a === c || a === d || b === c || b === d) continue; // edges sharing an endpoint are never "crossing" in this puzzle, even though they geometrically touch there
      if (segmentsIntersect(nodes[a], nodes[b], nodes[c], nodes[d])) {
        crossing.add(i);
        crossing.add(j);
      }
    }
  }
  return crossing;
}

export function generatePuzzle(seed) {
  const rand = seededRandom(seed);

  // Reference circular layout — guaranteed non-crossing by construction.
  const cx = BOARD_W / 2, cy = BOARD_H / 2, radius = Math.min(BOARD_W, BOARD_H) / 2 - MARGIN;
  const circlePositions = [];
  for (let i = 0; i < NODE_COUNT; i++) {
    const angle = (i / NODE_COUNT) * Math.PI * 2 - Math.PI / 2;
    circlePositions.push({ x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) });
  }

  // Build a random set of chords, only keeping ones that don't cross
  // any already-accepted chord (per the circular test above).
  const edges = [];
  const allPairs = [];
  for (let i = 0; i < NODE_COUNT; i++) {
    for (let j = i + 1; j < NODE_COUNT; j++) allPairs.push([i, j]);
  }
  const shuffled = [...allPairs].sort(() => rand() - 0.5);
  for (const [a, b] of shuffled) {
    if (edges.length >= TARGET_EDGES) break;
    const conflicts = edges.some(([c, d]) => chordsCrossOnCircle(a, b, c, d));
    if (!conflicts) edges.push([a, b]);
  }

  const nodes = scramblePositionsUntilTangled(rand, edges, seed);
  return { nodes, edges, circlePositions };
}

// A random scatter of 7 points with only 6-9 edges can plausibly land
// with zero crossings by pure chance (confirmed by testing: roughly
// 7% of raw scrambles) — same class of issue as Tavo's occasional
// already-solved board, and the fix is the same: retry with a
// different derived seed rather than ever hand a player a "puzzle"
// that's already done.
function scramblePositionsUntilTangled(rand, edges, seed) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const nodes = scramblePositions(attempt === 0 ? rand : seededRandom((seed || 1) + attempt * 7919));
    if (!isUntangled(nodes, edges)) return nodes;
  }
  return scramblePositions(rand); // exhausted retries (should be astronomically unlikely) — return whatever we get rather than loop forever
}

function scramblePositions(rand) {
  const nodes = [];
  for (let i = 0; i < NODE_COUNT; i++) {
    nodes.push({
      x: MARGIN + rand() * (BOARD_W - MARGIN * 2),
      y: MARGIN + rand() * (BOARD_H - MARGIN * 2),
    });
  }
  return nodes;
}

export function rescramble(seed, attempt) {
  const rand = seededRandom((seed || 1) + attempt * 7919);
  return scramblePositions(rand);
}

export function isUntangled(nodes, edges) {
  return computeCrossings(nodes, edges).size === 0;
}

export { NODE_COUNT, BOARD_W, BOARD_H, MARGIN };
