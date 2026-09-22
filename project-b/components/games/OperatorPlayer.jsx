import { useState, useRef, useEffect } from "react";
import { Card, Badge, Btn } from "../ui";
import GameResultCard from "./GameResultCard";
import { useCountdown } from "./useCountdown";
import { usePersistedStart } from "./usePersistedStart";
import { generatePuzzle, validOperators, applyOperator, isSolved } from "../../lib/games/operatorData";
import { reportScore } from "../../lib/challengeScores";

const OPERATORS = ["+", "-", "×", "÷"];

// Solo, client-only — see lib/games/operatorData.js's own header
// comment. Scored purely on speed (matching "Scored on speed — fastest
// to the target wins" from the game's own rules) — solving is binary,
// there's no partial credit for an unsolved board, so unlike Hue there's
// no closeness component to blend in here.
export default function OperatorPlayer({ gameId, round, challenge, player }) {
  const { timeUp } = useCountdown(challenge?.endsAt);
  const seed = (challenge?.startedAt || 1) + (player?.id ? player.id.length : 0);
  const [puzzle] = useState(() => generatePuzzle(seed));
  const startTime = usePersistedStart(gameId, round.round, challenge?.startedAt, player.id);
  const [tiles, setTiles] = useState(() => puzzle.numbers.map((value, i) => ({ id: i, value })));
  const [history, setHistory] = useState([]); // snapshots of `tiles` for undo
  const [selectedId, setSelectedId] = useState(null);
  const [pendingOp, setPendingOp] = useState(null);
  const [done, setDone] = useState(false);
  const [solved, setSolved] = useState(false);
  const reportedRef = useRef(false);
  const nextTileId = useRef(puzzle.numbers.length);

  const finish = (didSolve) => {
    if (reportedRef.current || !startTime) return;
    reportedRef.current = true;
    setSolved(didSolve);
    setDone(true);
    const elapsedMs = Math.max(0, Date.now() - startTime); // clamped -- a device clock drifting mid-session must never send this negative (see RedLightGreenLightPlayer.jsx for the full story on why this matters: it INFLATES a score instead of just corrupting it the usual way)
    // Higher is better (rank: score-desc, matching every other timed
    // game) — an unsolved board scores 0 outright, never competing with
    // a genuine solve. Among solves, faster wins: a huge constant minus
    // elapsed time keeps this comfortably positive for any realistic
    // challenge duration.
    const value = didSolve ? Math.max(1, 10_000_000 - elapsedMs) : 0;
    reportScore(gameId, round.round, player.id, player.name, value, { final: true, solved: didSolve });
  };

  useEffect(() => {
    if (timeUp && !reportedRef.current) finish(false);
  }, [timeUp]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectTile = (id) => {
    if (done) return;
    if (selectedId == null) { setSelectedId(id); return; }
    if (id === selectedId) { setSelectedId(null); setPendingOp(null); return; } // tap the same tile again to deselect
    if (pendingOp == null) return; // need an operator picked before a second tile means anything
    const a = tiles.find((t) => t.id === selectedId);
    const b = tiles.find((t) => t.id === id);
    const legal = validOperators(a.value, b.value);
    if (!legal.includes(pendingOp)) return; // this specific pairing can't use the chosen operator (e.g. would go negative or not divide evenly) — silently ignore, don't crash on an invalid combo
    const result = applyOperator(pendingOp, a.value, b.value);
    const nextTiles = tiles.filter((t) => t.id !== selectedId && t.id !== id);
    nextTiles.push({ id: nextTileId.current++, value: result });
    setHistory((h) => [...h, tiles]);
    setTiles(nextTiles);
    setSelectedId(null);
    setPendingOp(null);
    if (isSolved(nextTiles, puzzle.target)) finish(true);
  };

  const pickOperator = (op) => {
    if (done || selectedId == null) return;
    setPendingOp(op);
  };

  const undo = () => {
    if (done || history.length === 0) return;
    setTiles(history[history.length - 1]);
    setHistory((h) => h.slice(0, -1));
    setSelectedId(null);
    setPendingOp(null);
  };

  const resetNums = () => {
    if (done) return;
    setTiles(puzzle.numbers.map((value, i) => ({ id: i, value })));
    setHistory([]);
    setSelectedId(null);
    setPendingOp(null);
    nextTileId.current = puzzle.numbers.length;
  };

  if (done) {
    return (
      <GameResultCard
        icon="🧮"
        title={solved ? "Solved!" : "Time's Up"}
        valueLabel={solved ? `Reached ${puzzle.target}` : `Target was ${puzzle.target}`}
      />
    );
  }

  if (!startTime) {
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic" }}>Loading...</p>
      </Card>
    );
  }

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ color: "#00ff9d", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🧮 Operator</h3>
        <Badge>Target {puzzle.target}</Badge>
      </div>
      <p style={{ color: "#6b4f99", fontSize: 11, margin: "0 0 14px" }}>
        Tap a number, an operator, then another number — the result becomes a new tile. Keep going until one tile matches the target.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8, marginBottom: 14 }}>
        {tiles.map((t) => (
          <button
            key={t.id} onClick={() => selectTile(t.id)}
            style={{
              minWidth: 56, height: 56, borderRadius: 10, cursor: "pointer",
              background: t.id === selectedId ? "linear-gradient(160deg, rgba(0,255,157,0.28), rgba(0,255,157,0.1))" : "linear-gradient(160deg, #1c1230, #0a0614)",
              border: `2px solid ${t.id === selectedId ? "#00ff9d" : "#3d1f5c"}`,
              boxShadow: t.id === selectedId ? "0 0 8px rgba(0,255,157,0.4)" : "inset 1px 1px 0 rgba(255,255,255,0.06), inset -2px -2px 3px rgba(0,0,0,0.4)",
              color: "#f5f0ff", fontSize: 18, fontWeight: 800, padding: "0 10px",
            }}
          >
            {t.value}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 14 }}>
        {OPERATORS.map((op) => (
          <button
            key={op} onClick={() => pickOperator(op)} disabled={selectedId == null}
            style={{
              width: 48, height: 48, borderRadius: 10, cursor: selectedId == null ? "default" : "pointer",
              background: op === pendingOp ? "linear-gradient(160deg, rgba(0,255,157,0.28), rgba(0,255,157,0.1))" : "linear-gradient(160deg, #1c1230, #0a0614)",
              border: `2px solid ${op === pendingOp ? "#00ff9d" : "#3d1f5c"}`,
              boxShadow: op === pendingOp ? "0 0 8px rgba(0,255,157,0.4)" : "inset 1px 1px 0 rgba(255,255,255,0.06), inset -2px -2px 3px rgba(0,0,0,0.4)",
              color: selectedId == null ? "#3d1f5c" : "#00ff9d", fontSize: 20, fontWeight: 800,
            }}
          >
            {op}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
        <Btn small variant="ghost" onClick={undo} disabled={history.length === 0}>↩ Undo</Btn>
        <Btn small variant="ghost" onClick={resetNums} disabled={history.length === 0}>🔄 Reset</Btn>
      </div>
    </Card>
  );
}
