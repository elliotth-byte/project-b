import { useState, useEffect, useRef } from "react";
import { Card, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { useCountdown } from "./useCountdown";
import { usePersistedStart } from "./usePersistedStart";
import { reportScore } from "../../lib/challengeScores";
import { generateLightSchedule, lightAt, TARGET_SCORE, STARTING_LIVES } from "../../lib/games/redLightGreenLightData";

const FINISH_BASE = 100000000000; // reported score tier for anyone who reaches 100 — always beats anyone who doesn't, faster finishers score higher within this tier. 100 billion ms (~3,170 years) — was 10,000,000 (~2.78 hours), which is exactly why Daniel's score went negative: any challenge left open longer than that in real wall-clock time (an overnight Battle, a slow re-entry decision holding it open) pushed elapsedMs past the base entirely. Math.max(1, ...) below is the actual hard guarantee against a negative score ever happening again — this increase just makes hitting that floor (and everyone who does tying at 1) comically unlikely instead of a real possibility.
const WARNING_WINDOW_MS = 600; // how long before a green segment ends that the yellow warning kicks in — purely visual, tapping here is still counted as green/safe

export default function RedLightGreenLightPlayer({ gameId, challenge, round, player }) {
  // TWO separate clocks, deliberately not one — this distinction is the
  // actual fix for the "later players get an insanely high time" bug:
  // startedAt (the challenge's shared, host-triggered start) drives ONLY
  // the light schedule itself, so everyone watches the same real-time
  // red/green sequence together, exactly like the real childhood game
  // has one caller for everyone — that part was correct and stays as-is.
  // The previous version ALSO used this same shared clock for scoring
  // (finishedAt), which is what actually broke: a player who opens this
  // screen minutes (or, per the report that caught this, literally
  // hours) after the challenge started had that whole gap already baked
  // into their reported time before they ever tapped once, even though
  // they personally played just as fast as anyone else. myStartTime
  // (usePersistedStart, the same per-player pattern already proven by
  // several other games here — see this hook's own file for the full
  // list) is set the moment THIS player's own screen actually loads, and
  // is what scoring is based on now instead.
  const startedAt = challenge?.startedAt || null;
  const myStartTime = usePersistedStart(gameId, round.round, challenge?.startedAt, player.id);
  const { timeUp } = useCountdown(challenge?.endsAt);
  const totalMs = challenge?.endsAt && startedAt ? challenge.endsAt - startedAt : 5 * 60 * 1000;
  const [schedule] = useState(() => generateLightSchedule(startedAt || 1, totalMs));

  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(STARTING_LIVES);
  const [flash, setFlash] = useState(null); // "safe" | "caught" | null
  const [done, setDone] = useState(false);
  const [finishedAt, setFinishedAt] = useState(null); // PERSONAL elapsed ms (from myStartTime) at the moment score hit 100, if it did — not the shared clock
  const reportedRef = useRef(false);
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (!startedAt || done) return;
    const interval = window.setInterval(() => forceTick((t) => t + 1), 100);
    return () => window.clearInterval(interval);
  }, [startedAt, done]);

  // Shared clock — determines what light EVERYONE sees right now, in
  // real-time sync. Deliberately still tied to startedAt, not
  // myStartTime — this part of the original design was correct and
  // isn't what caused the reported bug.
  const elapsedMs = startedAt ? Date.now() - startedAt : 0;
  const current = lightAt(schedule, elapsedMs);
  const isGreen = current?.type === "green";
  // A brief heads-up before red actually starts — still fully green/safe
  // gameplay-wise (the underlying segment type hasn't changed, so a tap
  // here still scores normally), just a visual cue that red is coming so
  // it doesn't feel like an instant, unpredictable switch.
  const isWarning = isGreen && current.endMs - elapsedMs <= WARNING_WINDOW_MS;
  // Personal clock — this player's own elapsed time, used ONLY for
  // scoring (see finishedAt above and the reportScore call below).
  // Clamped to never go below zero — a device's own clock can drift or
  // auto-correct mid-session (rare, but real — this is exactly what
  // produced an inflated score bigger than FINISH_BASE itself for one
  // player: their finish-time subtraction went negative, which
  // INCREASES the reported value instead of decreasing it). Elapsed
  // time genuinely can't be negative in reality, so clamping here
  // closes that off regardless of why the clock moved.
  const myElapsedMs = myStartTime ? Math.max(0, Date.now() - myStartTime) : 0;

  const tap = () => {
    if (done) return;
    if (isGreen) {
      setFlash("safe");
      window.setTimeout(() => setFlash((f) => (f === "safe" ? null : f)), 150);
      setScore((s) => {
        const next = s + 1;
        if (next >= TARGET_SCORE) {
          setFinishedAt(myElapsedMs);
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
    // Math.max floors at TARGET_SCORE + 1, not just 1 — a finisher's
    // score must always exceed the highest possible partial-progress
    // score (capped at TARGET_SCORE - 1, since reaching TARGET_SCORE
    // itself IS finishing), so even in the floor case, finishing still
    // outright beats anyone who didn't, exactly as FINISH_BASE's own
    // comment above promises.
    const value = finishedAt != null ? Math.max(TARGET_SCORE + 1, FINISH_BASE - finishedAt) : score;
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

  if (!startedAt || !myStartTime) {
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
        background: isWarning ? "#ffd700" : isGreen ? "#00ff9d" : "#ff3860",
        boxShadow: `0 0 30px ${isWarning ? "#ffd700" : isGreen ? "#00ff9d" : "#ff3860"}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 13, fontWeight: 900, color: "#05010f", fontFamily: "'Orbitron', 'Segoe UI', sans-serif",
        transition: "background 0.15s",
      }}>
        {isWarning ? "GET READY" : isGreen ? "GO" : "STOP"}
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
        Tap fast on green. Yellow means red's about to start. Tap on red and you lose a life. First to {TARGET_SCORE} wins outright.
      </p>
    </Card>
  );
}
