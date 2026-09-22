import { useState, useEffect } from "react";
import { subscribeGameState } from "../../lib/gameStorage";
import { KEY_CHALLENGE } from "../../lib/gameState";
import { subscribePoseidonsPool, tickPoseidonsPool, placementValue } from "../../lib/games/poseidonsPoolData";
import PoseidonsPoolTable from "../games/PoseidonsPoolTable";
import { useCountdown } from "../games/useCountdown";

// ─── Big Screen: Poseidon's Pool ───
// The shared table, live, large — every ball, every pocket, the most
// recent shot's replay, an elimination feed, and each remaining
// player's own cooldown status. pages/display.jsx never passes the live
// challenge object down to TV components, so — same as
// CrownsTvDisplay.jsx's own header explains — this self-subscribes to
// KEY_CHALLENGE directly to get challenge.endsAt for both the shared
// countdown and this display's own belt-and-suspenders tick.
export default function PoseidonsPoolTvDisplay({ gameId, round, players }) {
  const [challenge, setChallenge] = useState(null);
  useEffect(() => subscribeGameState(gameId, KEY_CHALLENGE, setChallenge), [gameId]);

  const [state, setState] = useState(null);
  useEffect(() => subscribePoseidonsPool(gameId, round.round, setState), [gameId, round.round]);

  const { remainingSec } = useCountdown(challenge?.endsAt);

  useEffect(() => {
    if (!state || state.gameEnded || !challenge?.endsAt) return;
    const id = setInterval(() => tickPoseidonsPool(gameId, round.round, challenge.endsAt), 700);
    return () => clearInterval(id);
  }, [gameId, round.round, state?.gameEnded, challenge?.endsAt]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!state) return <div style={{ textAlign: "center", color: "#6b4f99", padding: 60 }}>Loading...</div>;

  const byId = {};
  (players || []).forEach((p) => (byId[p.id] = p.display_name));

  if (state.gameEnded) {
    const ranking = [...state.participantIds].sort((a, b) => placementValue(state, b) - placementValue(state, a));
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <div style={{ fontSize: 14, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 3, marginBottom: 12 }}>🎱 Poseidon's Pool — Battle Complete</div>
        <p style={{ fontSize: 26, color: "#c9a84c", fontWeight: 800, fontFamily: "'Orbitron', 'Segoe UI', sans-serif", margin: "0 0 8px" }}>
          {state.winnerIds.length > 1
            ? `🌊 Shared victory: ${state.winnerIds.map((id) => byId[id] || "?").join(" & ")}!`
            : `🌊 ${byId[state.winnerIds[0]] || "?"} clears the table!`}
        </p>
        <PoseidonsPoolTable state={state} width={520} />
        <div style={{ display: "grid", gap: 8, maxWidth: 460, margin: "20px auto 0" }}>
          {ranking.map((id, i) => (
            <div key={id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0d0618", borderRadius: 8, padding: "10px 16px", border: `1px solid ${state.winnerIds.includes(id) ? "#c9a84c" : "#3d1f5c"}` }}>
              <span style={{ color: "#f5f0ff", fontSize: 15 }}>
                <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", background: state.ballDefs[id]?.color, marginRight: 8 }} />
                {state.winnerIds.includes(id) ? "🏆 " : ""}{byId[id] || "?"}
              </span>
              <span style={{ color: "#ffd700", fontWeight: 800, fontSize: 14 }}>
                {state.winnerIds.includes(id) ? "Winner" : `Sunk #${state.eliminatedOrder.indexOf(id) + 1}`}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const aliveIds = state.participantIds.filter((id) => !state.balls[id].eliminated);
  const recentShots = state.shotLog.slice(-8).reverse();
  const now = Date.now();

  return (
    <div style={{ padding: 40, display: "grid", gridTemplateColumns: "1fr 360px", gap: 32, minHeight: "70vh", alignItems: "start" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 14, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 3 }}>🎱 Poseidon's Pool</div>
        <p style={{ color: "#a68fd6", fontSize: 13, marginTop: 6 }}>Knock another player's ball into a pocket to eliminate them. Last ball standing wins.</p>
        {remainingSec != null && (
          <div style={{ marginTop: 6, fontSize: 20, color: remainingSec <= 30 ? "#ff3860" : "#f5f0ff", fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
            ⏱ {Math.floor(remainingSec / 60)}:{String(remainingSec % 60).padStart(2, "0")}
          </div>
        )}
        <div style={{ marginTop: 16 }}>
          <PoseidonsPoolTable state={state} width={640} />
        </div>
        {state.queue.length > 0 && (
          <p style={{ color: "#6b4f99", fontSize: 12, marginTop: 10, fontStyle: "italic" }}>{state.queue.length} shot{state.queue.length === 1 ? "" : "s"} queued up...</p>
        )}
      </div>

      <div>
        <div style={{ fontSize: 14, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>Players ({aliveIds.length} left)</div>
        <div style={{ display: "grid", gap: 8, marginBottom: 24 }}>
          {state.participantIds.map((id) => {
            const eliminated = state.balls[id]?.eliminated;
            const cooldownLeftMs = Math.max(0, (state.cooldownUntil?.[id] || 0) - now);
            const ready = !eliminated && cooldownLeftMs <= 0;
            return (
              <div key={id} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0d0618", borderRadius: 8,
                padding: "8px 14px", border: `1px solid ${eliminated ? "#3d1f5c" : ready ? "#00ff9d" : "#3d1f5c"}`, opacity: eliminated ? 0.5 : 1,
              }}>
                <span style={{ color: "#f5f0ff", fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ display: "inline-block", width: 14, height: 14, borderRadius: "50%", background: state.ballDefs[id]?.color }} />
                  {byId[id] || "?"}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: eliminated ? "#ff3860" : ready ? "#00ff9d" : "#a68fd6" }}>
                  {eliminated ? "Sunk" : ready ? "Ready" : `${Math.ceil(cooldownLeftMs / 1000)}s`}
                </span>
              </div>
            );
          })}
        </div>

        <div style={{ fontSize: 14, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>Shot Feed</div>
        <div style={{ display: "grid", gap: 8 }}>
          {recentShots.length === 0 && <p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic" }}>No shots yet...</p>}
          {recentShots.map((s, i) => (
            <div key={i} style={{ background: "#0d0618", borderRadius: 8, padding: "8px 12px", border: "1px solid #3d1f5c" }}>
              <p style={{ fontSize: 12, color: "#f5f0ff", margin: 0 }}>
                {byId[s.playerId] || "?"} {s.sunkIds.length ? `sank ${s.sunkIds.map((id) => byId[id] || "?").join(", ")}` : "— nothing sunk"}
                {s.selfScratch ? " 💀 scratch!" : ""}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
