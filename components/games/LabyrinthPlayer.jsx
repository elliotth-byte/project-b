import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Card, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { reportScore } from "../../lib/challengeScores";
import { usePersistedStart } from "./usePersistedStart";
import { useSwipeControls } from "../../lib/games/useSwipeControls";
import DPad from "./DPad";
import SwipeControlsCallout from "./SwipeControlsCallout";

// ─── The Labyrinth ───
// An original take on "collect items in a maze while something hunts
// you" — not a reproduction of any specific copyrighted maze-chase
// character, maze layout, or visual style. Fits this app's own Greek
// mythology theme directly: the Minotaur, a genuinely ancient,
// public-domain mythological figure (the Labyrinth itself is the myth
// this game is named for), hunts the player through the maze while they
// collect scattered olives.
//
// The maze itself is now ONE fixed, hand-laid-out layout (see MAZE
// below) rather than randomly generated per session — deliberately
// symmetric, with a walled-off center box and wraparound side tunnels,
// evoking the classic arcade maze-chase LOOK without reproducing any
// specific game's actual layout. Every open cell except the player's
// start gets an olive; stepping onto one collects it.
//
// The Minotaur starts at the maze's far corner and takes one step every
// MINOTAUR_TICK_MS, via a fresh breadth-first shortest path toward the
// player's CURRENT position recalculated every single tick — it isn't
// following a stale plan, it's always reacting to wherever the player
// actually is right now. Genuinely real-time chase pressure, not a
// scripted or telegraphed patrol.
//
// Scoring: clearing every olive before being caught is the best
// possible outcome; short of that, more olives collected before capture
// (or before the challenge's own timer runs out) is strictly better —
// see placementFor below.

const MINOTAUR_TICK_MS = 650;

// ─── A fixed, hand-laid-out maze ───
// Replacing the earlier per-session recursive-backtracker generator
// with ONE deliberately-designed, always-the-same layout: wide
// symmetric corridors, a walled-off center box, and wraparound side
// tunnels — the general SHAPE conventions of a classic arcade
// maze-chase game, built as an original layout rather than a
// reproduction of any specific title's actual maze (still true to this
// file's own header comment above on why that distinction matters).
// Built by generating a recursive-backtracker maze on just the LEFT
// half and mirroring it onto the right (so it comes out symmetric
// left-to-right the way a hand-designed arcade maze would, rather than
// looking like the lopsided procedural mazes this game used to
// produce), then explicitly carving the center box and the two tunnel
// openings on top. Verified fully connected (every open cell reachable
// from every other one) before this ever went in — see this file's own
// git history for the generation script, not reproduced here since the
// point of fixing it in code is that it never needs to run again.
//
// Because this is now one committed layout instead of a per-challenge
// random generation, challenge?.gameConfig?.size no longer does
// anything — there's only the one size. Left as dead config rather
// than removed from wherever it's set, in case a genuinely resizable
// version of this comes back later.
const MAZE = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,1],
  [1,0,1,0,1,1,1,1,1,0,1,0,1,1,1,1,1,0,1,0,1],
  [1,0,1,0,0,0,0,0,1,0,0,0,1,0,0,0,0,0,1,0,1],
  [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1],
  [1,0,1,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0,1,0,1],
  [1,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,1],
  [0,0,0,0,0,0,0,0,1,1,1,1,1,0,0,0,0,0,0,0,0],
  [1,0,1,1,1,0,1,0,1,1,1,1,1,0,1,0,1,1,1,0,1],
  [1,0,0,0,1,0,1,0,0,0,0,0,0,0,1,0,1,0,0,0,1],
  [1,0,1,0,1,0,1,1,1,0,1,0,1,1,1,0,1,0,1,0,1],
  [1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,1],
  [1,0,1,1,1,1,1,0,1,0,1,0,1,0,1,1,1,1,1,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
];
// Row 7 (the one full-width open row, "........#####........" above)
// is the tunnel row — its own leftmost/rightmost cells are open all
// the way to the border, which is what move()/bfsNextStep below use as
// the signal that stepping off that edge should wrap to the other
// side, rather than needing a separate list of "which rows tunnel."
const TUNNEL_ROW = 7;

