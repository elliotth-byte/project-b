import { useState, useEffect, useRef } from "react";
import { Card, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { useCountdown } from "./useCountdown";
import { reportScore } from "../../lib/challengeScores";
import { generateLightSchedule, lightAt, TARGET_SCORE, STARTING_LIVES } from "../../lib/games/redLightGreenLightData";

const FINISH_BASE = 10000000; // reported score tier for anyone who reaches 100 — always beats anyone who doesn't, faster finishers score higher within this tier

export default function RedLightGreenLightPlayer({ gameId, challenge, round, player }) {
  const startedAt = challenge?.startedAt || null; // shared reference point — same reasoning as the Stroop wall, a late page-load shouldn't grant extra time
  const { timeUp } = useCountdown(challenge?.endsAt);
  const totalMs = challenge?.endsAt && startedAt ? challenge.endsAt - startedAt : 5 * 60 * 1000;
  const [schedule] = useState(() => generateLightSchedule(startedAt || 1, totalMs));

  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(STARTING_LIVES);
  const [flash, setFlash] = useState(null); // "safe" | "caught" | null
  const [done, setDone] = useState(false);
  const [finishedAt, setFinishedAt] = useState(null); // elapsed ms at the moment score hit 100, if it did
  const reportedRef = useRef(false);
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (!startedAt || done) return;
    const interval = window.setInterval(() => forceTick((t) => t + 1), 100);
    return () => window.clearInterval(interval);
  }, [startedAt, done]);

  const elapsedMs = startedAt ? Date.now() - startedAt : 0;
  const current = lightAt(schedule, elapsedMs);
  const isGreen = current?.type === "green";

  const tap = () => {
    if (done) return;
    if (isGreen) {
      setFlash("safe");
      window.setTimeout(() => setFlash((f) => (f === "safe" ? null : f)), 150);
      setScore((s) => {
        const next = s + 1;
        if (next >= TARGET_SCORE) {
          setFinishedAt(elapsedMs);
          setDone(true);
        }
        return next;
      });
    } else {
      setFlash("caught");
      window.setTimeout(() => setFlash((f) => (f === "caught" ? null : f)), 300);
      setLives((l) => {
        const next = l - 1;
        if (next <= 0) setDone(true);
        return Math.max(0, next);
      });
    }
  };

  useEffect(() => {
    if (timeUp && !done) setDone(true);
  }, [timeUp, done]);

  useEffect(() => {
    if (!done || reportedRef.current) return;
    reportedRef.current = true;
    const value = finishedAt != null ? FINISH_BASE - finishedAt : score;
    reportScore(gameId, round.round, player.id, player.name, value, { final: true });
  }, [done]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!startedAt || done) return;
    reportScore(gameId, round.round, player.id, player.name, score, { final: false });
  }, [score]); // eslint-disable-line react-hooks/exhaustive-deps

  if (done) {
    return finishedAt != null
      ? <GameResultCard icon="🚦" title="Made It!" valueLabel={`${(finishedAt / 1000).toFixed(1)}s`} />
      : <GameResultCard icon="🚦" title={lives <= 0 ? "Eliminated" : "Time's Up"} valueLabel={`${score}/${TARGET_SCORE}`} />;
  }

  if (!startedAt) {
    return <Card style={{ marginBottom: 20, textAlign: "center" }}><p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic" }}>Loading...</p></Card>;
  }

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🚦 Red Light, Green Light</h3>
        <Badge color={lives <= 1 ? "#ff3860" : "#ff2d95"}>{"❤️".repeat(lives)} · {score}/{TARGET_SCORE}</Badge>
      </div>

      <div style={{
        margin: "0 auto 16px", width: 90, height: 90, borderRadius: "50%",
        background: isGreen ? "#00ff9d" : "#ff3860",
        boxShadow: `0 0 30px ${isGreen ? "#00ff9d" : "#ff3860"}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 13, fontWeight: 900, color: "#05010f", fontFamily: "'Orbitron', 'Segoe UI', sans-serif",
        transition: "background 0.15s",
      }}>
        {isGreen ? "GO" : "STOP"}
      </div>

      <button
        onClick={tap}
        style={{
          width: 160, height: 160, borderRadius: "50%", margin: "0 auto 12px", display: "block",
          background: flash === "caught" ? "#ff3860" : flash === "safe" ? "#00ff9d" : "linear-gradient(135deg, #ff2d95, #b829ff)",
          border: "none", cursor: "pointer", fontSize: 16, fontWeight: 900, color: "#05010f",
          fontFamily: "'Orbitron', 'Segoe UI', sans-serif", transition: "background 0.1s",
        }}
      >
        TAP
      </button>
      <p style={{ color: "#6b4f99", fontSize: 11, fontStyle: "italic" }}>
        Tap fast on green. Tap on red and you lose a life. First to {TARGET_SCORE} wins outright.
      </p>
    </Card>
  );
}
