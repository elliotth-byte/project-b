import { useState, useEffect, useRef, useMemo } from "react";
import { Card, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { useCountdown } from "./useCountdown";
import { usePersistedStart } from "./usePersistedStart";
import { reportScore } from "../../lib/challengeScores";
import {
  GRID, generateMaze, wallSegments, bfsDistances, progressForCell, cellAt,
  INK, CLAY, WEAVE_DARK, WEAVE_LIGHT, WALL_THICKNESS_RATIO, BALL_RADIUS_RATIO, GOAL_RADIUS_RATIO,
} from "../../lib/games/minotaurMazeData";

const FINISH_BASE = 100000000000; // same finish-tier trick as SlidingPuzzlePlayer.jsx/LifesTapestryPlayer.jsx — always beats anyone who didn't escape, faster escapes score higher within the tier.
const CANVAS_PX = 300; // overall board size in CSS px — same scale as StackPlayer.jsx's canvas (300x380)
const CELL_PX = CANVAS_PX / GRID;
const WALL_THICK_PX = Math.max(3, CELL_PX * WALL_THICKNESS_RATIO);
const BALL_RADIUS_PX = CELL_PX * BALL_RADIUS_RATIO;
const GOAL_RADIUS_PX = CELL_PX * GOAL_RADIUS_RATIO;

// Physics tuning. Substepping (see the RAF loop below) is what actually
// keeps the ball from tunneling through walls at a dropped frame rate —
// these numbers are picked so a single substep's max travel distance
// (MAX_SPEED_PX_S / SUBSTEPS_PER_FRAME at a generous 1/30s frame) stays
// comfortably under one wall's own thickness.
const ACCEL_PX_S2 = 1100;
const MAX_SPEED_PX_S = 230;
const FRICTION_PER_SEC = 0.28; // velocity multiplier remaining after 1 full second with no input
const SUBSTEPS_PER_FRAME = 5;
const MAX_FRAME_DT = 1 / 20; // clamp a slow/backgrounded frame's dt so it can't fling the ball across the board in one jump
const TILT_DEADZONE_DEG = 2;
const TILT_MAX_DEG = 40; // tilt beyond this is just "full speed", not a bigger push
const PROGRESS_REPORT_MS = 500;

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// Resolves a circle (ball) against one axis-aligned wall segment treated
// as a thin rectangle (segment length x WALL_THICK_PX). Mutates and
// returns the corrected {x,y,vx,vy}. Doesn't need to be physically
// perfect — see the file header in minotaurMazeData.js — just needs to
// stop the ball at the wall and kill the velocity component driving it
// into the wall, so it feels controllable rather than sticky or bouncy.
function resolveWall(x, y, vx, vy, seg, radius) {
  const halfT = WALL_THICK_PX / 2;
  const left = Math.min(seg.x1, seg.x2) - halfT;
  const right = Math.max(seg.x1, seg.x2) + halfT;
  const top = Math.min(seg.y1, seg.y2) - halfT;
  const bottom = Math.max(seg.y1, seg.y2) + halfT;

  const closestX = clamp(x, left, right);
  const closestY = clamp(y, top, bottom);
  const dx = x - closestX;
  const dy = y - closestY;
  const distSq = dx * dx + dy * dy;
  if (distSq >= radius * radius) return { x, y, vx, vy };

  const dist = Math.sqrt(distSq) || 0.0001;
  const nx = dx / dist, ny = dy / dist;
  const overlap = radius - dist;
  const newX = x + nx * overlap;
  const newY = y + ny * overlap;

  const vDotN = vx * nx + vy * ny;
  const newVx = vDotN < 0 ? vx - vDotN * nx : vx;
  const newVy = vDotN < 0 ? vy - vDotN * ny : vy;
  return { x: newX, y: newY, vx: newVx, vy: newVy };
}

// Builds the static maze artwork ONCE per maze (walls don't move) onto an
// offscreen canvas, in the app's established black-figure pottery style
// (see lifesTapestryData.js's own header comment for the full reasoning
// on INK/CLAY roles) — a diagonal woven-clay background, INK linework
// walls, a CLAY start roundel, and an INK/CLAY labrys marking the exit.
// The main render loop just drawImage()s this every frame instead of
// re-stroking ~200 wall segments at 60fps.
function buildBoardArt(maze, segmentsPx) {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_PX;
  canvas.height = CANVAS_PX;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = WEAVE_DARK;
  ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);
  ctx.strokeStyle = WEAVE_LIGHT;
  ctx.lineWidth = 5;
  for (let i = -CANVAS_PX; i < CANVAS_PX * 2; i += 11) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + CANVAS_PX, CANVAS_PX);
    ctx.stroke();
  }

  // Start roundel
  const startCx = CELL_PX * 0.5, startCy = CELL_PX * 0.5;
  ctx.beginPath();
  ctx.arc(startCx, startCy, CELL_PX * 0.3, 0, Math.PI * 2);
  ctx.fillStyle = CLAY;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.stroke();

  // Exit: a labrys (double-axe) glyph — INK haft, CLAY axe-heads with an
  // INK outline, the same "CLAY detail on an INK silhouette" convention
  // lifesTapestryData.js's own figures use.
  const gx = (GRID - 0.5) * CELL_PX, gy = (GRID - 0.5) * CELL_PX;
  const r = GOAL_RADIUS_PX;
  ctx.save();
  ctx.translate(gx, gy);
  ctx.fillStyle = INK;
  ctx.fillRect(-r * 0.09, -r * 0.95, r * 0.18, r * 1.9);
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.15);
  ctx.quadraticCurveTo(-r * 1.05, -r * 0.85, -r * 0.95, -r * 0.05);
  ctx.quadraticCurveTo(-r * 0.55, r * 0.1, 0, -r * 0.15);
  ctx.moveTo(0, r * 0.15);
  ctx.quadraticCurveTo(r * 1.05, r * 0.85, r * 0.95, r * 0.05);
  ctx.quadraticCurveTo(r * 0.55, -r * 0.1, 0, r * 0.15);
  ctx.fillStyle = CLAY;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.restore();

  // Walls last, on top of everything else.
  ctx.strokeStyle = INK;
  ctx.lineWidth = WALL_THICK_PX;
  ctx.lineCap = "square";
  segmentsPx.forEach((seg) => {
    ctx.beginPath();
    ctx.moveTo(seg.x1, seg.y1);
    ctx.lineTo(seg.x2, seg.y2);
    ctx.stroke();
  });

  return canvas;
}

