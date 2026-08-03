import { useState, useEffect, useRef } from "react";
import { Card, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { useCountdown } from "./useCountdown";
import { reportScore } from "../../lib/challengeScores";

const SIZE = 6;
const GEMS = ["💎", "🔷", "🔶", "🟣", "🟢"];

function randomGrid() {
  return Array.from({ length: SIZE * SIZE }, () => Math.floor(Math.random() * GEMS.length));
}

function findMatches(grid) {
  const matched = new Set();
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE - 2; c++) {
      const i = r * SIZE + c;
      const v = grid[i];
      if (v != null && v === grid[i + 1] && v === grid[i + 2]) { matched.add(i); matched.add(i + 1); matched.add(i + 2); }
    }
  }
  for (let c = 0; c < SIZE; c++) {
    for (let r = 0; r < SIZE - 2; r++) {
      const i = r * SIZE + c;
      const v = grid[i];
      if (v != null && v === grid[i + SIZE] && v === grid[i + 2 * SIZE]) { matched.add(i); matched.add(i + SIZE); matched.add(i + 2 * SIZE); }
    }
  }
  return matched;
}

function resolveGrid(grid, onScore) {
  let g = [...grid];
  let totalCleared = 0;
  for (let guard = 0; guard < 20; guard++) {
    const matched = findMatches(g);
    if (matched.size === 0) break;
    totalCleared += matched.size;
    matched.forEach((i) => (g[i] = null));
    for (let c = 0; c < SIZE; c++) {
      const col = [];
      for (let r = SIZE - 1; r >= 0; r--) { const v = g[r * SIZE + c]; if (v != null) col.push(v); }
      while (col.length < SIZE) col.push(Math.floor(Math.random() * GEMS.length));
      for (let r = SIZE - 1; r >= 0; r--) g[r * SIZE + c] = col[SIZE - 1 - r];
    }
  }
  return { grid: g, cleared: totalCleared };
}

export default function Match3Player({ gameId, round, challenge, player }) {
  const { timeUp } = useCountdown(challenge?.endsAt);
  const [grid, setGrid] = useState(() => {
    let g = randomGrid();
    while (findMatches(g).size > 0) g = randomGrid();
    return g;
  });
  const [score, setScore] = useState(0);
  const [selected, setSelected] = useState(null);
  const [done, setDone] = useState(false);
  const reportedRef = useRef(false);

  useEffect(() => {
    reportScore(gameId, round.round, player.id, player.name, score, { final: false });
  }, [score]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (timeUp && !reportedRef.current) {
      reportedRef.current = true;
      setDone(true);
      reportScore(gameId, round.round, player.id, player.name, score, { final: true });
    }
  }, [timeUp]); // eslint-disable-line react-hooks/exhaustive-deps

  const areAdjacent = (a, b) => {
    const ar = Math.floor(a / SIZE), ac = a % SIZE, br = Math.floor(b / SIZE), bc = b % SIZE;
    return (ar === br && Math.abs(ac - bc) === 1) || (ac === bc && Math.abs(ar - br) === 1);
  };

  const clickTile = (i) => {
    if (done) return;
    if (selected === null) { setSelected(i); return; }
    if (selected === i) { setSelected(null); return; }
    if (!areAdjacent(selected, i)) { setSelected(i); return; }

    const swapped = [...grid];
    [swapped[selected], swapped[i]] = [swapped[i], swapped[selected]];
    const matched = findMatches(swapped);
    setSelected(null);
    if (matched.size === 0) return; // invalid swap, no match — snap back (no-op, grid unchanged)

    const { grid: resolved, cleared } = resolveGrid(swapped);
    setGrid(resolved);
    setScore((s) => s + cleared * 10);
  };

  if (done) return <GameResultCard icon="💎" title="Time's Up" valueLabel={`${score} points`} />;

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>💎 Match 3</h3>
        <Badge>{score} pts</Badge>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${SIZE}, 42px)`, gap: 3, margin: "0 auto", width: "fit-content" }}>
        {grid.map((v, i) => (
          <button key={i} onClick={() => clickTile(i)} style={{
            width: 42, height: 42, fontSize: 22, borderRadius: 6, cursor: "pointer",
            background: selected === i ? "rgba(255,45,149,0.25)" : "#0d0618",
            border: `2px solid ${selected === i ? "#ff2d95" : "#3d1f5c"}`,
          }}>{GEMS[v]}</button>
        ))}
      </div>
      <p style={{ color: "#6b4f99", fontSize: 11, marginTop: 8, fontStyle: "italic" }}>Tap two adjacent gems to swap them.</p>
    </Card>
  );
}
