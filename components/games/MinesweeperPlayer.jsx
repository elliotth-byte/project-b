import { useState, useEffect, useRef } from "react";
import { Card, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { useCountdown } from "./useCountdown";
import { reportScore } from "../../lib/challengeScores";
import { COLS, ROWS, MINES, generateBoard, floodReveal, cellIndex } from "../../lib/games/minesweeperData";

const NUMBER_COLORS = ["", "#00d9ff", "#00ff9d", "#ff2d95", "#ffd700", "#ff9f4d", "#c879ff", "#f5f0ff", "#a68fd6"];

export default function MinesweeperPlayer({ gameId, round, challenge, player }) {
  const seed = (challenge?.startedAt || 1) + (player?.id ? player.id.split("-")[0].length : 0);
  const { timeUp } = useCountdown(challenge?.endsAt);
  const [board, setBoard] = useState(null); // null until first click
  const [revealed, setRevealed] = useState(new Set());
  const [flagged, setFlagged] = useState(new Set());
  const [flagMode, setFlagMode] = useState(false);
  const [startedAt, setStartedAt] = useState(null);
  const [outcome, setOutcome] = useState(null); // "won" | "lost" | null
  const [elapsedSec, setElapsedSec] = useState(0);
  const reportedRef = useRef(false);

  useEffect(() => {
    if (!startedAt || outcome) return;
    const interval = window.setInterval(() => setElapsedSec(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(interval);
  }, [startedAt, outcome]);

  const tapCell = (x, y) => {
    if (outcome || timeUp) return;
    const i = cellIndex(x, y);

    if (flagMode) {
      if (revealed.has(i)) return;
      setFlagged((f) => {
        const next = new Set(f);
        if (next.has(i)) next.delete(i); else next.add(i);
        return next;
      });
      return;
    }

    if (flagged.has(i) || revealed.has(i)) return;

    let activeBoard = board;
    if (!activeBoard) {
      activeBoard = generateBoard(seed || 1, x, y);
      setBoard(activeBoard);
      setStartedAt(Date.now());
    }

    if (activeBoard.isMine[i]) {
      setRevealed((r) => new Set([...r, i]));
      setOutcome("lost");
      return;
    }

    const newlyRevealed = floodReveal(activeBoard, revealed, x, y);
    setRevealed((r) => {
      const next = new Set([...r, ...newlyRevealed]);
      if (next.size >= COLS * ROWS - MINES) setOutcome("won");
      return next;
    });
  };

  const finalRevealedCount = revealed.size;

  useEffect(() => {
    if ((outcome || timeUp) && !reportedRef.current) {
      reportedRef.current = true;
      const score = outcome === "won" ? Math.max(1, 10000 - elapsedSec) : finalRevealedCount;
      reportScore(gameId, round.round, player.id, player.name, score, { final: true });
    }
  }, [outcome, timeUp]); // eslint-disable-line react-hooks/exhaustive-deps

  if (outcome === "won") {
    return <GameResultCard icon="💣" title="Cleared!" valueLabel={`${elapsedSec}s`} />;
  }
  if (outcome === "lost" || timeUp) {
    return <GameResultCard icon="💥" title={outcome === "lost" ? "Boom." : "Time's Up"} valueLabel={`${finalRevealedCount}/${COLS * ROWS - MINES} cleared`} />;
  }

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>💣 Minesweeper</h3>
        <Badge>{startedAt ? `${elapsedSec}s` : "9x9 · 10 mines"}</Badge>
      </div>

      <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
        <button onClick={() => setFlagMode((f) => !f)} style={{
          padding: "6px 16px", borderRadius: 20, cursor: "pointer",
          background: flagMode ? "rgba(255,215,0,0.15)" : "#0d0618",
          border: `1px solid ${flagMode ? "#ffd700" : "#3d1f5c"}`,
          color: flagMode ? "#ffd700" : "#a68fd6", fontSize: 12, fontWeight: 700,
        }}>{flagMode ? "🚩 Flag Mode ON" : "🚩 Tap to Flag"}</button>
      </div>

      <div style={{
        display: "grid", gridTemplateColumns: `repeat(${COLS}, 30px)`, gridTemplateRows: `repeat(${ROWS}, 30px)`, gap: 2,
        margin: "0 auto", width: "fit-content", background: "#05010f", border: "2px solid #3d1f5c", padding: 4,
      }}>
        {Array.from({ length: ROWS }).map((_, y) => Array.from({ length: COLS }).map((_, x) => {
          const i = cellIndex(x, y);
          const isRevealed = revealed.has(i);
          const isFlagged = flagged.has(i);
          const isMineHit = outcome === "lost" && board?.isMine[i] && isRevealed;
          const num = board && isRevealed ? board.adjacent[i] : 0;
          return (
            <button
              key={i} onClick={() => tapCell(x, y)}
              style={{
                width: 30, height: 30, fontSize: 14, fontWeight: 900,
                // Classic Minesweeper bevel: unrevealed cells raised
                // (light top-left edge, dark bottom-right), revealed
                // cells sunken in — reads as physical buttons instead
                // of a flat colored grid.
                background: isMineHit
                  ? "linear-gradient(160deg, #ff6f91, #ff3860)"
                  : isRevealed ? "#150a28" : "linear-gradient(160deg, #1c1230, #0d0618)",
                border: `1px solid ${isRevealed ? "#3d1f5c" : "#5c3a8c"}`,
                boxShadow: isMineHit
                  ? "none"
                  : isRevealed
                    ? "inset 0 2px 3px rgba(0,0,0,0.5)"
                    : "inset 1px 1px 0 rgba(255,255,255,0.08), inset -2px -2px 3px rgba(0,0,0,0.5)",
                color: isRevealed ? NUMBER_COLORS[num] || "#f5f0ff" : "#f5f0ff",
                cursor: "pointer",
              }}
            >
              {isMineHit ? "💣" : isFlagged ? "🚩" : isRevealed && num > 0 ? num : ""}
            </button>
          );
        }))}
      </div>
      <p style={{ color: "#6b4f99", fontSize: 11, marginTop: 8, fontStyle: "italic" }}>
        Numbers show how many mines touch that cell. Clear every safe cell to win.
      </p>
    </Card>
  );
}