export default function MinotaurMazePlayer({ gameId, challenge, round, player }) {
  // Deliberately seeded off THIS player's own persisted start timestamp,
  // not the shared challenge.startedAt — see minotaurMazeData.js's own
  // header comment for why every player gets their own maze here, unlike
  // Sliding Puzzle/Life's a Tapestry's identical-for-everyone scrambles.
  const myStartTime = usePersistedStart(gameId, round.round, challenge?.startedAt, player.id);
  const { timeUp } = useCountdown(challenge?.endsAt);

  const maze = useMemo(() => generateMaze(myStartTime || 1), [myStartTime]);
  const distances = useMemo(() => bfsDistances(maze), [maze]);
  const maxDist = distances[maze.start[0]][maze.start[1]];
  const segmentsPx = useMemo(
    () => wallSegments(maze).map((s) => ({ x1: s.x1 * CELL_PX, y1: s.y1 * CELL_PX, x2: s.x2 * CELL_PX, y2: s.y2 * CELL_PX })),
    [maze]
  );
  const goalPx = useMemo(() => ({ x: (maze.goal[1] + 0.5) * CELL_PX, y: (maze.goal[0] + 0.5) * CELL_PX }), [maze]);

  const canvasRef = useRef(null);
  const boardArtRef = useRef(null);
  const posRef = useRef({ x: CELL_PX * 0.5, y: CELL_PX * 0.5 });
  const velRef = useRef({ x: 0, y: 0 });
  const gravityRef = useRef({ x: 0, y: 0 }); // gyro-derived unit-ish vector, written by handleOrientation
  const heldRef = useRef({ up: false, down: false, left: false, right: false }); // manual fallback buttons
  const baselineRef = useRef(null); // {beta, gamma} captured on the first real orientation event — tilt is measured relative to however the player is already holding their phone
  const gotEventRef = useRef(false);
  const rafRef = useRef(null);
  const lastFrameRef = useRef(null);
  const lastProgressReportRef = useRef(0);
  const bestProgressRef = useRef(0);
  const doneRef = useRef(false);
  const reportedRef = useRef(false);

  const [started, setStarted] = useState(false);
  const [controlMode, setControlMode] = useState("pending"); // "pending" | "gyro" | "manual"
  const controlModeRef = useRef("pending");
  const [done, setDone] = useState(false);
  const [result, setResult] = useState(null); // { escaped: bool, finishedMs, progress }
  const [, forceTick] = useState(0);

  useEffect(() => { controlModeRef.current = controlMode; }, [controlMode]);

  // Rebuild the ball's starting position and the cached board art
  // whenever the maze itself changes (i.e. once, when myStartTime first
  // resolves).
  useEffect(() => {
    posRef.current = { x: CELL_PX * 0.5, y: CELL_PX * 0.5 };
    velRef.current = { x: 0, y: 0 };
    boardArtRef.current = buildBoardArt(maze, segmentsPx);
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (ctx && boardArtRef.current) {
      ctx.drawImage(boardArtRef.current, 0, 0);
      drawBall(ctx);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maze, segmentsPx]);

  function drawBall(ctx) {
    const { x, y } = posRef.current;
    ctx.beginPath();
    ctx.arc(x, y, BALL_RADIUS_PX, 0, Math.PI * 2);
    ctx.fillStyle = CLAY;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = INK;
    ctx.stroke();
  }

  function activateManual() {
    if (controlModeRef.current === "manual") return;
    controlModeRef.current = "manual";
    setControlMode("manual");
  }

  function handleOrientation(e) {
    if (e.beta == null || e.gamma == null) return;
    gotEventRef.current = true;
    if (!baselineRef.current) baselineRef.current = { beta: e.beta, gamma: e.gamma };
    const dGamma = e.gamma - baselineRef.current.gamma; // left/right tilt
    const dBeta = e.beta - baselineRef.current.beta; // front/back tilt
    const dz = (v) => {
      const a = Math.abs(v) < TILT_DEADZONE_DEG ? 0 : v;
      return clamp(a, -TILT_MAX_DEG, TILT_MAX_DEG) / TILT_MAX_DEG;
    };
    gravityRef.current = { x: dz(dGamma), y: dz(dBeta) };
    if (controlModeRef.current !== "gyro") { controlModeRef.current = "gyro"; setControlMode("gyro"); }
  }

  function beginGyroControls() {
    window.addEventListener("deviceorientation", handleOrientation);
    // If no real orientation event shows up within 1.5s of attaching the
    // listener — no gyro hardware, a browser that silently no-ops the
    // API, whatever — fall back to the on-screen buttons automatically
    // rather than leaving the player stuck with dead controls. Detected
    // on ACTUAL EVENT ARRIVAL, not just feature detection, per the spec:
    // some devices pass the `typeof` check but never actually fire.
    window.setTimeout(() => { if (!gotEventRef.current) activateManual(); }, 1500);
  }

  const handleStart = () => {
    if (started) return;
    setStarted(true);
    lastFrameRef.current = null;
    const DOE = typeof window !== "undefined" ? window.DeviceOrientationEvent : undefined;
    if (DOE && typeof DOE.requestPermission === "function") {
      // iOS 13+: must be called from a real user-gesture handler (this
      // button's onClick) — can't be deferred into an effect.
      DOE.requestPermission()
        .then((res) => { if (res === "granted") beginGyroControls(); else activateManual(); })
        .catch(() => activateManual());
    } else if (DOE) {
      beginGyroControls();
    } else {
      activateManual(); // no DeviceOrientationEvent support at all
    }
  };

  useEffect(() => () => window.removeEventListener("deviceorientation", handleOrientation), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Main physics + render loop.
  useEffect(() => {
    if (!started || done || timeUp) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");

    const finish = () => {
      if (doneRef.current) return;
      doneRef.current = true;
      const finishedMs = Math.max(0, Date.now() - (myStartTime || Date.now()));
      setResult({ escaped: true, finishedMs });
      setDone(true);
    };

    const loop = (now) => {
      if (lastFrameRef.current == null) lastFrameRef.current = now;
      const dt = Math.min(MAX_FRAME_DT, (now - lastFrameRef.current) / 1000);
      lastFrameRef.current = now;

      const cm = controlModeRef.current;
      let gx = 0, gy = 0;
      if (cm === "gyro") {
        gx = gravityRef.current.x; gy = gravityRef.current.y;
      } else if (cm === "manual") {
        const h = heldRef.current;
        gx = (h.right ? 1 : 0) - (h.left ? 1 : 0);
        gy = (h.down ? 1 : 0) - (h.up ? 1 : 0);
        if (gx && gy) { gx *= 0.7071; gy *= 0.7071; }
      }

      const dtSub = dt / SUBSTEPS_PER_FRAME;
      let { x, y } = posRef.current;
      let { x: vx, y: vy } = velRef.current;

      for (let i = 0; i < SUBSTEPS_PER_FRAME; i++) {
        vx += gx * ACCEL_PX_S2 * dtSub;
        vy += gy * ACCEL_PX_S2 * dtSub;
        const speed = Math.hypot(vx, vy);
        if (speed > MAX_SPEED_PX_S) { vx = (vx / speed) * MAX_SPEED_PX_S; vy = (vy / speed) * MAX_SPEED_PX_S; }

        x += vx * dtSub;
        y += vy * dtSub;

        for (const seg of segmentsPx) {
          const resolved = resolveWall(x, y, vx, vy, seg, BALL_RADIUS_PX);
          x = resolved.x; y = resolved.y; vx = resolved.vx; vy = resolved.vy;
        }

        x = clamp(x, BALL_RADIUS_PX, CANVAS_PX - BALL_RADIUS_PX);
        y = clamp(y, BALL_RADIUS_PX, CANVAS_PX - BALL_RADIUS_PX);

        const frictionFactor = Math.pow(FRICTION_PER_SEC, dtSub);
        vx *= frictionFactor; vy *= frictionFactor;
      }

      posRef.current = { x, y };
      velRef.current = { x: vx, y: vy };

      if (ctx && boardArtRef.current) {
        ctx.drawImage(boardArtRef.current, 0, 0);
        drawBall(ctx);
      }

      if (Math.hypot(x - goalPx.x, y - goalPx.y) < BALL_RADIUS_PX * 0.6 + GOAL_RADIUS_PX * 0.35) {
        finish();
        rafRef.current = null;
        return;
      }

      if (now - lastProgressReportRef.current > PROGRESS_REPORT_MS) {
        lastProgressReportRef.current = now;
        const { r, c } = cellAt(x, y, maze.size, CELL_PX);
        const progress = progressForCell(distances, maxDist, r, c);
        bestProgressRef.current = Math.max(bestProgressRef.current, progress);
        reportScore(gameId, round.round, player.id, player.name, bestProgressRef.current, { final: false });
        forceTick((t) => t + 1); // refresh the on-screen progress readout
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, done, timeUp, maze, segmentsPx, distances, maxDist, goalPx]);

  // Time's up without escaping — stop and lock in whatever progress was made.
  useEffect(() => {
    if (timeUp && !doneRef.current) {
      doneRef.current = true;
      setResult({ escaped: false, progress: bestProgressRef.current });
      setDone(true);
    }
  }, [timeUp]);

  useEffect(() => {
    if (!done || reportedRef.current || !result) return;
    reportedRef.current = true;
    // Math.max floors above maxDist (the highest possible non-finish
    // progress score) — same reasoning as SlidingPuzzlePlayer.jsx's
    // identical fix: an escapee's score must always outrank anyone who
    // merely got close.
    const value = result.escaped ? Math.max(maxDist + 1, FINISH_BASE - result.finishedMs) : bestProgressRef.current;
    reportScore(gameId, round.round, player.id, player.name, value, { final: true });
  }, [done]); // eslint-disable-line react-hooks/exhaustive-deps

  const elapsedSec = myStartTime ? (Math.max(0, Date.now() - myStartTime) / 1000).toFixed(1) : "0.0";
  const currentCell = cellAt(posRef.current.x, posRef.current.y, maze.size, CELL_PX);
  const currentProgress = progressForCell(distances, maxDist, currentCell.r, currentCell.c);

  if (done && result) {
    return result.escaped
      ? <GameResultCard icon="🪓" title="Escaped the Labyrinth!" valueLabel={`${(result.finishedMs / 1000).toFixed(1)}s`} />
      : <GameResultCard icon="🐂" title="The Minotaur Caught You" valueLabel={`${bestProgressRef.current}/${maxDist} cells to freedom`} />;
  }

  if (!myStartTime) {
    return <Card style={{ marginBottom: 20, textAlign: "center" }}><p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic" }}>Loading...</p></Card>;
  }

  const heldBtn = (dir) => ({
    onPointerDown: (e) => { e.preventDefault(); heldRef.current[dir] = true; },
    onPointerUp: (e) => { e.preventDefault(); heldRef.current[dir] = false; },
    onPointerLeave: () => { heldRef.current[dir] = false; },
    onPointerCancel: () => { heldRef.current[dir] = false; },
  });
  const dpadBtnStyle = {
    width: 52, height: 52, display: "flex", alignItems: "center", justifyContent: "center",
    background: "linear-gradient(160deg, #3a2013, #1a0f08)", border: `2px solid ${CLAY}`, borderRadius: 8,
    color: CLAY, fontSize: 20, cursor: "pointer", touchAction: "none", userSelect: "none",
  };

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🐂 The Labyrinth of the Minotaur</h3>
        <Badge>{elapsedSec}s · {currentProgress}/{maxDist}</Badge>
      </div>

      {!started ? (
        <>
          <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 14px", fontStyle: "italic" }}>
            Tilt your phone to roll the ball from the clay roundel to the labrys before the Minotaur finds you. If your
            device has no motion sensors (or you decline the prompt), on-screen buttons take over automatically.
          </p>
          <button
            onClick={handleStart}
            style={{
              padding: "12px 22px", borderRadius: 10, fontSize: 13, fontWeight: 800, textTransform: "uppercase",
              letterSpacing: 0.8, cursor: "pointer", fontFamily: "'Orbitron', 'Segoe UI', sans-serif",
              background: "linear-gradient(135deg, #ff2d95, #b829ff)", color: "#05010f", border: "2px solid #ff8ac2",
            }}
          >
            🐂 Enter the Labyrinth
          </button>
        </>
      ) : (
        <>
          <p style={{ color: "#6b4f99", fontSize: 11, margin: "0 0 10px", fontStyle: "italic" }}>
            {controlMode === "gyro" && "Tilt your phone to roll the ball."}
            {controlMode === "manual" && "No motion sensor detected — hold a direction below."}
            {controlMode === "pending" && "Calibrating controls..."}
          </p>
          <div style={{ position: "relative", width: "100%", maxWidth: CANVAS_PX, margin: "0 auto" }}>
            <canvas
              ref={canvasRef} width={CANVAS_PX} height={CANVAS_PX}
              style={{ width: "100%", maxWidth: CANVAS_PX, height: "auto", borderRadius: 6, border: `3px solid ${INK}`, boxShadow: `0 0 0 2px ${CLAY}`, display: "block", touchAction: "none" }}
            />
          </div>
          {controlMode === "manual" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 52px)", gridTemplateRows: "repeat(3, 52px)", gap: 6, justifyContent: "center", margin: "14px auto 0" }}>
              <div /><button style={dpadBtnStyle} {...heldBtn("up")}>⬆</button><div />
              <button style={dpadBtnStyle} {...heldBtn("left")}>⬅</button><div /><button style={dpadBtnStyle} {...heldBtn("right")}>➡</button>
              <div /><button style={dpadBtnStyle} {...heldBtn("down")}>⬇</button><div />
            </div>
          )}
        </>
      )}
    </Card>
  );
}
