import { useState, useEffect } from "react";
import { subscribeLaurelThief, STARTING_LAURELS } from "../../lib/games/laurelThiefData";
import { LaurelIcon } from "../games/LaurelIcon";

// ─── Big Screen: Laurel Thief ───
// See lib/games/laurelThiefData.js for the shared engine. This is the
// live picture the whole room watches — everyone's current laurel
// count and the recent-steals feed — while each phone
// (components/games/LaurelThiefTvPlayer.jsx) stays pure input: a grid
// of other players to tap, nothing else. Same TV-shows-everything,
// phone-is-input split every other Big Screen battle in this app
// follows.
export default function LaurelThiefTvDisplay({ gameId, round, players }) {
  const [state, setState] = useState(null);

  useEffect(() => subscribeLaurelThief(gameId, round.round, setState), [gameId, round.round]);

  if (!state) return <div style={{ textAlign: "center", color: "#6b4f99", padding: 60 }}>Loading...</div>;

  const byId = {};
  (players || []).forEach((p) => (byId[p.id] = p.display_name));
  const standings = Object.entries(state.laurels).sort((a, b) => b[1] - a[1]);
  const alive = standings.filter(([, amt]) => amt > 0);

  return (
    <div style={{ padding: 40, minHeight: "70vh" }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ fontSize: 14, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 3 }}>🌿 Laurel Thief — {alive.length} still holding laurels</div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "center", marginBottom: 32 }}>
        {standings.map(([id, amt], i) => (
          <div key={id} style={{
            background: "#0d0618", border: `2px solid ${amt === 0 ? "#3d1f5c" : i === 0 ? "#ffd700" : "#3d8a4a"}`, borderRadius: 14,
            padding: "16px 24px", textAlign: "center", minWidth: 130, opacity: amt === 0 ? 0.45 : 1,
          }}>
            <div style={{ fontSize: 16, color: "#f5f0ff", fontWeight: 700, marginBottom: 8, textDecoration: amt === 0 ? "line-through" : "none" }}>
              {amt === 0 && i === standings.length - 1 ? "" : (amt > 0 && i === 0) ? "👑 " : ""}{byId[id] || "?"}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 26, fontWeight: 800, color: "#4caf5f", fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
              <LaurelIcon size={28} /> {amt}
            </div>
          </div>
        ))}
      </div>
      {state.recentSteals.length > 0 && (
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 13, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Live thefts</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center", maxWidth: 900, margin: "0 auto" }}>
            {[...state.recentSteals].reverse().slice(0, 8).map((s, i) => (
              <div key={i} style={{ fontSize: 14, color: "#a68fd6", background: "#0d0618", borderRadius: 8, padding: "6px 14px", opacity: 1 - i * 0.1 }}>
                <strong style={{ color: "#ff3860" }}>{byId[s.stealerId] || "?"}</strong> stole from <strong style={{ color: "#f5f0ff" }}>{byId[s.victimId] || "?"}</strong>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
