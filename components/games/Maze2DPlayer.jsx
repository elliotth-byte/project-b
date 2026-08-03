import { useState, useEffect, useCallback, useRef } from "react";
import { Card } from "../ui";
import GameResultCard from "./GameResultCard";
import { reportScore } from "../../lib/challengeScores";

const SIZE = 11; // odd, so walls line up cleanly

// Recursive-backtracker maze generator on an odd-sized grid — 1 = wall, 0 = open.
function generateMaze(seed) {
  let s = seed;
  const rand = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(1));
  const cellAt = (r, c) => r > 0 && r < SIZE - 1 && c > 0 && c < SIZE - 1;

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
  grid[SIZE - 2][SIZE - 2] = 0;
  return grid;
}

export default function Maze2DPlayer({ gameId, round, challenge, player }) {
  const seed = (challenge?.startedAt || 1) + (player?.id ? player.id.split("-")[0].length : 0);
  const [maze] = useState(() => generateMaze(seed || 1));
  const [pos, setPos] = useState({ r: 1, c: 1 });
  const [startTime] = useState(() => Date.now());
  const [finishMs, setFinishMs] = useState(null);
  const goal = { r: SIZE - 2, c: SIZE - 2 };
  const reported = useRef(false);

  const move = useCallback((dr, dc) => {
    setPos((prev) => {
      if (finishMs) return prev;
      const nr = prev.r + dr, nc = prev.c + dc;
      if (nr < 0 || nc < 0 || nr >= SIZE || nc >= SIZE || maze[nr][nc] === 1) return prev;
      return { r: nr, c: nc };
    });
  }, [maze, finishMs]);

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
    if (pos.r === goal.r && pos.c === goal.c && !reported.current) {
      reported.current = true;
      const time = Date.now() - startTime;
      setFinishMs(time);
      reportScore(gameId, round.round, player.id, player.name, time, { final: true });
    }
  }, [pos]); // eslint-disable-line react-hooks/exhaustive-deps

  if (finishMs) {
    return <GameResultCard icon="🧩" title="Maze Solved" valueLabel={`${(finishMs / 1000).toFixed(2)}s`} />;
  }

  const cell = 24;

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <h3 style={{ color: "#ff2d95", margin: "0 0 8px", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🧩 2D Maze</h3>
      <div style={{
        display: "grid", gridTemplateColumns: `repeat(${SIZE}, ${cell}px)`, gridTemplateRows: `repeat(${SIZE}, ${cell}px)`,
        margin: "0 auto 12px", border: "2px solid #3d1f5c", width: "fit-content", background: "#0d0618",
      }}>
        {maze.map((row, r) => row.map((wall, c) => {
          const isPlayer = pos.r === r && pos.c === c;
          const isGoal = goal.r === r && goal.c === c;
          return (
            <div key={`${r}-${c}`} style={{
              width: cell, height: cell,
              background: wall ? "#3d1f5c" : isPlayer ? "#ff2d95" : isGoal ? "#00ff9d" : "#0d0618",
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
