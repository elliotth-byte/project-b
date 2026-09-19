import { useState, useEffect } from "react";
import { subscribeTartarusTreadmill, tickTartarusTreadmill, TARTARUS_LANE_LENGTH } from "../../lib/games/tartarusTreadmillData";

// ─── Big Screen: Tartarus Treadmill ───
// See lib/games/tartarusTreadmillData.js for the full mechanic. The
// lane is drawn once, horizontally, wall on the left (safe) and the
// drop-off on the right — every alive player's own marker sits at
// their current slot, obstacles show as a warning glow for the two
// steps before they land, then a brief impact flash. Polls
// tickTartarusTreadmill on its own interval, same belt-and-suspenders
// reasoning as every other shared timed battle here.
export default function TartarusTreadmillTvDisplay({ gameId, round, players }) {
  const [state, setState] = useState(null);

  useEffect(() => subscribeTartarusTreadmill(gameId, round.round, setState), [gameId, round.round]);

  useEffect(() => {
    const id = setInterval(() => tickTartarusTreadmill(gameId, round.round), 250);
    return () => clearInterval(id);
  }, [gameId, round.round]);

  if (!state) return <div style={{ textAlign: "center", color: "#6b4f99", padding: 60 }}>Loading...</div>;

  const byId = {};
  (players || []).forEach((p) => (byId[p.id] = p.display_name));

  const lane = Array.from({ length: TARTARUS_LANE_LENGTH }, (_, i) => i);
  const obstaclesBySlot = {};
  state.obstacles.forEach((o) => { obstaclesBySlot[o.slot] = o; });
  const occupantsBySlot = {};
  Object.entries(state.positions).forEach(([id, slot]) => {
    if (!state.alive[id]) return;
    if (!occupantsBySlot[slot]) occupantsBySlot[slot] = [];
    occupantsBySlot[slot].push(id);
  });

  const survivors = Object.keys(state.alive).filter((id) => state.alive[id]);
  const eliminatedOrder = Object.entries(state.eliminatedInRound).sort((a, b) => b[1] - a[1]);

  return (
    <div style={{ padding: 40, minHeight: "70vh", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ fontSize: 14, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 3, marginBottom: 6 }}>
        🌀 Tartarus Treadmill — {survivors.length} still standing
      </div>
      <div style={{ fontSize: 13, color: state.beltDirection === 1 ? "#ff3860" : "#00ff9d", marginBottom: 24, fontWeight: 700 }}>
        Belt running {state.beltDirection === 1 ? "TOWARD Tartarus →" : "← toward safety"} — speed {state.beltSpeed}
      </div>

      <div style={{ position: "relative", width: "100%", maxWidth: 1100, height: 90, background: "#0d0618", border: "2px solid #3d1f5c", borderRadius: 12, overflow: "hidden" }}>
        {/* Safe wall marker */}
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${100 / TARTARUS_LANE_LENGTH}%`, background: "rgba(0,255,157,0.12)", borderRight: "2px solid #00ff9d" }} />
        {/* Drop-off marker */}
        <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: `${100 / TARTARUS_LANE_LENGTH}%`, background: "rgba(255,56,96,0.18)", borderLeft: "2px solid #ff3860" }} />

        {lane.map((slot) => {
          const obstacle = obstaclesBySlot[slot];
          const occupants = occupantsBySlot[slot] || [];
          const warning = obstacle && obstacle.impactStep - state.stepCount <= 2;
          return (
            <div key={slot} style={{
              position: "absolute", top: 0, bottom: 0, left: `${(slot / TARTARUS_LANE_LENGTH) * 100}%`, width: `${100 / TARTARUS_LANE_LENGTH}%`,
              borderRight: "1px solid rgba(61,31,92,0.5)", display: "flex", alignItems: "center", justifyContent: "center",
              background: warning ? "rgba(255,56,96,0.35)" : "transparent",
            }}>
              {warning && <div style={{ position: "absolute", top: 4, fontSize: 16 }}>⚠️</div>}
              {occupants.map((id, i) => (
                <div key={id} title={byId[id] || "?"} style={{
                  width: 26, height: 26, borderRadius: "50%", background: "linear-gradient(135deg, #ff2d95, #b829ff)",
                  border: "2px solid #f5f0ff", display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 800, color: "#05010f", marginLeft: i > 0 ? -8 : 0, zIndex: 10 - i,
                }}>
                  {(byId[id] || "?").slice(0, 1).toUpperCase()}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center", marginTop: 28, maxWidth: 900 }}>
        {survivors.map((id) => (
          <div key={id} style={{ fontSize: 13, padding: "6px 14px", borderRadius: 8, background: "#0d0618", border: "1px solid #ff2d95", color: "#f5f0ff" }}>
            {byId[id] || "?"}
          </div>
        ))}
      </div>

      {eliminatedOrder.length > 0 && (
        <div style={{ marginTop: 24, textAlign: "center" }}>
          <div style={{ fontSize: 11, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Fallen into Tartarus</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
            {eliminatedOrder.map(([id]) => (
              <div key={id} style={{ fontSize: 12, color: "#6b4f99", background: "#0d0618", borderRadius: 6, padding: "4px 10px", textDecoration: "line-through" }}>
                {byId[id] || "?"}
              </div>
            ))}
          </div>
        </div>
      )}

      {state.ended && (
        <div style={{ marginTop: 24, fontSize: 20, fontWeight: 800, color: "#c9a84c", fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
          {state.winnerId ? `👑 ${byId[state.winnerId] || "?"} survives the Treadmill!` : "Everyone fell — no survivors"}
        </div>
      )}
    </div>
  );
}
