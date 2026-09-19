import { useState, useEffect, useRef } from "react";
import { Card, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { reportScore } from "../../lib/challengeScores";
import { subscribeLaurelThief, stealLaurel, cooldownMsFor, placementValue, STARTING_LAURELS } from "../../lib/games/laurelThiefData";
import { LaurelIcon } from "./LaurelIcon";

// ─── Laurel Thief (normal mode) ───
// Everything shows right here on the phone — everyone's current
// laurel count, the recent-steals feed, the tap-to-steal target list
// — since there's no shared TV in a normal battle for any of that to
// live on instead (see components/bigscreen/LaurelThiefTvDisplay.jsx
// for the Big Screen split, where that same picture moves to the
// shared screen and this component's own counterpart becomes pure
// input). Same lib/games/laurelThiefData.js engine either way, just a
// different cooldown (see that file's own cooldownMsFor) scaled to
// this battle's actual duration.
export default function LaurelThiefPlayer({ gameId, round, challenge, player, players, settings }) {
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
  const cooldownMs = cooldownMsFor(settings?.challengeDurationSec, false);
  const myCooldownUntil = state.cooldownUntil[player.id] || 0;
  const onCooldown = now < myCooldownUntil;
  const cooldownSecLeft = Math.ceil((myCooldownUntil - now) / 1000);

  const targets = Object.entries(state.laurels)
    .filter(([id, amt]) => id !== player.id && amt > 0)
    .sort((a, b) => b[1] - a[1]);
  const leaderboard = Object.entries(state.laurels).sort((a, b) => b[1] - a[1]);

  const steal = (targetId) => {
    if (onCooldown) return;
    stealLaurel(gameId, round.round, player.id, targetId, cooldownMs);
  };

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🌿 Laurel Thief</h3>
        <Badge>{myLaurels} of {STARTING_LAURELS}</Badge>
      </div>

      {onCooldown ? (
        <p style={{ color: "#ffd700", fontSize: 13, fontWeight: 700, margin: "0 0 12px" }}>Cooling down — {cooldownSecLeft}s until your next steal</p>
      ) : (
        <p style={{ color: "#00ff9d", fontSize: 13, fontWeight: 700, margin: "0 0 12px" }}>Tap a player below to steal a laurel</p>
      )}

      <div style={{ display: "grid", gap: 6, marginBottom: 16, maxHeight: 220, overflowY: "auto" }}>
        {targets.length === 0 && <p style={{ color: "#6b4f99", fontSize: 12, fontStyle: "italic" }}>Nobody left to steal from</p>}
        {targets.map(([id, amt]) => (
          <button
            key={id} onClick={() => steal(id)} disabled={onCooldown}
            style={{
              display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 14px",
              borderRadius: 8, cursor: onCooldown ? "default" : "pointer", opacity: onCooldown ? 0.5 : 1,
              background: "#0d0618", border: "1px solid #3d1f5c", color: "#f5f0ff", fontSize: 13,
            }}
          >
            <span>{byId[id] || "?"}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}><LaurelIcon size={16} /> {amt}</span>
          </button>
        ))}
      </div>

      <div style={{ borderTop: "1px solid #3d1f5c", paddingTop: 12 }}>
        <div style={{ fontSize: 11, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Standings</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", marginBottom: 12 }}>
          {leaderboard.map(([id, amt]) => (
            <div key={id} style={{
              fontSize: 12, padding: "3px 10px", borderRadius: 8,
              background: id === player.id ? "rgba(255,45,149,0.15)" : "#0d0618",
              border: `1px solid ${id === player.id ? "#ff2d95" : amt === 0 ? "#3d1f5c" : "#3d1f5c"}`,
              color: amt === 0 ? "#6b4f99" : "#f5f0ff", textDecoration: amt === 0 ? "line-through" : "none",
            }}>
              {byId[id] || "?"}: {amt}
            </div>
          ))}
        </div>
        {state.recentSteals.length > 0 && (
          <>
            <div style={{ fontSize: 11, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Recent thefts</div>
            <div style={{ display: "grid", gap: 4 }}>
              {[...state.recentSteals].reverse().slice(0, 5).map((s, i) => (
                <div key={i} style={{ fontSize: 11, color: "#a68fd6" }}>
                  <strong style={{ color: "#ff3860" }}>{byId[s.stealerId] || "?"}</strong> stole from <strong>{byId[s.victimId] || "?"}</strong>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
