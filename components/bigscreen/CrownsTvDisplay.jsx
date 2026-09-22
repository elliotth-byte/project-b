import { useState, useEffect } from "react";
import { subscribeGameState } from "../../lib/gameStorage";
import { KEY_CHALLENGE } from "../../lib/gameState";
import { subscribeCrowns, tickCrowns, placementValue } from "../../lib/games/crownsData";
import { useCountdown } from "../games/useCountdown";

// ─── Big Screen: Crowns ───
// See lib/games/crownsData.js for the full mechanic — this only ever
// ADDS a shared view of the exact same live state the phone
// (components/games/CrownsPlayer.jsx) already shows each player; there
// is no separate TV-only state or mechanic here (same "one underlying
// mechanic, phone stays fully playable on its own" convention as
// components/bigscreen/LifesTapestryTvDisplay.jsx). pages/display.jsx
// never passes the live challenge object down to TV components, so —
// same as LifesTapestryTvDisplay's own header explains — this
// self-subscribes to KEY_CHALLENGE directly to get challenge.endsAt for
// both the shared countdown and this display's own belt-and-suspenders
// tick.
export default function CrownsTvDisplay({ gameId, round, players }) {
  const [challenge, setChallenge] = useState(null);
  useEffect(() => subscribeGameState(gameId, KEY_CHALLENGE, setChallenge), [gameId]);

  const [state, setState] = useState(null);
  useEffect(() => subscribeCrowns(gameId, round.round, setState), [gameId, round.round]);

  const { remainingSec } = useCountdown(challenge?.endsAt);

  useEffect(() => {
    if (!state || state.gameEnded || !challenge?.endsAt) return;
    const id = setInterval(() => tickCrowns(gameId, round.round, challenge.endsAt), 1000);
    return () => clearInterval(id);
  }, [gameId, round.round, state?.gameEnded, challenge?.endsAt]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!state) return <div style={{ textAlign: "center", color: "#6b4f99", padding: 60 }}>Loading...</div>;

  const byId = {};
  (players || []).forEach((p) => (byId[p.id] = p.display_name));
  const crownById = (id) => state.crownDefs?.find((c) => c.id === id);
  // Checklist progress (everHeld), not current holdings, is what
  // actually decides the battle — see lib/games/crownsData.js's header.
  const leaderboard = [...state.participantIds].sort((a, b) => (state.everHeld?.[b]?.length || 0) - (state.everHeld?.[a]?.length || 0));
  const recentTrades = state.tradeLog.slice(-10).reverse();

  if (state.gameEnded) {
    const ranking = [...state.participantIds].sort((a, b) => placementValue(state, b) - placementValue(state, a));
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <div style={{ fontSize: 14, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 3, marginBottom: 12 }}>👑 Crowns — Battle Complete</div>
        <p style={{ fontSize: 26, color: "#c9a84c", fontWeight: 800, fontFamily: "'Orbitron', 'Segoe UI', sans-serif", margin: "0 0 8px" }}>
          {state.endReason === "fullset"
            ? `👑 ${byId[state.winnerId] || "?"} completed their checklist!`
            : `👑 ${byId[state.winnerId] || "?"} collected the most crowns when time ran out!`}
        </p>
        <div style={{ display: "grid", gap: 8, maxWidth: 460, margin: "20px auto 0" }}>
          {ranking.map((id, i) => (
            <div key={id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0d0618", borderRadius: 8, padding: "10px 16px", border: `1px solid ${i === 0 ? "#c9a84c" : "#3d1f5c"}` }}>
              <span style={{ color: "#f5f0ff", fontSize: 15 }}>{i === 0 ? "👑 " : ""}{byId[id] || "?"}</span>
              <span style={{ color: "#ffd700", fontWeight: 800, fontSize: 16 }}>{state.everHeld?.[id]?.length || 0}/{state.totalCrowns} collected</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 40, display: "grid", gridTemplateColumns: "1fr 340px", gap: 32, minHeight: "70vh", alignItems: "start" }}>
      <div>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 14, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 3 }}>👑 Crowns</div>
          <p style={{ color: "#a68fd6", fontSize: 13, marginTop: 6 }}>First to have EVER held every crown wins — it's a checklist, not who's holding what right now.</p>
          {remainingSec != null && (
            <div style={{ marginTop: 10, fontSize: 20, color: remainingSec <= 30 ? "#ff3860" : "#f5f0ff", fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
              ⏱ {Math.floor(remainingSec / 60)}:{String(remainingSec % 60).padStart(2, "0")}
            </div>
          )}
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          {leaderboard.map((id) => {
            const everHeldIds = state.everHeld?.[id] || [];
            const pct = state.totalCrowns ? Math.round((everHeldIds.length / state.totalCrowns) * 100) : 0;
            return (
              <div key={id} style={{ background: "#0d0618", borderRadius: 10, padding: "10px 16px", border: "1px solid #3d1f5c" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ color: "#f5f0ff", fontSize: 15, fontWeight: 700 }}>{byId[id] || "?"}</span>
                  <span style={{ color: "#00ff9d", fontSize: 13, fontWeight: 700 }}>{everHeldIds.length}/{state.totalCrowns} collected</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: "#1c1030", overflow: "hidden", marginBottom: 8 }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: "linear-gradient(90deg, #ff2d95, #ffd700)" }} />
                </div>
                {/* ─── Checklist grid: every crown in the set, marked once this player has EVER held it — the win-relevant view ─── */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
                  {(state.crownDefs || []).map((c) => {
                    const got = everHeldIds.includes(c.id);
                    return (
                      <div key={c.id} title={c.name} style={{
                        position: "relative", width: 22, height: 22, borderRadius: 5,
                        background: got ? `${c.color}33` : "#1c1030",
                        border: `1px solid ${got ? c.color : "#3d1f5c"}`, opacity: got ? 1 : 0.35,
                      }}>
                        <img src={c.dataUri} alt="" width={20} height={20} style={{ display: "block" }} />
                      </div>
                    );
                  })}
                </div>
                <div style={{ fontSize: 10, color: "#6b4f99", marginBottom: 3 }}>Holding right now:</div>
                <div>
                  {(state.holdings[id] || []).map((cid) => {
                    const c = crownById(cid);
                    if (!c) return null;
                    return (
                      <span key={cid} style={{
                        display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, padding: "3px 8px 3px 4px", borderRadius: 8,
                        background: `${c.color}22`, border: `1px solid ${c.color}`, color: "#f5f0ff", margin: "2px 4px 0 0",
                      }}>
                        <img src={c.dataUri} alt="" width={14} height={14} style={{ display: "block" }} />
                        {c.name}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 14, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>Trade Feed</div>
        <div style={{ display: "grid", gap: 8 }}>
          {recentTrades.length === 0 && <p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic" }}>No trades yet...</p>}
          {recentTrades.map((t, i) => {
            const offered = crownById(t.offeredCrownId);
            const requested = crownById(t.requestedCrownId);
            return (
              <div key={i} style={{ background: "#0d0618", borderRadius: 8, padding: "8px 12px", border: "1px solid #3d1f5c" }}>
                <p style={{ fontSize: 12, color: "#f5f0ff", margin: 0 }}>
                  {t.gift
                    ? <>🎁 {byId[t.fromId] || "?"} → {byId[t.toId] || "?"}</>
                    : <>🔁 {byId[t.fromId] || "?"} ⇄ {byId[t.toId] || "?"}</>}
                </p>
                <p style={{ fontSize: 11, color: "#a68fd6", margin: "4px 0 0", display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                  {offered && <img src={offered.dataUri} alt="" width={13} height={13} />}
                  {offered?.name}
                  {!t.gift && requested && (
                    <>
                      {" ↔ "}
                      <img src={requested.dataUri} alt="" width={13} height={13} />
                      {requested.name}
                    </>
                  )}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
