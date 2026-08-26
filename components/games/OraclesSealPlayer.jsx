import { useState, useEffect, useRef, useMemo } from "react";
import { Card, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { reportScore } from "../../lib/challengeScores";
import { usePersistedStart } from "./usePersistedStart";

// ─── The Oracle's Seal ───
// An original "carefully trace a shape's outline without breaking it"
// mechanic — not a reproduction of any specific copyrighted carving or
// candy-cutting property. The underlying idea (delicately tracing a
// stamped shape out of something fragile without cracking it) is itself
// a real, pre-existing tradition — this is an original digital
// interpretation of that idea, under its own name and its own framing:
// carving a shape free of a fragile clay Oracle's tablet with a stylus,
// fitting this app's own theme directly.
//
// Waypoint-based rather than free-form continuous tracing, deliberately
// — far more robust to build correctly than full arc-length path
// tracking with anti-cheat, while still capturing the real tension: drag
// from the start point toward the next waypoint in order, stay within
// TOLERANCE_PX of that straight segment, and reaching within
// CAPTURE_RADIUS_PX of the target advances to the next one. Straying
// off-path racks up a crack; too many cracks (or lifting the stylus
// before the whole outline is done — same as the real tension of
// continuous, unbroken contact) shatters the tablet outright.
//
// Scoring: finishing without shattering ranks by SPEED (faster is
// better); shattering ranks by how much of the outline was completed
// first — see placementFor.

const VIEW_SIZE = 300;
const TOLERANCE_PX = 18;
const CAPTURE_RADIUS_PX = 22;
const MAX_CRACKS = 4;

function starPoints() {
  const cx = VIEW_SIZE / 2, cy = VIEW_SIZE / 2, outerR = 110, innerR = 45;
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    pts.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
  }
  return pts;
}

function trianglePoints() {
  const cx = VIEW_SIZE / 2, cy = VIEW_SIZE / 2, r = 115;
  const pts = [];
  for (let i = 0; i < 3; i++) {
    const angle = (2 * Math.PI / 3) * i - Math.PI / 2;
    pts.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
  }
  return pts;
}

function circlePoints() {
  const cx = VIEW_SIZE / 2, cy = VIEW_SIZE / 2, r = 100;
  const pts = [];
  const sides = 16; // enough sides that it reads as a circle while keeping segment-based tolerance checking simple
  for (let i = 0; i < sides; i++) {
    const angle = (2 * Math.PI / sides) * i - Math.PI / 2;
    pts.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
  }
  return pts;
}

const SHAPES = [
  { name: "Star", points: starPoints },
  { name: "Triangle", points: trianglePoints },
  { name: "Circle", points: circlePoints },
];

function distanceToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// Clearing the whole outline is strictly best, ranked by speed
// (faster = higher value, since this feeds a "score-desc" game — see
// the registry entry). Shattering ranks by progress: how many waypoints
// were reached before it broke.
function placementFor(finished, elapsedMs, waypointsReached) {
  if (finished) return 1000000 - Math.floor(elapsedMs / 10); // faster finish = higher value, never negative for any realistic completion time
  return waypointsReached;
}

