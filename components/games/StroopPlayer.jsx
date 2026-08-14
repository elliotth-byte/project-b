import { useState, useEffect, useRef } from "react";
import { Card, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { useCountdown } from "./useCountdown";
import { reportScore } from "../../lib/challengeScores";
import { COLORS, generateWall } from "../../lib/games/stroopData";

const WALL_SIZE = 20;
const MISTAKE_PENALTY_MS = 1500;
const DNF_BASE = 999999; // reported (as a lower-is-better value) if time runs out before finishing — always worse than any real finish time, but still ranks by progress among other DNFs

export default function StroopPlayer({ gameId, challenge, round, player }) {
  const seed = challenge?.startedAt || 1; // same wall for everyone — a "race" only means something if it's the same wall
  const [wall] = useState(() => generateWall(seed, WALL_SIZE));
  const { timeUp } = useCountdown(challenge?.endsAt);
  // Elapsed time is measured from the SHARED challenge start, not from
  // whenever this component happens to mount — a player who loads the
  // page a few seconds late shouldn't get their own personal head start
  // on the clock. Everyone's "elapsed" is relative to the same moment.
  const startedAt = challenge?.startedAt || null;
  const [cleared, setCleared] = useState(new Set());
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [penaltyMs, setPenaltyMs] = useState(0);
  const [flash, setFlash] = useState(null); // { idx, correct } | null
  const [done, setDone] = useState(false);
  const [finalMs, setFinalMs] = useState(null);
  const reportedRef = useRef(false);
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (!startedAt || done) return;
    const interval = window.setInterval(() => forceTick((t) => t + 1), 250);
    return () => window.clearInterval(interval);
  }, [startedAt, done]);

  const selectTile = (idx) => {
    if (done || cleared.has(idx)) return;
    setSelectedIdx(idx);
  };

  const answerColor = (colorName) => {
    if (selectedIdx == null || done) return;
    const tile = wall[selectedIdx];
    const correct = tile.ink === colorName;
    setFlash({ idx: selectedIdx, correct });
    window.setTimeout(() => setFlash(null), 250);

    if (correct) {
      setCleared((c) => {
        const next = new Set(c);
        next.add(selectedIdx);
        if (next.size >= WALL_SIZE) {
          const elapsed = Date.now() - startedAt + penaltyMs;
          setFinalMs(elapsed);
          setDone(true);
        }
        return next;
      });
      setSelectedIdx(null);
    } else {
      setPenaltyMs((p) => p + MISTAKE_PENALTY_MS);
    }
  };

  useEffect(() => {
    if (timeUp && !done) {
      setDone(true);
    }
  }, [timeUp, done]);

  useEffect(() => {
    if (!done || reportedRef.current) return;
    reportedRef.current = true;
    const score = finalMs != null ? Math.max(1, DNF_BASE - finalMs) : cleared.size; // finishers occupy a high tier (faster = higher, since it's DNF_BASE minus their time); DNFs rank below by raw progress
    reportScore(gameId, round.round, player.id, player.name, score, { final: true });
  }, [done]); // eslint-disable-line react-hooks/exhaustive-deps

  const elapsedDisplay = startedAt ? ((Date.now() - startedAt + penaltyMs) / 1000).toFixed(1) : "0.0";

  if (done) {
    return finalMs != null
      ? <GameResultCard icon="🌈" title="Wall Cleared!" valueLabel={`${(finalMs / 1000).toFixed(1)}s`} />
      : <GameResultCard icon="🌈" title="Time's Up" valueLabel={`${cleared.size}/${WALL_SIZE} cleared`} />;
  }

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🌈 Stroop Wall</h3>
        <Badge>{elapsedDisplay}s · {cleared.size}/{WALL_SIZE}</Badge>
      </div>
      <p style={{ color: "#6b4f99", fontSize: 11, margin: "0 0 10px", fontStyle: "italic" }}>
        Tap a word, then tap the color it's actually PRINTED in — not what it says. Wrong answer costs {MISTAKE_PENALTY_MS / 1000}s.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginBottom: 14 }}>
        {wall.map((tile, i) => {
          const isCleared = cleared.has(i);
          const isSelected = selectedIdx === i;
          const isFlashing = flash?.idx === i;
          return (
            <button
              key={i}
              onClick={() => selectTile(i)}
              disabled={isCleared}
              style={{
                padding: "10px 4px", borderRadius: 8, fontSize: 13, fontWeight: 900,
                cursor: isCleared ? "default" : "pointer",
                background: isCleared ? "#0d0618" : isFlashing ? (flash.correct ? "rgba(0,255,157,0.2)" : "rgba(255,56,96,0.2)") : isSelected ? "rgba(255,45,149,0.15)" : "#150a28",
                border: `2px solid ${isCleared ? "#3d1f5c" : isSelected ? "#ff2d95" : "#3d1f5c"}`,
                color: isCleared ? "#3d1f5c" : tile.inkHex,
                opacity: isCleared ? 0.4 : 1,
                fontFamily: "'Orbitron', 'Segoe UI', sans-serif",
              }}
            >
              {isCleared ? "✓" : tile.word}
            </button>
          );
        })}
      </div>

      <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 8px" }}>
        {selectedIdx == null ? "Tap a word above first." : "What color is it printed in?"}
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        {COLORS.map((c) => (
          <button
            key={c.name}
            onClick={() => answerColor(c.name)}
            disabled={selectedIdx == null}
            style={{
              padding: "12px 8px", borderRadius: 8, cursor: selectedIdx == null ? "default" : "pointer",
              background: `${c.hex}22`, border: `2px solid ${c.hex}`, color: c.hex,
              fontSize: 13, fontWeight: 900, fontFamily: "'Orbitron', 'Segoe UI', sans-serif",
              opacity: selectedIdx == null ? 0.4 : 1,
            }}
          >
            {c.name}
          </button>
        ))}
      </div>
    </Card>
  );
}
