import { useState, useEffect, useRef } from "react";
import { Card, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { reportScore } from "../../lib/challengeScores";
import { subscribeLaurelThief, stealLaurel, cooldownMsFor, placementValue } from "../../lib/games/laurelThiefData";

// ─── Laurel Thief — Big Screen (phone side) ───
// Pure input — a grid of other players to tap, nothing else. The
// actual picture (everyone's laurel count, the live steal feed) only
// ever shows on the shared TV (components/bigscreen/
// LaurelThiefTvDisplay.jsx) — same split every other Big Screen battle
// in this app follows.
export default function LaurelThiefTvPlayer({ gameId, round, challenge, player, players }) {
  const [state, setState] = useState(null);
  const [now, setNow] = useState(Date.now());
  const reportedRef = useRef(false);

  useEffect(() => subscribeLaurelThief(gameId, round.round, setState), [gameId, round.round]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!state) return;
    reportScore(gameId, round.round, player.id, player.name, placementValue(state, player.id), { final: false });
  }, [state?.laurels]); // eslint-disable-line react-hooks/exhaustive-deps

  const myLaurels = state?.laurels?.[player.id] || 0;
  const iAmEliminated = state && myLaurels <= 0 && state.eliminatedOrder.includes(player.id);
  useEffect(() => {
    const gameOver = !challenge?.active || iAmEliminated;
    if (gameOver && state && !reportedRef.current) {
      reportedRef.current = true;
      reportScore(gameId, round.round, player.id, player.name, placementValue(state, player.id), { final: true });
    }
  }, [challenge?.active, state, iAmEliminated]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!challenge?.active) {
    return <GameResultCard icon="🌿" title="Laurel Thief" valueLabel={`${myLaurels} laurel${myLaurels === 1 ? "" : "s"}`} />;
  }
  if (!state) return <Card style={{ marginBottom: 20, textAlign: "center" }}><p style={{ color: "#6b4f99", fontStyle: "italic" }}>Loading...</p></Card>;
  if (iAmEliminated) return <GameResultCard icon="🌿" title="Stripped of Your Laurels" valueLabel="Eliminated" />;

  const byId = {};
  (players || []).forEach((p) => (byId[p.id] = p.display_name));
  const cooldownMs = cooldownMsFor(null, true);
  const myCooldownUntil = state.cooldownUntil[player.id] || 0;
  const onCooldown = now < myCooldownUntil;
  const cooldownSecLeft = Math.ceil((myCooldownUntil - now) / 1000);

  const targets = Object.entries(state.laurels).filter(([id, amt]) => id !== player.id && amt > 0);

  const steal = (targetId) => {
    if (onCooldown) return;
    stealLaurel(gameId, round.round, player.id, targetId, cooldownMs);
  };

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🌿 Laurel Thief</h3>
        <Badge>You: {myLaurels}</Badge>
      </div>
      <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 12px" }}>Look at the big screen for the full picture — tap someone below to steal.</p>

      {onCooldown ? (
        <p style={{ color: "#ffd700", fontSize: 13, fontWeight: 700, margin: "0 0 12px" }}>Cooling down — {cooldownSecLeft}s</p>
      ) : (
        <p style={{ color: "#00ff9d", fontSize: 13, fontWeight: 700, margin: "0 0 12px" }}>Ready to steal!</p>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
        {targets.length === 0 && <p style={{ color: "#6b4f99", fontSize: 12, fontStyle: "italic", gridColumn: "1 / -1" }}>Nobody left to steal from</p>}
        {targets.map(([id]) => (
          <button
            key={id} onClick={() => steal(id)} disabled={onCooldown}
            style={{
              padding: "14px 10px", borderRadius: 10, cursor: onCooldown ? "default" : "pointer", opacity: onCooldown ? 0.5 : 1,
              background: onCooldown ? "#0d0618" : "linear-gradient(135deg, rgba(255,45,149,0.2), rgba(184,41,255,0.2))",
              border: "1px solid #3d1f5c", color: "#f5f0ff", fontSize: 13, fontWeight: 700,
            }}
          >
            {byId[id] || "?"}
          </button>
        ))}
      </div>
    </Card>
  );
}
