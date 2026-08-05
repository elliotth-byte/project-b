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
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (days > 0) return `${days}d ${hours}h ${m}m`;
  if (hours > 0) return `${hours}h ${m}m`;
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
    <Card style={{ textAlign: "center", borderColor: overdue ? "rgba(255,56,96,0.5)" : "rgba(255,45,149,0.3)" }}>
      <div style={{ display: "flex", justifyContent: "center", gap: 10, alignItems: "center", marginBottom: 4 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: "#f5f0ff", fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
          {PHASE_LABEL[round.phase] || round.phase}
        </span>
        <Badge>Round {round.round}</Badge>
        {round.finalFour && <Badge color="#ff3860">Final Four</Badge>}
        {round.doubleElimination && <Badge color="#ff3860">Double Elimination</Badge>}
      </div>
      {round.phaseEndsAt ? (
        <div style={{ fontSize: 28, fontWeight: 700, color: overdue ? "#ff3860" : "#ff2d95", fontFamily: "'Courier New', monospace" }}>
          {overdue ? "Time's up" : formatRemaining(remaining)}
        </div>
      ) : (
        <div style={{ fontSize: 20, fontWeight: 700, color: "#ff2d95", fontFamily: "'Courier New', monospace" }}>∞ No Time Limit</div>
      )}
      {overdue && (
        <p style={{ color: "#a68fd6", fontSize: 12, fontStyle: "italic", margin: "4px 0 0" }}>
          Advancing automatically once everything for this phase is in...
        </p>
      )}
    </Card>
  );
}
