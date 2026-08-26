import { useState, useEffect, useRef } from "react";
import { Card, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { useCountdown } from "./useCountdown";
import { usePersistedStart } from "./usePersistedStart";
import { reportScore } from "../../lib/challengeScores";
import { SIZE, generateScramble, isSolved, correctCount, trySlide } from "../../lib/games/slidingPuzzleData";

const FINISH_BASE = 100000000000; // reported score tier for anyone who solves it — always beats anyone who doesn't, faster solves score higher within this tier. Same fix as RedLightGreenLightPlayer.jsx (see its own comment for the full story): was 10,000,000 (~2.78 hours of real wall-clock time before going negative), raised to ~3,170 years, paired with the Math.max(1, ...) floor below as the actual hard guarantee.

export default function SlidingPuzzlePlayer({ gameId, challenge, round, player }) {
  // startedAt (the challenge's shared, host-triggered start) is used
  // ONLY as the seed for generateScramble below, so everyone gets the
  // same starting board — there's no real-time synchronized element
  // here the way Red Light Green Light's light schedule has, so
  // there's no reason for anything else to be tied to the shared clock.
  // Timing/scoring is based entirely on myStartTime instead (see
  // RedLightGreenLightPlayer.jsx's own comment for the full story on
  // why this matters: the previous version used startedAt for BOTH,
  // which meant a player who opened this screen minutes after the
  // challenge began had that whole gap baked into their reported solve
  // time before they ever touched a tile).
  const startedAt = challenge?.startedAt || null;
  const myStartTime = usePersistedStart(gameId, round.round, challenge?.startedAt, player.id);
  const { timeUp } = useCountdown(challenge?.endsAt);
  const [board, setBoard] = useState(() => generateScramble(startedAt || 1));
  const [moves, setMoves] = useState(0);
  const [done, setDone] = useState(false);
  const [finishedMs, setFinishedMs] = useState(null);
  const reportedRef = useRef(false);
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (!myStartTime || done) return;
    const interval = window.setInterval(() => forceTick((t) => t + 1), 250);
    return () => window.clearInterval(interval);
  }, [myStartTime, done]);

  const slide = (idx) => {
    if (done) return;
    const next = trySlide(board, idx);
    if (!next) return;
    setBoard(next);
    setMoves((m) => m + 1);
    if (isSolved(next)) {
      // Clamped to never go negative — same reasoning as
      // RedLightGreenLightPlayer.jsx's identical fix: a device's own
      // clock drifting or auto-correcting mid-session can otherwise
      // send this negative, which INFLATES the reported score instead
      // of just making it wrong in the usual direction.
      setFinishedMs(Math.max(0, Date.now() - myStartTime));
      setDone(true);
    }
  };

  useEffect(() => {
    if (timeUp && !done) setDone(true);
  }, [timeUp, done]);

  useEffect(() => {
    if (!done || reportedRef.current) return;
    reportedRef.current = true;
    // Math.max floors above SIZE*SIZE-1 (the max possible correctCount,
    // 15 tiles on a 4x4 board), not just 1 — same reasoning as
    // RedLightGreenLightPlayer.jsx's identical fix: a solver's score
    // must always exceed the highest possible unsolved-progress score,
    // even in the floor case.
    const value = finishedMs != null ? Math.max(SIZE * SIZE, FINISH_BASE - finishedMs) : correctCount(board);
    reportScore(gameId, round.round, player.id, player.name, value, { final: true });
  }, [done]); // eslint-disable-line react-hooks/exhaustive-deps

  const elapsedSec = myStartTime ? (Math.max(0, Date.now() - myStartTime) / 1000).toFixed(1) : "0.0";

  if (done) {
    return finishedMs != null
      ? <GameResultCard icon="🧩" title="Solved!" valueLabel={`${(finishedMs / 1000).toFixed(1)}s — ${moves} moves`} />
      : <GameResultCard icon="🧩" title="Time's Up" valueLabel={`${correctCount(board)}/${SIZE * SIZE - 1} tiles placed`} />;
  }

  if (!startedAt || !myStartTime) {
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
