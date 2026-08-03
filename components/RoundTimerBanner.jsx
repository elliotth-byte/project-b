import { useEffect, useState } from "react";
import { Card, Badge } from "./ui";

const PHASE_LABEL = {
  lobby: "Waiting to Begin",
  challenge: "⚔️ Challenge",
  fates: "⚖️ Fates Ceremony",
  exile: "🃏 Exile Vote",
  finale: "🔥 Finale",
  ended: "🏆 Game Over",
};

function formatRemaining(ms) {
  if (ms <= 0) return "0:00";
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function RoundTimerBanner({ round }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  if (!round) return null;

  const remaining = round.phaseEndsAt ? round.phaseEndsAt - now : null;
  const overdue = remaining !== null && remaining <= 0;

  return (
    <Card style={{ textAlign: "center", borderColor: overdue ? "rgba(196,92,60,0.5)" : "rgba(201,168,76,0.3)" }}>
      <div style={{ display: "flex", justifyContent: "center", gap: 10, alignItems: "center", marginBottom: 4 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: "#f0e6d3", fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>
          {PHASE_LABEL[round.phase] || round.phase}
        </span>
        <Badge>Round {round.round}</Badge>
        {round.finalFour && <Badge color="#c45c3c">Final Four</Badge>}
        {round.doubleElimination && <Badge color="#c45c3c">Double Elimination</Badge>}
      </div>
      {remaining !== null && (
        <div style={{ fontSize: 28, fontWeight: 700, color: overdue ? "#c45c3c" : "#c9a84c", fontFamily: "'Courier New', monospace" }}>
          {overdue ? "Time's up" : formatRemaining(remaining)}
        </div>
      )}
      {overdue && (
        <p style={{ color: "#a09080", fontSize: 12, fontStyle: "italic", margin: "4px 0 0" }}>
          Advancing automatically once everything for this phase is in...
        </p>
      )}
    </Card>
  );
}