export default function OraclesSealPlayer({ gameId, round, challenge, player }) {
  const seed = (challenge?.startedAt || 1) + (player?.id ? player.id.split("-")[0].length : 0);
  const shape = useMemo(() => SHAPES[seed % SHAPES.length], [seed]);
  const points = useMemo(() => shape.points(), [shape]);

  const [targetIndex, setTargetIndex] = useState(1); // index into points[] — 0 is the fixed start, so tracing begins aiming at 1
  const [tracedPath, setTracedPath] = useState([points[0]]);
  const [cracks, setCracks] = useState(0);
  const [wasOffPath, setWasOffPath] = useState(false); // only counts a NEW crack on the on->off transition, not every frame spent off-path
  const [dragging, setDragging] = useState(false);
  const [shattered, setShattered] = useState(false);
  const [finished, setFinished] = useState(false);
  const svgRef = useRef(null);
  const reported = useRef(false);
  const startTime = usePersistedStart(gameId, round.round, challenge?.startedAt, player.id);
  const gameOver = shattered || finished;

  const toLocalPoint = (clientX, clientY) => {
    const rect = svgRef.current.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * VIEW_SIZE,
      y: ((clientY - rect.top) / rect.height) * VIEW_SIZE,
    };
  };

  const onPointerDown = (e) => {
    if (gameOver) return;
    const p = toLocalPoint(e.clientX, e.clientY);
    // Must actually start AT the seal's marked starting point, not
    // anywhere on the board — same as needing to place the stylus
    // precisely before you can begin carving at all.
    if (Math.hypot(p.x - points[0].x, p.y - points[0].y) > CAPTURE_RADIUS_PX) return;
    setDragging(true);
  };

  const onPointerMove = (e) => {
    if (!dragging || gameOver) return;
    const p = toLocalPoint(e.clientX, e.clientY);
    const from = points[targetIndex - 1];
    const to = points[targetIndex % points.length];
    const dist = distanceToSegment(p.x, p.y, from.x, from.y, to.x, to.y);

    if (dist > TOLERANCE_PX) {
      if (!wasOffPath) {
        setWasOffPath(true);
        setCracks((c) => {
          const next = c + 1;
          if (next >= MAX_CRACKS) setShattered(true);
          return next;
        });
      }
    } else {
      setWasOffPath(false);
    }

    setTracedPath((prev) => [...prev, p]);

    if (Math.hypot(p.x - to.x, p.y - to.y) <= CAPTURE_RADIUS_PX) {
      if (targetIndex >= points.length) {
        setFinished(true);
        setDragging(false);
      } else {
        setTargetIndex((i) => i + 1);
      }
    }
  };

  // Lifting the stylus before the whole outline is done breaks the seal
  // — same real tension as the physical version needing continuous,
  // unbroken contact the whole way through.
  const onPointerUp = () => {
    if (!dragging || gameOver) return;
    setDragging(false);
    setShattered(true);
  };

  useEffect(() => {
    if (!startTime || reported.current) return;
    if (gameOver) {
      reported.current = true;
      reportScore(gameId, round.round, player.id, player.name, placementFor(finished, Date.now() - startTime, targetIndex - 1), { final: true });
    }
  }, [gameOver, startTime]); // eslint-disable-line react-hooks/exhaustive-deps

  if (gameOver) {
    return (
      <GameResultCard
        icon={finished ? "🏺" : "💥"}
        title={finished ? "Seal Carved!" : "The Tablet Shattered"}
        valueLabel={finished ? `${((Date.now() - startTime) / 1000).toFixed(2)}s` : `${targetIndex - 1} of ${points.length} points reached`}
      />
    );
  }
  if (!startTime) {
    return <Card style={{ marginBottom: 20, textAlign: "center" }}><p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic" }}>Loading...</p></Card>;
  }

  const pathD = `M ${points.map((p) => `${p.x},${p.y}`).join(" L ")} Z`;
  const tracedD = tracedPath.length > 1 ? `M ${tracedPath.map((p) => `${p.x},${p.y}`).join(" L ")}` : "";

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🏺 The Oracle's Seal</h3>
        <Badge>💥 {cracks}/{MAX_CRACKS}</Badge>
      </div>
      <p style={{ color: "#6b4f99", fontSize: 11, margin: "0 0 8px", fontStyle: "italic" }}>
        {dragging ? "Trace the outline carefully — don't stray, and don't lift until it's done." : `Press and hold on the ${shape.name.toLowerCase()}'s starting point to begin.`}
      </p>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`}
        style={{ width: "100%", maxWidth: 300, touchAction: "none", background: "#0d0618", border: "2px solid #3d1f5c", borderRadius: 8 }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <path d={pathD} fill="none" stroke="#3d1f5c" strokeWidth={TOLERANCE_PX * 2} strokeLinejoin="round" opacity={0.35} />
        <path d={pathD} fill="none" stroke="#6b4f99" strokeWidth={2} strokeDasharray="4,4" />
        {tracedD && <path d={tracedD} fill="none" stroke="#ff2d95" strokeWidth={3} strokeLinecap="round" />}
        <circle cx={points[0].x} cy={points[0].y} r={8} fill={dragging ? "#00ff9d" : "#ff2d95"} />
        {targetIndex <= points.length && (
          <circle cx={points[targetIndex % points.length].x} cy={points[targetIndex % points.length].y} r={CAPTURE_RADIUS_PX} fill="rgba(0,255,157,0.15)" stroke="#00ff9d" strokeWidth={1} />
        )}
      </svg>
    </Card>
  );
}
