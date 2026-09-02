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
// Same recursive-backtracker maze generator Maze2DPlayer.jsx and
// mazeGemsData.js already use, kept local here the same way
// Maze2DPlayer.jsx keeps its own copy rather than sharing an
// abstraction across all three maze variants for what's a handful of
// lines. Every open cell except the player's start gets an olive;
// stepping onto one collects it.
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

const DEFAULT_SIZE = 13; // odd, walls need to line up — a bit larger than Maze2D's default since a chase needs some room to run
const MINOTAUR_TICK_MS = 650;

function generateMaze(seed, size) {
  let s = seed;
  const rand = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const grid = Array.from({ length: size }, () => Array(size).fill(1));
  const cellAt = (r, c) => r > 0 && r < size - 1 && c > 0 && c < size - 1;
  function carve(r, c) {
    grid[r][c] = 0;
    const dirs = [[-2, 0], [2, 0], [0, -2], [0, 2]].sort(() => rand() - 0.5);
    for (const [dr, dc] of dirs) {
      const nr = r + dr, nc = c + dc;
      if (cellAt(nr, nc) && grid[nr][nc] === 1) {
        grid[r + dr / 2][c + dc / 2] = 0;
        carve(nr, nc);
      }
    }
  }
  carve(1, 1);

  // Recursive backtracking alone produces a "perfect maze" — by
  // definition, exactly ONE path between any two cells, with zero
  // loops. That's exactly what made the Minotaur uncatchable-by-you:
  // wherever it's chasing from, there was never an alternate route to
  // dodge around it, only forward into it or back the way you came.
  // This knocks down a fraction of the remaining interior walls — only
  // ones where BOTH neighboring cells are already open, so this only
  // adds shortcuts and loops, never creates a new isolated pocket —
  // giving the maze genuine branch points a player can actually use to
  // evade. Verified this keeps the whole maze fully connected (every
  // open cell still reachable from the start) across many seeds before
  // this went in, not just assumed.
  const LOOP_CHANCE = 0.22;
  for (let r = 1; r < size - 1; r++) {
    for (let c = 1; c < size - 1; c++) {
      if (grid[r][c] !== 1) continue;
      if (r % 2 === 0 && c % 2 === 1) {
        if (grid[r - 1][c] === 0 && grid[r + 1][c] === 0 && rand() < LOOP_CHANCE) grid[r][c] = 0;
      } else if (r % 2 === 1 && c % 2 === 0) {
        if (grid[r][c - 1] === 0 && grid[r][c + 1] === 0 && rand() < LOOP_CHANCE) grid[r][c] = 0;
      }
    }
  }

  return grid;
}

