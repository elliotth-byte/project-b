import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Card, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { reportScore } from "../../lib/challengeScores";
import { usePersistedStart } from "./usePersistedStart";
import { generateMazeWithGems, straightLinePath } from "../../lib/games/mazeGemsData";
import { pickMazeTriviaQuestions } from "../../lib/games/mazeTriviaQuestions";
import { useSwipeControls } from "../../lib/games/useSwipeControls";
import DPad from "./DPad";

const DEFAULT_SIZE = 15;

// Builds this gem's shortcut: a straight line from `from` to `to`, with
// one cell partway along it picked as the locked gate. Everything else
// on the line is carved open (a real shortcut once the gate's dealt
// with); the gate cell alone blocks it until answered.
function buildShortcut(from, to) {
  const path = straightLinePath(from, to);
  if (path.length < 3) return { cells: new Set(), gate: null };
  const gateIdx = Math.floor(path.length / 2);
  const gate = path[gateIdx];
  const cells = new Set(path.filter((_, i) => i !== gateIdx).map((p) => `${p.r},${p.c}`));
  return { cells, gate };
}

// ─── Trivia Maze ───
// Same 5-gems-in-order objective as Invisible Maze, but every gem has a
// direct shortcut straight through the walls from wherever you currently
// are — gated by one trivia question. Answer it right and the gate opens,
// giving direct access; answer wrong (or it's already been used) and
// that shortcut stays shut for good, meaning the only way to that gem is
// the long way, through the actual generated maze.
export default function MazeTriviaPlayer({ gameId, round, challenge, player }) {
  const SIZE = useMemo(() => {
    const raw = challenge?.gameConfig?.size || DEFAULT_SIZE;
    const clamped = Math.max(9, Math.min(31, raw));
    return clamped % 2 === 0 ? clamped + 1 : clamped;
  }, [challenge?.gameConfig?.size]);
  const seed = (challenge?.startedAt || 1) + (player?.id ? player.id.split("-")[0].length : 0);
  const [{ grid, start, gems }] = useState(() => generateMazeWithGems(seed || 1, SIZE));
  // See the matching comment in MazeInvisiblePlayer.jsx — bounds/wall
  // checks are derived from the grid's own dimensions, not the SIZE
  // memo, so a late-arriving challenge prop can never desync them.
  const GRID_SIZE = grid.length;
  const [gateQuestions] = useState(() => pickMazeTriviaQuestions(seed || 1, 5));
  const [pos, setPos] = useState(start);
  const [visited, setVisited] = useState(() => new Set([`${start.r},${start.c}`]));
  const [gemIndex, setGemIndex] = useState(0);
  const [shortcut, setShortcut] = useState(() => buildShortcut(start, gems[0]));
  const [gateState, setGateState] = useState("locked"); // "locked" | "answering" | "open" | "failed"
  const [selected, setSelected] = useState(null);
  const startTime = usePersistedStart(gameId, round.round, player.id);
  const [finishMs, setFinishMs] = useState(null);
  const reported = useRef(false);

  const target = gems[gemIndex];
  const allGemsDone = gemIndex >= gems.length;
  const gateQuestion = gateQuestions[gemIndex];

  // A fresh shortcut (and a reset gate) every time a new gem becomes the
  // target — the shortcut always starts from wherever the player
  // actually is right now, not from the maze's original start.
  useEffect(() => {
    if (!target) return;
    setShortcut(buildShortcut(pos, target));
    setGateState("locked");
    setSelected(null);
  }, [gemIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  const isWalkable = useCallback((r, c) => {
    if (grid[r][c] === 0) return true;
    const key = `${r},${c}`;
    if (shortcut.cells.has(key)) return true;
    if (shortcut.gate && shortcut.gate.r === r && shortcut.gate.c === c && gateState === "open") return true;
    return false;
  }, [grid, shortcut, gateState]);

  const move = useCallback((dr, dc) => {
    if (finishMs || gateState === "answering") return;
    setPos((prev) => {
      const nr = prev.r + dr, nc = prev.c + dc;
      if (nr < 0 || nc < 0 || nr >= GRID_SIZE || nc >= GRID_SIZE) return prev;

      // Walking into the (still-locked, not-yet-attempted) gate triggers
      // the question instead of just blocking movement.
      if (shortcut.gate && shortcut.gate.r === nr && shortcut.gate.c === nc && gateState === "locked") {
        setGateState("answering");
        return prev;
      }
      if (!isWalkable(nr, nc)) return prev;

      setVisited((v) => { const next = new Set(v); next.add(`${nr},${nc}`); return next; });
      const t = gems[gemIndex];
      if (t && nr === t.r && nc === t.c) setGemIndex((i) => i + 1);
      return { r: nr, c: nc };
    });
  }, [finishMs, gateState, shortcut, isWalkable, GRID_SIZE, gems, gemIndex]);

  const answerGate = (choiceIdx) => {
    if (gateState !== "answering") return;
    setSelected(choiceIdx);
    const correct = choiceIdx === gateQuestion.answer;
    window.setTimeout(() => setGateState(correct ? "open" : "failed"), 700);
  };

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
    const time = Date.now() - startTime;
    setFinishMs(time);
    reportScore(gameId, round.round, player.id, player.name, time, { final: true });
  }, [allGemsDone, startTime]); // eslint-disable-line react-hooks/exhaustive-deps

  if (finishMs) {
    return <GameResultCard icon="🔑" title="Maze Solved" valueLabel={`${(finishMs / 1000).toFixed(2)}s`} />;
  }
  if (!startTime) {
    return <Card style={{ marginBottom: 20, textAlign: "center" }}><p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic" }}>Loading...</p></Card>;
  }

  const cell = GRID_SIZE <= 15 ? 20 : GRID_SIZE <= 21 ? 16 : 12;

  if (gateState === "answering" && gateQuestion) {
    return (
      <Card style={{ marginBottom: 20 }}>
        <h3 style={{ color: "#ff2d95", margin: "0 0 4px", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🔑 Locked Gate</h3>
        <p style={{ color: "#6b4f99", fontSize: 11, margin: "0 0 12px", fontStyle: "italic" }}>Answer correctly to unlock the direct shortcut. Wrong, and it's shut for good — you'll need to find the long way around.</p>
        <p style={{ color: "#f5f0ff", fontSize: 15, fontWeight: 600, margin: "0 0 12px", fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>{gateQuestion.q}</p>
        <div style={{ display: "grid", gap: 8 }}>
          {gateQuestion.options.map((opt, i) => (
            <button key={i} onClick={() => answerGate(i)} disabled={selected !== null} style={{
              textAlign: "left", padding: "10px 14px", borderRadius: 8, cursor: selected !== null ? "default" : "pointer",
              background: "#0d0618", border: "2px solid #3d1f5c", color: "#f5f0ff", fontSize: 14,
              fontFamily: "'Orbitron', 'Segoe UI', sans-serif",
            }}>{opt}</button>
          ))}
        </div>
      </Card>
    );
  }

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🔑 Trivia Maze</h3>
        <Badge>💎 {gemIndex}/{gems.length}</Badge>
      </div>
      <p style={{ color: "#6b4f99", fontSize: 11, margin: "0 0 8px", fontStyle: "italic" }}>
        Get all 5 gems in order. Walk into the gate for a shot at the shortcut, or navigate the maze the long way.
      </p>
      {gateState === "failed" && <p style={{ color: "#ff3860", fontSize: 11, margin: "0 0 8px", fontWeight: 700 }}>Shortcut's shut — find the long way to this gem.</p>}

      <div
        onTouchStart={swipeHandlers.onTouchStart} onTouchEnd={swipeHandlers.onTouchEnd}
        style={{
          display: "grid", gridTemplateColumns: `repeat(${GRID_SIZE}, ${cell}px)`, gridTemplateRows: `repeat(${GRID_SIZE}, ${cell}px)`,
        margin: "0 auto 12px", border: "2px solid #3d1f5c", width: "fit-content", background: "#05010f",
        touchAction: swipeEnabled ? "none" : "auto",
      }}>
        {grid.map((row, r) => row.map((wall, c) => {
          const key = `${r},${c}`;
          const isPlayer = pos.r === r && pos.c === c;
          const isTarget = target && target.r === r && target.c === c;
          const gemHereIdx = gems.findIndex((g) => g.r === r && g.c === c);
          const isFutureGem = gemHereIdx > gemIndex;
          const isVisited = visited.has(key);
          const isGate = shortcut.gate && shortcut.gate.r === r && shortcut.gate.c === c;
          const isShortcut = shortcut.cells.has(key);
          const isKnown = isPlayer || isTarget || isVisited || isGate || isShortcut;

          let bg = !isKnown ? "#05010f" : wall && !isShortcut && !isGate ? "#3d1f5c" : "#0d0618";
          let content = "";
          if (isShortcut) bg = "rgba(0,217,255,0.12)";
          if (isGate) { bg = gateState === "open" ? "rgba(0,255,157,0.2)" : "rgba(255,56,96,0.18)"; content = gateState === "open" ? "🔓" : "🔒"; }
          if (isPlayer) { bg = "#ff2d95"; content = "🧍"; }
          else if (isTarget) { bg = "#00ff9d"; content = "💎"; }
          else if (isFutureGem) content = "✨";

          return (
            <div key={key} style={{
              width: cell, height: cell, background: bg, boxSizing: "border-box",
              fontSize: Math.min(cell, 16), lineHeight: `${cell}px`,
              border: "1px solid rgba(255,255,255,0.03)",
            }}>
              {content}
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
