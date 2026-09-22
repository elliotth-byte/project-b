import { useState, useEffect } from "react";
import { subscribeScyllasStrait, tickScyllasStrait } from "../../lib/games/scyllasStraitData";

const ITEM_ICONS = { "an oar": "🚣", "a sandal": "🩴", "a shield": "🛡️", "a toga": "👘" };
const CHOOSING_WINDOW_MS = 20000;
const RESOLVED_DISPLAY_MS = 7000;

// ─── Big Screen: Scylla's Strait ───
// See lib/games/scyllasStraitData.js for the full mechanic. Discard
// piles are shown openly here on purpose — they're public, inspectable
// information in the physical Get Bit! game this reskins, the entire
// bluffing tension depends on everyone being able to see what cards an
// opponent has already burned. Only this round's live picks (state.picks
// while phase is "choosing") stay off the TV until the reveal.
export default function ScyllasStraitTvDisplay({ gameId, round, players }) {
  const [state, setState] = useState(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => subscribeScyllasStrait(gameId, round.round, setState), [gameId, round.round]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => tickScyllasStrait(gameId, round.round), 500);
    return () => clearInterval(id);
  }, [gameId, round.round]);

  if (!state) return <div style={{ textAlign: "center", color: "#6b4f90", padding: 60 }}>Loading...</div>;

  const byId = {};
  (players || []).forEach((p) => (byId[p.id] = p.display_name));

  if (state.phase === "gameOver") {
    const eliminatedOrder = Object.entries(state.eliminatedInRound).sort((a, b) => a[1] - b[1]);
    return (
      <div style={{ padding: 40, textAlign: "center", minHeight: "70vh" }}>
        <div style={{ fontSize: 14, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 3, marginBottom: 20 }}>
          🐙 Scylla's Strait
        </div>
        <div style={{ fontSize: 60, marginBottom: 12 }}>⛵</div>
        <p style={{ fontSize: 26, color: "#c9a84c", fontWeight: 800 }}>{byId[state.winnerId] || "?"} made it through the strait!</p>
        {eliminatedOrder.length > 0 && (
          <div style={{ marginTop: 28 }}>
            <div style={{ fontSize: 12, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 2, marginBottom: 10 }}>Lost to Scylla</div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              {eliminatedOrder.map(([id]) => (
                <div key={id} style={{ padding: "8px 14px", borderRadius: 8, background: "#0d0618", border: "1px solid #3d1f5c", color: "#a68fd6", fontSize: 13 }}>
                  🌊 {byId[id] || "?"}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  const windowMs = state.phase === "choosing" ? CHOOSING_WINDOW_MS : RESOLVED_DISPLAY_MS;
  const secLeft = Math.max(0, Math.ceil((windowMs - (now - state.phaseStartedAt)) / 1000));
  const pickedCount = Object.keys(state.picks || {}).length;
  const result = state.lastRoundResult;

  return (
    <div style={{ padding: 32, minHeight: "70vh" }}>
      <div style={{ textAlign: "center", fontSize: 14, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 3, marginBottom: 6 }}>
        🐙 Scylla's Strait — Round {state.phase === "resolved" && result ? result.round : state.round}
      </div>
      <div style={{ textAlign: "center", fontSize: 13, color: secLeft <= 3 ? "#ff3860" : "#6b4f99", marginBottom: 20 }}>
        {state.phase === "choosing" ? `Choosing cards — ${pickedCount}/${state.order.length} in — ${secLeft}s` : `Revealing... next round in ${secLeft}s`}
      </div>

      {state.phase === "resolved" && result && (
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
            {state.participantIds.filter((id) => result.picks[id] != null).map((id) => {
              const tied = !result.untiedIds.includes(id);
              return (
                <div key={id} style={{
                  padding: "8px 14px", borderRadius: 8, minWidth: 70,
                  background: tied ? "#150a28" : "rgba(0,255,157,0.1)",
                  border: `1px solid ${tied ? "#3d1f5c" : "#00ff9d"}`,
                }}>
                  <div style={{ fontSize: 11, color: "#a68fd6" }}>{byId[id] || "?"}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: tied ? "#6b4f99" : "#00ff9d" }}>{result.picks[id]}</div>
                  {tied && <div style={{ fontSize: 9, color: "#ff3860" }}>tied — no move</div>}
                </div>
              );
            })}
          </div>
          {result.bitten && (
            <p style={{ color: "#ff3860", fontSize: 16, fontWeight: 700 }}>
              🐙 Scylla snatches {ITEM_ICONS[result.itemLost] || ""} {result.itemLost} from {byId[result.bitten] || "?"}!
              {result.eliminated && ` ${byId[result.eliminated] || "?"} is lost to the deep!`}
            </p>
          )}
          {!result.bitten && <p style={{ color: "#a68fd6", fontSize: 14 }}>First round — no one gets bitten yet.</p>}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
        {state.order.map((id) => (
          <div key={id} style={{
            background: "#0d0618", border: "2px solid #ff2d95", borderRadius: 12, padding: "12px 14px",
            minWidth: 110, textAlign: "center",
          }}>
            <div style={{ fontSize: 24 }}>⛵</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#f5f0ff", margin: "4px 0" }}>{byId[id] || "?"}</div>
            <div style={{ fontSize: 15, marginBottom: 4 }}>
              {(state.itemsLeft[id] || []).map((item, i) => <span key={i} title={item}>{ITEM_ICONS[item] || "❔"}</span>)}
            </div>
            <div style={{ fontSize: 10, color: "#6b4f99" }}>
              hand {state.hands[id]?.length ?? 0} · discard {(state.discards[id] || []).join(", ") || "—"}
            </div>
          </div>
        ))}
        <div style={{ fontSize: 40, marginLeft: 6 }} title="Scylla">🐙</div>
      </div>
      <p style={{ textAlign: "center", color: "#6b4f99", fontSize: 11, marginTop: 12, fontStyle: "italic" }}>
        Front of the line (safety) is on the left — Scylla waits behind whoever's last.
      </p>
    </div>
  );
}
