import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Card } from "../ui";
import GameResultCard from "./GameResultCard";
import { reportScore } from "../../lib/challengeScores";
import { usePersistedStart } from "./usePersistedStart";

const DEFAULT_SIZE = 11;

// Recursive-backtracker maze generator on an odd-sized grid — 1 = wall, 0 = open.
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
  grid[size - 2][size - 2] = 0;
  return grid;
}

export default function Maze2DPlayer({ gameId, round, challenge, player }) {
  // Host-configurable size, clamped to something odd (walls need to line
  // up) and sane (5..31).
  const SIZE = useMemo(() => {
    const raw = challenge?.gameConfig?.size || DEFAULT_SIZE;
    const clamped = Math.max(5, Math.min(31, raw));
    return clamped % 2 === 0 ? clamped + 1 : clamped;
  }, [challenge?.gameConfig?.size]);
  const seed = (challenge?.startedAt || 1) + (player?.id ? player.id.split("-")[0].length : 0);
  const [maze] = useState(() => generateMaze(seed || 1, SIZE));
  const [pos, setPos] = useState({ r: 1, c: 1 });
  // Fog of war: only cells the player has physically stood on are visible
  // (plus the goal, always). Everywhere else — wall or open path — is
  // rendered as unexplored fog until they get there.
  const [visited, setVisited] = useState(() => new Set(["1,1"]));
  // Persisted (not just local) so the elapsed-time score this reports
  // reflects genuine total time since this player's FIRST attempt this
  // round, not just time since their most recent remount.
  const startTime = usePersistedStart(gameId, round.round, player.id);
  const [finishMs, setFinishMs] = useState(null);
  const goal = { r: SIZE - 2, c: SIZE - 2 };
  const reported = useRef(false);

  const move = useCallback((dr, dc) => {
    setPos((prev) => {
      if (finishMs) return prev;
      const nr = prev.r + dr, nc = prev.c + dc;
      if (nr < 0 || nc < 0 || nr >= SIZE || nc >= SIZE || maze[nr][nc] === 1) return prev;
      setVisited((v) => {
        const key = `${nr},${nc}`;
        if (v.has(key)) return v;
        const next = new Set(v);
        next.add(key);
        return next;
      });
      return { r: nr, c: nc };
    });
  }, [maze, finishMs, SIZE]);

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

  useEffect(() => {
    if (!startTime) return;
    if (pos.r === goal.r && pos.c === goal.c && !reported.current) {
      reported.current = true;
      const time = Date.now() - startTime;
      setFinishMs(time);
      reportScore(gameId, round.round, player.id, player.name, time, { final: true });
    }
  }, [pos, startTime]); // eslint-disable-line react-hooks/exhaustive-deps

  if (finishMs) {
    return <GameResultCard icon="🧩" title="Maze Solved" valueLabel={`${(finishMs / 1000).toFixed(2)}s`} />;
  }
  if (!startTime) {
    return <Card style={{ marginBottom: 20, textAlign: "center" }}><p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic" }}>Loading...</p></Card>;
  }

  // Bigger mazes get smaller cells so the whole thing still fits comfortably.
  const cell = SIZE <= 11 ? 24 : SIZE <= 17 ? 18 : SIZE <= 23 ? 14 : 11;

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <h3 style={{ color: "#ff2d95", margin: "0 0 8px", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🧩 2D Maze</h3>
      <p style={{ color: "#6b4f99", fontSize: 11, margin: "0 0 8px", fontStyle: "italic" }}>Fog of war — only where you've walked is visible.</p>
      <div style={{
        display: "grid", gridTemplateColumns: `repeat(${SIZE}, ${cell}px)`, gridTemplateRows: `repeat(${SIZE}, ${cell}px)`,
        margin: "0 auto 12px", border: "2px solid #3d1f5c", width: "fit-content", background: "#05010f",
      }}>
        {maze.map((row, r) => row.map((wall, c) => {
          const isPlayer = pos.r === r && pos.c === c;
          const isGoal = goal.r === r && goal.c === c;
          const isVisited = visited.has(`${r},${c}`);
          const isKnown = isPlayer || isGoal || isVisited;
          const bg = !isKnown ? "#05010f" : wall ? "#3d1f5c" : isPlayer ? "#ff2d95" : isGoal ? "#00ff9d" : "#0d0618";
          return (
            <div key={`${r}-${c}`} style={{
              width: cell, height: cell, background: bg, boxSizing: "border-box",
              fontSize: Math.min(cell, 22), lineHeight: `${cell}px`,
              border: isKnown ? "1px solid rgba(255,255,255,0.03)" : "1px solid transparent",
            }}>
              {isPlayer ? "🧍" : isGoal ? "🚩" : ""}
            </div>
          );
        }))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "44px 44px 44px", gridTemplateRows: "44px 44px 44px", gap: 4, margin: "0 auto", width: "fit-content" }}>
        <div />
        <button onClick={() => move(-1, 0)} style={arrowStyle}>↑</button>
        <div />
        <button onClick={() => move(0, -1)} style={arrowStyle}>←</button>
        <div />
        <button onClick={() => move(0, 1)} style={arrowStyle}>→</button>
        <div />
        <button onClick={() => move(1, 0)} style={arrowStyle}>↓</button>
        <div />
      </div>
      <p style={{ color: "#6b4f99", fontSize: 11, marginTop: 8, fontStyle: "italic" }}>Arrow keys work too.</p>
    </Card>
  );
}

const arrowStyle = {
  width: 44, height: 44, borderRadius: 8, background: "#0d0618", border: "1px solid #3d1f5c",
  color: "#f5f0ff", fontSize: 18, cursor: "pointer",
};
