import { useState, useEffect } from "react";
import {
  subscribeChariots, tickChariots, getOutsideIds, placementOrder,
  STOP_DURATION_MS, STOP_THRESHOLD,
} from "../../lib/games/chariotsData";

// How long before the Battle's own outer timer actually ends the
// challenge that this TV starts its 1st/2nd/3rd reveal — see this
// component's own reasoning below on why the reveal has to live here
// (and in ChariotsPlayer.jsx) rather than after challenge.active goes
// false: pages/display.jsx unmounts this whole component the instant
// that happens (BattleComponent = challenge?.active ? ... : null), so
// there's no later moment left to show anything in. Counting down
// from round.phaseEndsAt — the same real timestamp every other timed
// Big Screen game's own display already reads for its own countdown —
// is what lets every phone and the TV land on the exact same reveal
// window without any extra round-trip.
const REVEAL_LEAD_MS = 10000;

// ─── Big Screen: Chariots of Conspire ───
// See lib/games/chariotsData.js for the full mechanic. Three chariots,
// one seat each — riders just wait it out, everyone else pulls to
// speed up the next stop or searches bushes for a rein once one
// arrives. Which chariot is 1st/2nd/3rd is pure spectacle, decided
// once at initChariots (placementOrder) and deliberately never shown
// until the reveal window right before the Battle ends, so nobody can
// game which seat is the "good" one.
export default function ChariotsTvDisplay({ gameId, round, players }) {
  const [state, setState] = useState(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => subscribeChariots(gameId, round.round, setState), [gameId, round.round]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => tickChariots(gameId, round.round), 500);
    return () => clearInterval(id);
  }, [gameId, round.round]);

  if (!state) return <div style={{ textAlign: "center", color: "#6b4f99", padding: 60 }}>Loading...</div>;

  const byId = {};
  (players || []).forEach((p) => (byId[p.id] = p.display_name));
  const outsideIds = getOutsideIds(state);
  const revealStart = round?.phaseEndsAt ? round.phaseEndsAt - REVEAL_LEAD_MS : null;
  const revealing = revealStart != null && now >= revealStart;

  if (revealing) {
    const elapsed = now - revealStart;
    const stage = elapsed < 2500 ? 0 : elapsed < 5500 ? 1 : elapsed < 8000 ? 2 : 3;
    const order = placementOrder(state); // order[0] = chariot index finishing 1st
    const ranked = order.map((chariotIndex, rank) => ({
      chariotIndex, rank, riderId: state.seats[chariotIndex],
    }));
    const medal = ["🥇", "🥈", "🥉"];
    const label = ["1st Place", "2nd Place", "3rd Place"];

    return (
      <div style={{ padding: 40, textAlign: "center", minHeight: "70vh" }}>
        <div style={{ fontSize: 14, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 3, marginBottom: 24 }}>
          🐎 Chariots of Conspire — The Reveal
        </div>
        {stage === 0 ? (
          <p style={{ color: "#f5f0ff", fontSize: 22, marginTop: 60 }}>The chariots are grinding to their final stop...</p>
        ) : (
          <div style={{ display: "flex", justifyContent: "center", gap: 24, flexWrap: "wrap", marginTop: 40 }}>
            {ranked.filter((r) => r.rank <= stage - 1 || (r.rank === 2 && stage >= 3)).sort((a, b) => b.rank - a.rank).map((r) => (
              <div key={r.chariotIndex} style={{
                background: "#0d0618", border: `2px solid ${r.rank === 0 ? "#c9a84c" : "#3d1f5c"}`, borderRadius: 16,
                padding: "24px 32px", minWidth: 200,
                boxShadow: r.rank === 0 ? "0 0 32px #c9a84c66" : "none",
              }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>{medal[r.rank]}</div>
                <div style={{ fontSize: 13, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 2, marginBottom: 6 }}>{label[r.rank]}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: r.rank === 0 ? "#c9a84c" : "#f5f0ff" }}>
                  {r.riderId ? byId[r.riderId] || "?" : "— empty —"}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const pct = Math.min(100, (state.progress / STOP_THRESHOLD) * 100);
  const stopSecLeft = state.phase === "stopped"
    ? Math.max(0, Math.ceil((STOP_DURATION_MS - (now - state.phaseStartedAt)) / 1000))
    : null;

  return (
    <div style={{ padding: 32, minHeight: "70vh" }}>
      <div style={{ textAlign: "center", fontSize: 14, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 3, marginBottom: 20 }}>
        🐎 Chariots of Conspire — Stop {state.stopCount}
      </div>

      <div style={{ display: "flex", justifyContent: "center", gap: 20, marginBottom: 28, flexWrap: "wrap" }}>
        {state.seats.map((riderId, i) => (
          <div key={i} style={{
            background: "#0d0618", border: "2px solid #ff2d95", borderRadius: 14, padding: "18px 28px",
            minWidth: 180, textAlign: "center", boxShadow: "0 0 18px #ff2d9533",
          }}>
            <div style={{ fontSize: 26, marginBottom: 6 }}>🏛️</div>
            <div style={{ fontSize: 11, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 6 }}>Chariot {i + 1}</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#f5f0ff" }}>{riderId ? byId[riderId] || "?" : "— empty —"}</div>
          </div>
        ))}
      </div>

      {state.phase === "traveling" && (
        <div style={{ maxWidth: 700, margin: "0 auto 24px" }}>
          <div style={{ fontSize: 12, color: "#6b4f99", textAlign: "center", marginBottom: 8, textTransform: "uppercase", letterSpacing: 2 }}>
            Pulling toward the next stop
          </div>
          <div style={{ background: "#150a28", border: "1px solid #3d1f5c", borderRadius: 10, height: 22, overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg, #6b4f99, #00d9ff)", transition: "width 0.2s linear" }} />
          </div>
        </div>
      )}

      {state.phase === "stopped" && (
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <p style={{ color: "#c9a84c", fontSize: 18, fontWeight: 700, margin: "0 0 4px" }}>🛑 Stopped! Search the bushes — {stopSecLeft}s</p>
          <p style={{ color: "#6b4f99", fontSize: 13, margin: "0 0 16px" }}>2 of these bushes hide a magic rein — find one to steal a seat.</p>
          <div style={{ display: "flex", justifyContent: "center", gap: 14, flexWrap: "wrap" }}>
            {(state.bushes || []).map((bush, i) => (
              <div key={i} style={{
                width: 74, height: 74, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 30, background: bush.searchedBy ? (bush.hasRein ? "rgba(201,168,76,0.18)" : "#150a28") : "rgba(0,255,157,0.08)",
                border: `2px solid ${bush.searchedBy ? (bush.hasRein ? "#c9a84c" : "#3d1f5c") : "#00ff9d"}`,
              }}>
                {bush.searchedBy ? (bush.hasRein ? "✨" : "🌿") : "🌳"}
              </div>
            ))}
          </div>
        </div>
      )}

      {state.lastSteal && now - state.lastSteal.at < 4000 && (
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <p style={{ color: "#ff2d95", fontSize: 16, fontWeight: 700 }}>
            ✨ {byId[state.lastSteal.playerId] || "?"} used a magic rein to kick {byId[state.lastSteal.ejectedId] || "?"} out of Chariot {state.lastSteal.chariotIndex + 1}!
          </p>
        </div>
      )}

      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <div style={{ fontSize: 12, color: "#6b4f99", textAlign: "center", marginBottom: 10, textTransform: "uppercase", letterSpacing: 2 }}>
          Outside the Chariots
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
          {outsideIds.length === 0 && <p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic" }}>Everyone's riding.</p>}
          {outsideIds.map((id) => {
            const pulling = state.phase === "traveling" && state.pullClicks[id] && now - state.pullClicks[id] <= 1800;
            const holding = !!state.pendingSteals[id];
            return (
              <div key={id} style={{
                padding: "8px 14px", borderRadius: 8, fontSize: 13,
                background: holding ? "rgba(201,168,76,0.14)" : pulling ? "rgba(0,255,157,0.12)" : "#0d0618",
                border: `1px solid ${holding ? "#c9a84c" : pulling ? "#00ff9d" : "#3d1f5c"}`,
                color: holding ? "#c9a84c" : pulling ? "#00ff9d" : "#a68fd6",
              }}>
                {holding ? "✨ " : pulling ? "💪 " : ""}{byId[id] || "?"}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
