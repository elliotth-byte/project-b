import { useState, useEffect, useRef } from "react";
import { Card, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { useCountdown } from "./useCountdown";
import { reportScore } from "../../lib/challengeScores";

const HOLES = 9;

export default function WhackMolePlayer({ gameId, round, challenge, player }) {
  const { remainingSec, timeUp } = useCountdown(challenge?.endsAt);
  const [activeHole, setActiveHole] = useState(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const reportedRef = useRef(false);
  const popTimerRef = useRef(null);

  useEffect(() => {
    if (timeUp) return;
    const scheduleNext = () => {
      const delay = 500 + Math.random() * 700;
      popTimerRef.current = window.setTimeout(() => {
        setActiveHole(Math.floor(Math.random() * HOLES));
        scheduleNext();
      }, delay);
    };
    scheduleNext();
    return () => window.clearTimeout(popTimerRef.current);
  }, [timeUp]);

  useEffect(() => {
    reportScore(gameId, round.round, player.id, player.name, score, { final: false });
  }, [score]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (timeUp && !reportedRef.current) {
      reportedRef.current = true;
      setDone(true);
      reportScore(gameId, round.round, player.id, player.name, score, { final: true });
    }
  }, [timeUp]); // eslint-disable-line react-hooks/exhaustive-deps

  const whack = (i) => {
    if (i !== activeHole) return;
    setScore((s) => s + 1);
    setActiveHole(null);
  };

  if (done) return <GameResultCard icon="🔨" title="Time's Up" valueLabel={`${score} whacks`} />;

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h3 style={{ color: "#c9a84c", margin: 0, fontSize: 15, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>🔨 Whack-a-Mole</h3>
        <Badge color={remainingSec <= 10 ? "#c45c3c" : "#c9a84c"}>{remainingSec}s · {score} pts</Badge>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 70px)", gap: 8, margin: "0 auto", width: "fit-content" }}>
        {Array.from({ length: HOLES }).map((_, i) => (
          <button key={i} onClick={() => whack(i)} style={{
            width: 70, height: 70, borderRadius: "50%", fontSize: 32, cursor: "pointer",
            background: "#0a1020", border: "3px solid #253550", overflow: "hidden",
          }}>
            {activeHole === i ? "🐹" : ""}
          </button>
        ))}
      </div>
    </Card>
  );
}
