import { useState, useEffect, useRef } from "react";
import { Card, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { useCountdown } from "./useCountdown";
import { reportScore } from "../../lib/challengeScores";
import { MAX_BALLS, BALL_ADD_INTERVAL_MS, makeBall, isCatchable, hasExited } from "../../lib/games/simmotionData";

export default function SimmotionPlayer({ gameId, challenge, round, player }) {
  const { timeUp } = useCountdown(challenge?.endsAt);
  const stateRef = useRef({ balls: [], nextBallId: 0, lastBallAddedAt: 0 });
  const [phase, setPhase] = useState("ready"); // "ready" | "playing" | "over"
  const [score, setScore] = useState(0);
  const [flash, setFlash] = useState(null); // "left-catch" | "right-catch" | "miss" | null
  const reportedRef = useRef(false);
  const [, forceTick] = useState(0);

  const startGame = () => {
    const now = Date.now();
    stateRef.current = { balls: [makeBall(0, now)], nextBallId: 1, lastBallAddedAt: now };
    setScore(0);
    setPhase("playing");
  };

  useEffect(() => {
    if (phase !== "playing") return;
    let raf;
    const loop = () => {
      const now = Date.now();
      const st = stateRef.current;

      if (st.balls.some((b) => hasExited(b, now))) {
        setFlash("miss");
        setPhase("over");
        return;
      }

      if (st.balls.length < MAX_BALLS && now - st.lastBallAddedAt >= BALL_ADD_INTERVAL_MS) {
        st.balls = [...st.balls, makeBall(st.nextBallId, now)];
        st.nextBallId += 1;
        st.lastBallAddedAt = now;
      }

      forceTick((t) => t + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  useEffect(() => {
    if (timeUp && phase === "playing") setPhase("over");
  }, [timeUp, phase]);

  const catchSide = (side) => {
    if (phase !== "playing") return;
    const now = Date.now();
    const st = stateRef.current;
    const idx = st.balls.findIndex((b) => b.side === side && isCatchable(b, now));
    if (idx === -1) return; // nothing catchable on that side right now — silently ignored, not a penalty
    st.balls = st.balls.map((b, i) => (i === idx ? makeBall(b.id, now) : b));
    setScore((s) => s + 1);
    setFlash(side === "left" ? "left-catch" : "right-catch");
    window.setTimeout(() => setFlash((f) => (f?.endsWith("catch") ? null : f)), 150);
  };

  useEffect(() => {
    if (phase !== "over" || reportedRef.current) return;
    reportedRef.current = true;
    reportScore(gameId, round.round, player.id, player.name, score, { final: true });
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  if (phase === "over") {
    return <GameResultCard icon="🥎" title={timeUp && score > 0 ? "Time's Up — Still Standing!" : "Dropped!"} valueLabel={`${score} catches`} />;
  }

  if (phase === "ready") {
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <h3 style={{ color: "#ff2d95", margin: "0 0 8px", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🥎 Simmotion</h3>
        <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 14px" }}>
          Catch each ball on the side it's about to exit, then it goes right back in. Miss one and you're out. More balls join as you go — up to {MAX_BALLS} at once.
        </p>
        <button onClick={startGame} style={{
          padding: "10px 24px", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 700,
          background: "linear-gradient(135deg, #ff2d95, #b829ff)", border: "none", color: "#05010f",
          fontFamily: "'Orbitron', 'Segoe UI', sans-serif",
        }}>Start</button>
      </Card>
    );
  }

  const now = Date.now();
  const balls = stateRef.current.balls;
  const forSide = (side) => balls.filter((b) => b.side === side);

  const renderSide = (side) => {
    const sideBalls = forSide(side);
    const flashing = flash === `${side}-catch`;
    return (
      <button
        onClick={() => catchSide(side)}
        style={{
          flex: 1, minHeight: 160, borderRadius: 12, cursor: "pointer", position: "relative",
          background: flashing ? "rgba(0,255,157,0.15)" : "#0d0618", border: `2px solid ${flashing ? "#00ff9d" : "#3d1f5c"}`,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", padding: "10px 6px", gap: 8,
        }}
      >
        <span style={{ position: "absolute", top: 8, fontSize: 11, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 1 }}>
          {side === "left" ? "◀ Left" : "Right ▶"}
        </span>
        {sideBalls.map((b) => {
          const progress = Math.min(1, (now - b.droppedAt) / (b.exitsAt - b.droppedAt));
          const catchable = isCatchable(b, now);
          return (
            <div key={b.id} style={{ width: "100%", position: "relative" }}>
              <div style={{ width: "100%", height: 10, borderRadius: 6, background: "#1a0a2e", overflow: "hidden" }}>
                <div style={{
                  width: `${progress * 100}%`, height: "100%",
                  background: catchable ? "#ff3860" : "#ff2d95",
                  transition: "width 0.05s linear",
                }} />
              </div>
              <div style={{ fontSize: 22, marginTop: 4 }}>{catchable ? "⚠️" : "🥎"}</div>
            </div>
          );
        })}
      </button>
    );
  };

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🥎 Simmotion</h3>
        <Badge>{score} catches · {balls.length}/{MAX_BALLS} balls</Badge>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {renderSide("left")}
        {renderSide("right")}
      </div>
      <p style={{ color: "#6b4f99", fontSize: 11, marginTop: 10, fontStyle: "italic" }}>
        Tap a side the instant its ball flashes ⚠️ — too early does nothing, too late and it's dropped.
      </p>
    </Card>
  );
}
