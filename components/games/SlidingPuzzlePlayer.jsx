import { useState, useEffect, useRef } from "react";
import { Card, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { useCountdown } from "./useCountdown";
import { reportScore } from "../../lib/challengeScores";
import { SIZE, generateScramble, isSolved, correctCount, trySlide } from "../../lib/games/slidingPuzzleData";

const FINISH_BASE = 10000000; // reported score tier for anyone who solves it — always beats anyone who doesn't, faster solves score higher within this tier

export default function SlidingPuzzlePlayer({ gameId, challenge, round, player }) {
  const startedAt = challenge?.startedAt || null; // shared reference point — same reasoning as Stroop/Red Light Green Light, a late page-load shouldn't grant extra time
  const { timeUp } = useCountdown(challenge?.endsAt);
  const [board, setBoard] = useState(() => generateScramble(startedAt || 1));
  const [moves, setMoves] = useState(0);
  const [done, setDone] = useState(false);
  const [finishedMs, setFinishedMs] = useState(null);
  const reportedRef = useRef(false);
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (!startedAt || done) return;
    const interval = window.setInterval(() => forceTick((t) => t + 1), 250);
    return () => window.clearInterval(interval);
  }, [startedAt, done]);

  const slide = (idx) => {
    if (done) return;
    const next = trySlide(board, idx);
    if (!next) return;
    setBoard(next);
    setMoves((m) => m + 1);
    if (isSolved(next)) {
      setFinishedMs(Date.now() - startedAt);
      setDone(true);
    }
  };

  useEffect(() => {
    if (timeUp && !done) setDone(true);
  }, [timeUp, done]);

  useEffect(() => {
    if (!done || reportedRef.current) return;
    reportedRef.current = true;
    const value = finishedMs != null ? FINISH_BASE - finishedMs : correctCount(board);
    reportScore(gameId, round.round, player.id, player.name, value, { final: true });
  }, [done]); // eslint-disable-line react-hooks/exhaustive-deps

  const elapsedSec = startedAt ? ((Date.now() - startedAt) / 1000).toFixed(1) : "0.0";

  if (done) {
    return finishedMs != null
      ? <GameResultCard icon="🧩" title="Solved!" valueLabel={`${(finishedMs / 1000).toFixed(1)}s — ${moves} moves`} />
      : <GameResultCard icon="🧩" title="Time's Up" valueLabel={`${correctCount(board)}/${SIZE * SIZE - 1} tiles placed`} />;
  }

  if (!startedAt) {
    return <Card style={{ marginBottom: 20, textAlign: "center" }}><p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic" }}>Loading...</p></Card>;
  }

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🧩 Sliding Puzzle</h3>
        <Badge>{elapsedSec}s · {moves} moves</Badge>
      </div>
      <p style={{ color: "#6b4f99", fontSize: 11, margin: "0 0 10px", fontStyle: "italic" }}>
        Tap a tile next to the empty slot to slide it. Get them back in order, 1 to 15.
      </p>

      <div style={{
        display: "grid", gridTemplateColumns: `repeat(${SIZE}, 62px)`, gridTemplateRows: `repeat(${SIZE}, 62px)`,
        gap: 4, margin: "0 auto", width: "fit-content", background: "#05010f", border: "2px solid #3d1f5c", padding: 4,
      }}>
        {board.map((value, i) => {
          if (value === 0) return <div key={i} style={{ width: 62, height: 62 }} />;
          const isCorrect = value === i + 1;
          return (
            <button
              key={i}
              onClick={() => slide(i)}
              style={{
                width: 62, height: 62, fontSize: 20, fontWeight: 900, borderRadius: 8, cursor: "pointer",
                background: isCorrect ? "rgba(0,255,157,0.12)" : "#150a28",
                border: `2px solid ${isCorrect ? "#00ff9d" : "#3d1f5c"}`,
                color: isCorrect ? "#00ff9d" : "#f5f0ff",
                fontFamily: "'Orbitron', 'Segoe UI', sans-serif",
              }}
            >
              {value}
            </button>
          );
        })}
      </div>
    </Card>
  );
}