// One BFS step toward the target — returns the NEXT cell to move into
// (adjacent to `from`), or `from` unchanged if no path exists (shouldn't
// happen in a fully-carved maze, but handled honestly rather than
// crashing). Wraps horizontally at TUNNEL_ROW, same rule move() below
// uses, so the Minotaur can use the side tunnels exactly as freely as
// the player can — it isn't a player-only escape hatch.
function neighborsOf(r, c, rows, cols) {
  const raw = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
  return raw.map(([nr, nc]) => {
    if (r === TUNNEL_ROW) {
      if (nc < 0) nc = cols - 1;
      else if (nc >= cols) nc = 0;
    }
    return [nr, nc];
  }).filter(([nr, nc]) => nr >= 0 && nr < rows && nc >= 0 && nc < cols);
}

function bfsNextStep(grid, rows, cols, from, target) {
  if (from.r === target.r && from.c === target.c) return from;
  const key = (r, c) => `${r},${c}`;
  const visited = new Set([key(from.r, from.c)]);
  const cameFrom = {};
  const queue = [from];
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    if (cur.r === target.r && cur.c === target.c) break;
    for (const [nr, nc] of neighborsOf(cur.r, cur.c, rows, cols)) {
      if (grid[nr][nc] === 1) continue;
      const k = key(nr, nc);
      if (visited.has(k)) continue;
      visited.add(k);
      cameFrom[k] = cur;
      queue.push({ r: nr, c: nc });
    }
  }
  const targetKey = key(target.r, target.c);
  if (!visited.has(targetKey)) return from; // no path — shouldn't happen in a connected maze
  // Walk backward from target to from, one step at a time, to find the
  // FIRST step away from `from`.
  let step = { r: target.r, c: target.c };
  let prev = cameFrom[key(step.r, step.c)];
  if (!prev) return from; // target IS from — already handled above, but defensive
  while (prev && !(prev.r === from.r && prev.c === from.c)) {
    step = prev;
    prev = cameFrom[key(step.r, step.c)];
  }
  return step;
}

// Clearing every olive before capture is strictly the best possible
// outcome; short of that, more olives collected is strictly better.
function placementFor(didClear, olivesCollected) {
  if (didClear) return 100000;
  return olivesCollected;
}

