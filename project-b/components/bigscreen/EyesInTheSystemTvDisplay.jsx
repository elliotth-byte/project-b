import { useState, useEffect } from "react";
import { subscribeEyesTv, resolveEyesTvMatch } from "../../lib/games/eyesInTheSystemTvData";
import { EyesZone, EYE_COLORS } from "../games/EyesInTheSystemIcons";

// ─── Big Screen: Eyes in the System ───
// See lib/games/eyesInTheSystemTvData.js for the full bracket
// mechanic. The zones render here too, not just on the two
// competitors' own phones (see that file's own header comment on
// why) — this gives the rest of the room something to watch and
// second-guess along with, the actual spectacle of a head-to-head
// format like this.
export default function EyesInTheSystemTvDisplay({ gameId, round, players }) {
  const [state, setState] = useState(null);

  useEffect(() => subscribeEyesTv(gameId, round.round, setState), [gameId, round.round]);

  useEffect(() => {
    if (!state || state.winnerId || state.pendingChoice || !state.currentMatch) return;
    const id = setInterval(() => resolveEyesTvMatch(gameId, round.round), 800);
    return () => clearInterval(id);
  }, [state?.currentMatch, state?.winnerId, state?.pendingChoice, gameId, round.round]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!state) return <div style={{ textAlign: "center", color: "#6b4f99", padding: 60 }}>Loading...</div>;

  const byId = {};
  (players || []).forEach((p) => (byId[p.id] = p.display_name));

  if (state.winnerId) {
    return (
      <div style={{ minHeight: "60vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
        <div style={{ fontSize: 96, marginBottom: 20 }}>🏆</div>
        <p style={{ color: "#f5f0ff", fontSize: 48, fontWeight: 800, fontFamily: "'Orbitron', 'Segoe UI', sans-serif", margin: 0 }}>
          {byId[state.winnerId] || "?"} wins!
        </p>
      </div>
    );
  }

  if (state.pendingChoice) {
    const winnerName = byId[state.pendingChoice.winnerId] || "?";
    return (
      <div style={{ padding: 40, textAlign: "center", minHeight: "60vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
        <div style={{ fontSize: 60, marginBottom: 16 }}>👁</div>
        <p style={{ color: "#f5f0ff", fontSize: 30, fontWeight: 700, margin: "0 0 10px" }}>{winnerName} won the last face-off!</p>
        <p style={{ color: "#a68fd6", fontSize: 16 }}>Choosing who faces off next on their own phone...</p>
        <div style={{ marginTop: 28 }}>
          <div style={{ fontSize: 13, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Still in it</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", maxWidth: 700 }}>
            {state.remainingPlayerIds.map((id) => (
              <div key={id} style={{ fontSize: 14, color: "#f5f0ff", background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 8, padding: "6px 14px" }}>
                {byId[id] || "?"}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const match = state.currentMatch;
  return (
    <div style={{ padding: 40, minHeight: "70vh" }}>
      <div style={{ textAlign: "center", marginBottom: 6 }}>
        <div style={{ fontSize: 14, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 3 }}>👁 Eyes in the System — Match {state.matchNumber}</div>
        <p style={{ color: "#f5f0ff", fontSize: 26, fontWeight: 700, margin: "6px 0 4px", fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
          {byId[match.playerAId] || "?"} <span style={{ color: "#6b4f99" }}>vs</span> {byId[match.playerBId] || "?"}
        </p>
        <p style={{ color: "#a68fd6", fontSize: 15, margin: 0 }}>
          Which zone has the most <strong style={{ color: EYE_COLORS[match.round.targetColor] }}>{match.round.targetColor}</strong> eyes?
        </p>
      </div>
      <div style={{ display: "flex", gap: 20, justifyContent: "center", flexWrap: "wrap", marginTop: 24 }}>
        {match.round.zones.map((zone) => <EyesZone key={zone.zone} zone={zone} size={220} />)}
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 24, marginTop: 24 }}>
        {[match.playerAId, match.playerBId].map((id) => {
          const ans = match.answers[id];
          return (
            <div key={id} style={{ fontSize: 14, color: ans ? (ans.correct ? "#00ff9d" : "#ff3860") : "#a68fd6" }}>
              {byId[id] || "?"}: {ans ? (ans.correct ? "✅ Correct!" : `❌ Zone ${ans.zone}`) : "thinking..."}
            </div>
          );
        })}
      </div>
    </div>
  );
}
