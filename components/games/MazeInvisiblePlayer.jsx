import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Card, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { reportScore } from "../../lib/challengeScores";
import { usePersistedStart } from "./usePersistedStart";
import { generateMazeWithGems } from "../../lib/games/mazeGemsData";
import { useSwipeControls } from "../../lib/games/useSwipeControls";
import DPad from "./DPad";

const DEFAULT_SIZE = 15;
const WALL_BUMP_PENALTY_MS = 1500;

// ─── Invisible Maze ───
// Same 5-gems-in-order objective as Trivia Maze, but the mechanic here is
// visibility itself: toggle between View mode (see the true maze layout,
// can't move) and Move mode (walls are invisible — you only see where
// you've actually already walked, plus the current target gem as a
// landmark — and bumping into an unseen wall costs real time). The clock
// never pauses either way, so memorizing in View mode is a genuine
// trade-off against just moving and eating the occasional penalty.
export default function MazeInvisiblePlayer({ gameId, round, challenge, player }) {
  const SIZE = useMemo(() => {
    const raw = challenge?.gameConfig?.size || DEFAULT_SIZE;
    const clamped = Math.max(9, Math.min(31, raw));
    return clamped % 2 === 0 ? clamped + 1 : clamped;
  }, [challenge?.gameConfig?.size]);
  const seed = (challenge?.startedAt || 1) + (player?.id ? player.id.split("-")[0].length : 0);
  const [{ grid, start, gems }] = useState(() => generateMazeWithGems(seed || 1, SIZE, 3));
  // Bounds/wall-checking below is deliberately derived from the grid
  // itself, not the SIZE memo above — SIZE is only ever the INPUT to
  // generation. If challenge hadn't fully loaded yet on this component's
  // very first render (a real possibility — challenge?.gameConfig?.size
  // could still be undefined at that moment), SIZE's memo could later
  // recompute to a different value once challenge actually arrives,
  // while the grid — generated once, already — stays whatever size it
  // was first built at. Using SIZE for bounds checks in that situation
  // meant every move could get checked against the WRONG grid
  // dimensions, which is exactly the kind of thing that would make
  // movement look like it's hitting walls that aren't really there.
  // Deriving it from grid.length instead makes that mismatch structurally
  // impossible.
  const GRID_SIZE = grid.length;
  const [pos, setPos] = useState(start);
  const [visited, setVisited] = useState(() => new Set([`${start.r},${start.c}`]));
  const [gemIndex, setGemIndex] = useState(0); // which gem (0-4) is the current target
  const [mode, setMode] = useState("move"); // "move" | "view"
  const [penaltyMs, setPenaltyMs] = useState(0);
  const [bumpFlash, setBumpFlash] = useState(false);
  const startTime = usePersistedStart(gameId, round.round, challenge?.startedAt, player.id);
  const [finishMs, setFinishMs] = useState(null);
  const reported = useRef(false);

  const target = gems[gemIndex];
  const allGemsDone = gemIndex >= gems.length;

  const move = useCallback((dr, dc) => {
    if (mode !== "move" || finishMs) return;
    setPos((prev) => {
      const nr = prev.r + dr, nc = prev.c + dc;
      if (nr < 0 || nc < 0 || nr >= GRID_SIZE || nc >= GRID_SIZE || grid[nr][nc] === 1) {
        setPenaltyMs((p) => p + WALL_BUMP_PENALTY_MS);
        setBumpFlash(true);
        window.setTimeout(() => setBumpFlash(false), 200);
        return prev;
      }
      setVisited((v) => { const next = new Set(v); next.add(`${nr},${nc}`); return next; });
      // Reaching the current target gem advances to the next one.
      const t = gems[gemIndex];
      if (t && nr === t.r && nc === t.c) setGemIndex((i) => i + 1);
      return { r: nr, c: nc };
    });
  }, [mode, finishMs, grid, GRID_SIZE, gems, gemIndex]);

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

  // Swipe alternative to the arrow buttons/keys — only active when the
  // player has swipeControls on (see lib/gamePrefs.js). Called
  // unconditionally (Rules of Hooks) — `enabled` gates its behavior
  // internally instead of this being called conditionally.
  const swipeEnabled = !!player?.gamePrefs?.swipeControls;
  const swipeHandlers = useSwipeControls((dir) => {
    if (dir === "up") move(-1, 0);
    else if (dir === "down") move(1, 0);
    else if (dir === "left") move(0, -1);
    else move(0, 1);
  }, swipeEnabled);

  useEffect(() => {
    if (!startTime || !allGemsDone || reported.current) return;
    reported.current = true;
    const time = Date.now() - startTime + penaltyMs;
    setFinishMs(time);
    reportScore(gameId, round.round, player.id, player.name, time, { final: true });
  }, [allGemsDone, startTime]); // eslint-disable-line react-hooks/exhaustive-deps

  if (finishMs) {
    return <GameResultCard icon="🕶️" title="Maze Solved" valueLabel={`${(finishMs / 1000).toFixed(2)}s`} />;
  }
  if (!startTime) {
    return <Card style={{ marginBottom: 20, textAlign: "center" }}><p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic" }}>Loading...</p></Card>;
  }

  const cell = GRID_SIZE <= 15 ? 20 : GRID_SIZE <= 21 ? 16 : 12;

  return (
    <Card style={{ marginBottom: 20, textAlign: "center", borderColor: bumpFlash ? "#ff3860" : undefined }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🕶️ Invisible Maze</h3>
        <Badge>💎 {gemIndex}/{gems.length}</Badge>
      </div>
      <p style={{ color: "#6b4f99", fontSize: 11, margin: "0 0 8px", fontStyle: "italic" }}>
        Get all {gems.length} gems in order. Toggle View to memorize, or Move blind — bumping a wall costs {WALL_BUMP_PENALTY_MS / 1000}s.
      </p>
      {penaltyMs > 0 && <p style={{ color: "#ff3860", fontSize: 11, margin: "0 0 6px", fontWeight: 700 }}>-{(penaltyMs / 1000).toFixed(1)}s in wall-bump penalties</p>}

      <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 10 }}>
        <button
          onClick={() => setMode("view")}
          style={{ ...toggleStyle, ...(mode === "view" ? toggleActiveStyle : {}) }}
        >👁 View</button>
        <button
          onClick={() => setMode("move")}
          style={{ ...toggleStyle, ...(mode === "move" ? toggleActiveStyle : {}) }}
        >🏃 Move</button>
      </div>

      <div
        onTouchStart={swipeHandlers.onTouchStart} onTouchEnd={swipeHandlers.onTouchEnd}
        style={{
          display: "grid", gridTemplateColumns: `repeat(${GRID_SIZE}, ${cell}px)`, gridTemplateRows: `repeat(${GRID_SIZE}, ${cell}px)`,
          margin: "0 auto 12px", border: "2px solid #3d1f5c", width: "fit-content", background: "#05010f",
          touchAction: swipeEnabled ? "none" : "auto",
        }}
      >
        {grid.map((row, r) => row.map((wall, c) => {
          const isPlayer = pos.r === r && pos.c === c;
          const isTarget = target && target.r === r && target.c === c;
          const gemHereIdx = gems.findIndex((g) => g.r === r && g.c === c);
          const isFutureGem = gemHereIdx > gemIndex;
          const isVisited = visited.has(`${r},${c}`);

          let bg, content = "";
          if (mode === "view") {
            // True layout, always visible.
            bg = wall ? "#3d1f5c" : "#0d0618";
            if (isPlayer) { bg = "#ff2d95"; content = "🧍"; }
            else if (isTarget) { bg = "#00ff9d"; content = "💎"; }
            else if (isFutureGem) content = "✨";
          } else {
            // Move mode: walls are invisible. Only visited cells, the
            // player, and the CURRENT target gem (a landmark to aim for)
            // are shown — everything else looks identical whether it's
            // open or a wall.
            const isKnown = isPlayer || isTarget || isVisited;
            bg = !isKnown ? "#05010f" : "#0d0618";
            if (isPlayer) { bg = "#ff2d95"; content = "🧍"; }
            else if (isTarget) { bg = "#00ff9d"; content = "💎"; }
          }

          return (
            <div key={`${r}-${c}`} style={{
              width: cell, height: cell, background: bg, boxSizing: "border-box",
              fontSize: Math.min(cell, 16), lineHeight: `${cell}px`,
              border: "1px solid rgba(255,255,255,0.03)",
            }}>
              {content}
            </div>
          );
        }))}
      </div>

      <DPad
        onUp={() => move(-1, 0)} onDown={() => move(1, 0)} onLeft={() => move(0, -1)} onRight={() => move(0, 1)}
        disabled={mode !== "move"} opacity={mode === "move" ? 1 : 0.35}
      />
      <p style={{ color: "#6b4f99", fontSize: 11, marginTop: 8, fontStyle: "italic" }}>
        Arrow keys work in Move mode too.{swipeEnabled && " Or swipe on the board."}
      </p>
    </Card>
  );
}

const toggleStyle = {
  padding: "6px 16px", borderRadius: 20, background: "#0d0618", border: "1px solid #3d1f5c",
  color: "#a68fd6", fontSize: 12, fontWeight: 700, cursor: "pointer",
};
const toggleActiveStyle = { background: "rgba(255,45,149,0.15)", border: "1px solid #ff2d95", color: "#ff2d95" };