export default function LabyrinthPlayer({ gameId, round, challenge, player }) {
  const maze = MAZE;
  const ROWS = maze.length;
  const COLS = maze[0].length;

  const [pos, setPos] = useState({ r: 1, c: 1 });
  const [minotaurPos, setMinotaurPos] = useState({ r: ROWS - 2, c: COLS - 2 });
  const posRef = useRef(pos); // the chase timer reads this fresh each tick without needing to be a dependency
  useEffect(() => { posRef.current = pos; }, [pos]);

  const [collected, setCollected] = useState(() => new Set());
  const totalOlives = useMemo(() => {
    let count = 0;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      if (maze[r][c] === 0 && !(r === 1 && c === 1)) count++;
    }
    return count;
  }, [maze, ROWS, COLS]);

  const startTime = usePersistedStart(gameId, round.round, challenge?.startedAt, player.id);
  const [caught, setCaught] = useState(false);
  const [cleared, setCleared] = useState(false);
  const reported = useRef(false);
  const gameOver = caught || cleared;

  // Horizontal wraparound only ever applies at TUNNEL_ROW — everywhere
  // else the outer border is a solid wall, so a would-be wrap target is
  // always a wall cell and gets blocked exactly like before this
  // existed; this is genuinely a no-op change in behavior for every
  // row except the one row it's meant for.
  const move = useCallback((dr, dc) => {
    setPos((prev) => {
      if (gameOver) return prev;
      const nr = prev.r + dr;
      let nc = prev.c + dc;
      if (prev.r === TUNNEL_ROW) {
        if (nc < 0) nc = COLS - 1;
        else if (nc >= COLS) nc = 0;
      }
      if (nr < 0 || nc < 0 || nr >= ROWS || nc >= COLS || maze[nr][nc] === 1) return prev;
      setCollected((c) => {
        const k = `${nr},${nc}`;
        if (c.has(k) || (nr === 1 && nc === 1)) return c;
        const next = new Set(c);
        next.add(k);
        return next;
      });
      return { r: nr, c: nc };
    });
  }, [maze, gameOver, ROWS, COLS]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowUp") move(-1, 0);
      else if (e.key === "ArrowDown") move(1, 0);
      else if (e.key === "ArrowLeft") move(0, -1);
      else if (e.key === "ArrowRight") move(0, 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move]);

  const [swipeOverride, setSwipeOverride] = useState(false); // true once turned on via the in-game callout this session, before player.gamePrefs itself has caught up
  const swipeEnabled = !!player?.gamePrefs?.swipeControls || swipeOverride;
  const swipeHandlers = useSwipeControls((dir) => {
    if (dir === "up") move(-1, 0);
    else if (dir === "down") move(1, 0);
    else if (dir === "left") move(0, -1);
    else move(0, 1);
  }, swipeEnabled);

  // The chase itself — recalculates a fresh shortest path toward
  // wherever the player currently is (via posRef, not a stale closure)
  // every single tick.
  useEffect(() => {
    if (gameOver) return;
    const interval = window.setInterval(() => {
      setMinotaurPos((prev) => {
        const next = bfsNextStep(maze, ROWS, COLS, prev, posRef.current);
        if (next.r === posRef.current.r && next.c === posRef.current.c) setCaught(true);
        return next;
      });
    }, MINOTAUR_TICK_MS);
    return () => window.clearInterval(interval);
  }, [maze, ROWS, COLS, gameOver]);

  // Also catch the case where the PLAYER moves directly onto the
  // Minotaur's current cell, rather than only the reverse.
  useEffect(() => {
    if (!gameOver && pos.r === minotaurPos.r && pos.c === minotaurPos.c) setCaught(true);
  }, [pos, minotaurPos, gameOver]);

  useEffect(() => {
    if (!gameOver && collected.size === totalOlives && totalOlives > 0) setCleared(true);
  }, [collected, totalOlives, gameOver]);

  useEffect(() => {
    if (!startTime || reported.current) return;
    if (gameOver) {
      reported.current = true;
      reportScore(gameId, round.round, player.id, player.name, placementFor(cleared, collected.size), { final: true });
    }
  }, [gameOver, startTime]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!startTime || gameOver) return;
    reportScore(gameId, round.round, player.id, player.name, placementFor(false, collected.size), { final: false });
  }, [collected.size]); // eslint-disable-line react-hooks/exhaustive-deps

  if (gameOver) {
    return (
      <GameResultCard
        icon={cleared ? "🏆" : "🐂"}
        title={cleared ? "Labyrinth Cleared!" : "Caught by the Minotaur"}
        valueLabel={cleared ? `All ${totalOlives} olives collected` : `${collected.size} of ${totalOlives} olives`}
      />
    );
  }
  if (!startTime) {
    return <Card style={{ marginBottom: 20, textAlign: "center" }}><p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic" }}>Loading...</p></Card>;
  }

  const cell = COLS <= 15 ? 22 : COLS <= 21 ? 17 : 12;

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🐂 The Labyrinth</h3>
        <Badge>🫒 {collected.size}/{totalOlives}</Badge>
      </div>
      <p style={{ color: "#6b4f99", fontSize: 11, margin: "0 0 8px", fontStyle: "italic" }}>The Minotaur is always coming for you — keep moving. The side passages wrap around.</p>
      {!swipeEnabled && <SwipeControlsCallout player={player} onEnabled={() => setSwipeOverride(true)} />}
      <div
        onTouchStart={swipeHandlers.onTouchStart} onTouchEnd={swipeHandlers.onTouchEnd}
        style={{
          display: "grid", gridTemplateColumns: `repeat(${COLS}, ${cell}px)`, gridTemplateRows: `repeat(${ROWS}, ${cell}px)`,
          margin: "0 auto 12px", border: "2px solid #3d1f5c", width: "fit-content", background: "#05010f",
          touchAction: swipeEnabled ? "none" : "auto",
        }}
      >
        {maze.map((row, r) => row.map((wall, c) => {
          const isPlayer = pos.r === r && pos.c === c;
          const isMinotaur = minotaurPos.r === r && minotaurPos.c === c;
          const isOlive = !wall && !(r === 1 && c === 1) && !collected.has(`${r},${c}`) && !isPlayer;
          const bg = wall ? "#3d1f5c" : isPlayer ? "#ff2d95" : isMinotaur ? "#ff3860" : "#0d0618";
          return (
            <div key={`${r}-${c}`} style={{
              width: cell, height: cell, background: bg, boxSizing: "border-box",
              fontSize: Math.min(cell, 16), lineHeight: `${cell}px`, border: "1px solid rgba(255,255,255,0.03)",
            }}>
              {isPlayer ? "🧍" : isMinotaur ? "🐂" : isOlive ? "🫒" : ""}
            </div>
          );
        }))}
      </div>
      <DPad onUp={() => move(-1, 0)} onDown={() => move(1, 0)} onLeft={() => move(0, -1)} onRight={() => move(0, 1)} />
      <p style={{ color: "#6b4f99", fontSize: 11, marginTop: 8, fontStyle: "italic" }}>
        Arrow keys work too.{swipeEnabled && " Or swipe on the board."}
      </p>
    </Card>
  );
}
