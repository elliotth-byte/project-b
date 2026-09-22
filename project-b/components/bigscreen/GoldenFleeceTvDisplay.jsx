import { useState, useEffect } from "react";
import { subscribeGoldenFleece, tickGoldenFleece, HAZARDS, RELIC_VALUE } from "../../lib/games/goldenFleeceData";

const CARD_LOOK = {
  treasure: { bg: "rgba(255,215,0,0.12)", border: "#ffd700" },
  relic: { bg: "rgba(201,168,76,0.15)", border: "#c9a84c" },
  hazard: { bg: "rgba(255,56,96,0.12)", border: "#ff3860" },
};

function cardLabel(card) {
  if (card.type === "treasure") return `💰 ${card.value}`;
  if (card.type === "relic") return "🐑";
  return HAZARDS[card.hazard]?.icon || "⚠️";
}

// ─── Big Screen: The Golden Fleece ───
// See lib/games/goldenFleeceData.js for the full mechanic — this is the
// only place the shared path, the shared pot sitting on it, and who's
// still actually in the ruin ever show. A phone
// (components/games/GoldenFleecePlayer.jsx) only ever gets its own
// carried gold and the two buttons.
export default function GoldenFleeceTvDisplay({ gameId, round, players, settings }) {
  const [state, setState] = useState(null);
  useEffect(() => subscribeGoldenFleece(gameId, round.round, setState), [gameId, round.round]);

  // Same belt-and-suspenders poll as every other shared timed battle
  // here (see e.g. lib/games/wagerTriviaTvData.js's own header comment).
  useEffect(() => {
    const id = setInterval(() => tickGoldenFleece(gameId, round.round, settings), 1000);
    return () => clearInterval(id);
  }, [gameId, round.round, settings]);

  if (!state) return <div style={{ textAlign: "center", color: "#6b4f99", padding: 60 }}>Loading...</div>;

  const byId = {};
  (players || []).forEach((p) => (byId[p.id] = p.display_name));

  const decidedCount = state.activeIds.filter((id) => !!state.pendingChoices[id]).length;
  const recentPath = state.path.slice(-10);
  const leaderboard = [...state.participantIds].sort((a, b) => (state.goldTotals[b] || 0) - (state.goldTotals[a] || 0));

  if (state.gameEnded) {
    const winnerId = leaderboard[0];
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <div style={{ fontSize: 14, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 3, marginBottom: 12 }}>🐑 The Golden Fleece — Expedition Complete</div>
        {winnerId && (
          <p style={{ fontSize: 26, color: "#c9a84c", fontWeight: 800, fontFamily: "'Orbitron', 'Segoe UI', sans-serif", margin: "0 0 24px" }}>
            👑 {byId[winnerId] || "?"} brings home the most gold!
          </p>
        )}
        <div style={{ display: "grid", gap: 8, maxWidth: 400, margin: "0 auto" }}>
          {leaderboard.map((id, i) => (
            <div key={id} style={{ display: "flex", justifyContent: "space-between", background: "#0d0618", borderRadius: 8, padding: "10px 16px" }}>
              <span style={{ color: "#f5f0ff", fontSize: 15 }}>{i === 0 ? "👑 " : ""}{byId[id] || "?"}</span>
              <span style={{ color: "#ffd700", fontWeight: 800, fontSize: 16 }}>{state.goldTotals[id] || 0}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 40, display: "grid", gridTemplateColumns: "1fr 300px", gap: 32, minHeight: "70vh" }}>
      <div>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 14, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 3 }}>
            🐑 The Golden Fleece — Chamber {state.chamberNum} of {state.totalChambers}
          </div>
          <p style={{ color: "#a68fd6", fontSize: 13, marginTop: 6 }}>
            {decidedCount} of {state.activeIds.length} decided — press on or turn back
          </p>
        </div>

        <div style={{ display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap", marginBottom: 24, minHeight: 90 }}>
          {recentPath.length === 0 && <p style={{ color: "#6b4f99", fontStyle: "italic" }}>The chamber entrance stands open...</p>}
          {recentPath.map((card, i) => {
            const look = CARD_LOOK[card.type];
            return (
              <div key={i} style={{
                width: 64, height: 88, borderRadius: 8, background: look.bg, border: `2px solid ${look.border}`,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
                fontFamily: "'Orbitron', 'Segoe UI', sans-serif", color: "#f5f0ff", opacity: i === recentPath.length - 1 ? 1 : 0.55,
                boxShadow: i === recentPath.length - 1 ? `0 0 20px ${look.border}88` : "none",
              }}>
                {cardLabel(card)}
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", justifyContent: "center", gap: 20, marginBottom: 24 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 22, color: "#ffd700", fontWeight: 800 }}>{state.pathLeftoverGold}</div>
            <div style={{ fontSize: 11, color: "#6b4f99", textTransform: "uppercase" }}>Gold on the path</div>
          </div>
          {state.pathRelics > 0 && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 22, color: "#c9a84c", fontWeight: 800 }}>🐑 ×{state.pathRelics}</div>
              <div style={{ fontSize: 11, color: "#6b4f99", textTransform: "uppercase" }}>Fleece shards ({RELIC_VALUE} pts each, solo only)</div>
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap" }}>
          {Object.entries(HAZARDS).map(([id, h]) => {
            const count = state.hazardCounts[id] || 0;
            return (
              <div key={id} style={{
                fontSize: 12, padding: "6px 12px", borderRadius: 8,
                background: count >= 2 ? "rgba(255,56,96,0.2)" : count === 1 ? "rgba(255,179,71,0.1)" : "#0d0618",
                border: `1px solid ${count >= 2 ? "#ff3860" : count === 1 ? "#ffb347" : "#3d1f5c"}`,
                color: count >= 2 ? "#ff3860" : count === 1 ? "#ffb347" : "#6b4f99",
              }}>
                {h.icon} {h.label} {"●".repeat(count)}{"○".repeat(Math.max(0, 2 - count))}
              </div>
            );
          })}
        </div>

        {state.chamberLog.length > 0 && (
          <p style={{ color: "#a68fd6", fontSize: 13, textAlign: "center", marginTop: 24, fontStyle: "italic" }}>
            {state.chamberLog[state.chamberLog.length - 1]}
          </p>
        )}
      </div>

      <div>
        <div style={{ fontSize: 14, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 2, marginBottom: 12 }}>In the Chamber</div>
        <div style={{ display: "grid", gap: 8, marginBottom: 24 }}>
          {state.activeIds.map((id) => (
            <div key={id} style={{ display: "flex", justifyContent: "space-between", background: "#0d0618", borderRadius: 8, padding: "8px 12px" }}>
              <span style={{ fontSize: 13, color: "#f5f0ff" }}>{state.pendingChoices[id] ? "✅ " : ""}{byId[id] || "?"}</span>
              <span style={{ fontSize: 13, color: "#ffd700" }}>💰{state.carriedGold[id] || 0}</span>
            </div>
          ))}
          {state.activeIds.length === 0 && <p style={{ color: "#6b4f99", fontSize: 12, fontStyle: "italic" }}>Everyone's back at camp.</p>}
        </div>

        <div style={{ fontSize: 14, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 2, marginBottom: 12 }}>Banked Total</div>
        <div style={{ display: "grid", gap: 8 }}>
          {leaderboard.map((id) => (
            <div key={id} style={{ display: "flex", justifyContent: "space-between", background: "#0d0618", borderRadius: 8, padding: "8px 12px" }}>
              <span style={{ fontSize: 13, color: "#a68fd6" }}>{byId[id] || "?"}</span>
              <span style={{ fontSize: 13, color: "#00ff9d", fontWeight: 700 }}>{state.goldTotals[id] || 0}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