// One BFS step toward the target — returns the NEXT cell to move into
// (adjacent to `from`), or `from` unchanged if no path exists (shouldn't
// happen in a fully-carved maze, but handled honestly rather than
// crashing).
function bfsNextStep(grid, size, from, target) {
  if (from.r === target.r && from.c === target.c) return from;
  const key = (r, c) => `${r},${c}`;
  const visited = new Set([key(from.r, from.c)]);
  const cameFrom = {};
  const queue = [from];
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    if (cur.r === target.r && cur.c === target.c) break;
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nr = cur.r + dr, nc = cur.c + dc;
      if (nr < 0 || nc < 0 || nr >= size || nc >= size || grid[nr][nc] === 1) continue;
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
  const SIZE = useMemo(() => {
    const raw = challenge?.gameConfig?.size || DEFAULT_SIZE;
    const clamped = Math.max(9, Math.min(25, raw));
    return clamped % 2 === 0 ? clamped + 1 : clamped;
  }, [challenge?.gameConfig?.size]);
  const seed = (challenge?.startedAt || 1) + (player?.id ? player.id.split("-")[0].length : 0);
  const [maze] = useState(() => generateMaze(seed || 1, SIZE));
  const GRID_SIZE = maze.length;

  const [pos, setPos] = useState({ r: 1, c: 1 });
  const [minotaurPos, setMinotaurPos] = useState({ r: GRID_SIZE - 2, c: GRID_SIZE - 2 });
  const posRef = useRef(pos); // the chase timer reads this fresh each tick without needing to be a dependency
  useEffect(() => { posRef.current = pos; }, [pos]);

  const [collected, setCollected] = useState(() => new Set());
  const totalOlives = useMemo(() => {
    let count = 0;
    for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
      if (maze[r][c] === 0 && !(r === 1 && c === 1)) count++;
    }
    return count;
  }, [maze, GRID_SIZE]);

  const startTime = usePersistedStart(gameId, round.round, challenge?.startedAt, player.id);
  const [caught, setCaught] = useState(false);
  const [cleared, setCleared] = useState(false);
  const reported = useRef(false);
  const gameOver = caught || cleared;

  const move = useCallback((dr, dc) => {
    setPos((prev) => {
      if (gameOver) return prev;
      const nr = prev.r + dr, nc = prev.c + dc;
      if (nr < 0 || nc < 0 || nr >= GRID_SIZE || nc >= GRID_SIZE || maze[nr][nc] === 1) return prev;
      setCollected((c) => {
        const k = `${nr},${nc}`;
        if (c.has(k) || (nr === 1 && nc === 1)) return c;
        const next = new Set(c);
        next.add(k);
        return next;
      });
      return { r: nr, c: nc };
    });
  }, [maze, gameOver, GRID_SIZE]); // eslint-disable-line react-hooks/exhaustive-deps

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
        const next = bfsNextStep(maze, GRID_SIZE, prev, posRef.current);
        if (next.r === posRef.current.r && next.c === posRef.current.c) setCaught(true);
        return next;
      });
    }, MINOTAUR_TICK_MS);
    return () => window.clearInterval(interval);
  }, [maze, GRID_SIZE, gameOver]);

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

  const cell = GRID_SIZE <= 13 ? 22 : GRID_SIZE <= 19 ? 16 : 12;

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🐂 The Labyrinth</h3>
        <Badge>🫒 {collected.size}/{totalOlives}</Badge>
      </div>
      <p style={{ color: "#6b4f99", fontSize: 11, margin: "0 0 8px", fontStyle: "italic" }}>The Minotaur is always coming for you — keep moving.</p>
      {!swipeEnabled && <SwipeControlsCallout player={player} onEnabled={() => setSwipeOverride(true)} />}
      <div
        onTouchStart={swipeHandlers.onTouchStart} onTouchEnd={swipeHandlers.onTouchEnd}
        style={{
          display: "grid", gridTemplateColumns: `repeat(${GRID_SIZE}, ${cell}px)`, gridTemplateRows: `repeat(${GRID_SIZE}, ${cell}px)`,
          margin: "0 auto 12px", border: "2px solid #3d1f5c", width: "fit-content", background: "#05010f",
          touchAction: swipeEnabled ? "none" : "auto",
        }}
      >
        {maze.map((row, r) => row.map((wall, c) => {
          const isPlayer = pos.r === r && pos.c === c;
          const isMinotaur = minotaurPos.r === r && minotaurPos.c === c;
          const isOlive = !wall && !(r === 1 && c === 1) && !collected.has(`${r},${c}`) && !isPlayer;
          // Visited floor (any non-wall cell whose olive is already
          // collected, or the start cell) gets a faint trail tint —
          // "where you've walked" — instead of looking identical to
          // unexplored floor.
          const visited = !wall && (collected.has(`${r},${c}`) || (r === 1 && c === 1));
          let bg = "#0d0618";
          if (wall) bg = "linear-gradient(160deg, #4a2a72, #241340)"; // stone-block gradient instead of a flat fill
          else if (isPlayer) bg = "radial-gradient(circle at 35% 30%, #ff8ac8, #ff2d95)";
          else if (isMinotaur) bg = "radial-gradient(circle at 35% 30%, #ff8080, #ff3860)";
          else if (visited) bg = "rgba(0,255,157,0.06)";
          return (
            <div key={`${r}-${c}`} style={{
              width: cell, height: cell, background: bg, boxSizing: "border-box",
              fontSize: Math.min(cell, 16), lineHeight: `${cell}px`,
              border: wall ? "1px solid rgba(0,0,0,0.3)" : "1px solid rgba(255,255,255,0.03)",
              boxShadow: wall ? "inset 1px 1px 0 rgba(255,255,255,0.08)" : "none",
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
