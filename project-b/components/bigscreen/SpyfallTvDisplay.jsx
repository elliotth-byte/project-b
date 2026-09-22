import { useState, useEffect } from "react";
import { subscribeSpyfall, SPYFALL_LOCATIONS, SPYFALL_ROUND_TIMER_SEC } from "../../lib/games/spyfallData";

// ─── Big Screen: Spyfall ───
// Not a Big-Screen-exclusive game type — same reasoning as
// components/bigscreen/ArtAuctionTvDisplay.jsx's own header comment.
// The regular spyfall game type already works fully normally without
// Big Screen Mode (see components/games/SpyfallPlayer.jsx); this just
// gives the room the same shared reference sheet the physical board
// game keeps face-up on the table — the full list of every possible
// location, so the group (and the spy, trying to narrow it down) can
// see the whole pool at a glance. It deliberately shows nothing
// secret: never the CURRENT round's actual location, never who the
// spy is. Marking which locations have already come up this Battle is
// the one extra bit of shared info beyond the physical game's own
// static card — a harmless convenience (it only ever rules out PAST
// rounds, never narrows the current secret), not a leak.
export default function SpyfallTvDisplay({ gameId, round, players }) {
  const [state, setState] = useState(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => subscribeSpyfall(gameId, round.round, setState), [gameId, round.round]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!state) return <div style={{ textAlign: "center", color: "#6b4f99", padding: 60 }}>Loading...</div>;

  const byId = {};
  (players || []).forEach((p) => (byId[p.id] = p.display_name));

  if (state.ended) {
    return (
      <div style={{ textAlign: "center", padding: 60 }}>
        <div style={{ fontSize: 14, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 3, marginBottom: 20 }}>🕵️ Spyfall — Game Over</div>
        <div style={{ fontSize: 24, fontWeight: 800, color: "#c9a84c", fontFamily: "'Orbitron', 'Segoe UI', sans-serif", marginBottom: 20 }}>
          The last three standing:
        </div>
        <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
          {state.winnerIds.map((id) => (
            <div key={id} style={{ fontSize: 18, padding: "12px 24px", borderRadius: 12, background: "#0d0618", border: "2px solid #c9a84c", color: "#c9a84c", fontWeight: 700 }}>
              👑 {byId[id] || "?"}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const elapsedSec = Math.max(0, Math.floor((now - state.subRoundStartedAt) / 1000));
  const overtime = elapsedSec > SPYFALL_ROUND_TIMER_SEC;
  const timerLabel = overtime ? `+${elapsedSec - SPYFALL_ROUND_TIMER_SEC}s overtime` : `${SPYFALL_ROUND_TIMER_SEC - elapsedSec}s`;

  return (
    <div style={{ padding: 40, minHeight: "70vh" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div style={{ fontSize: 14, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 3 }}>
          🕵️ Spyfall — Round {state.subRound} — {state.remainingPool.length} still playing
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: overtime ? "#c9a84c" : "#00ff9d" }}>{timerLabel}</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12, marginBottom: 28 }}>
        {SPYFALL_LOCATIONS.map((loc) => {
          const used = state.usedLocations.includes(loc);
          return (
            <div key={loc} style={{
              padding: "12px 14px", borderRadius: 10, textAlign: "center", fontSize: 14,
              background: used ? "#0d0618" : "rgba(0,255,157,0.08)",
              border: `1px solid ${used ? "#3d1f5c" : "#00ff9d"}`,
              color: used ? "#6b4f99" : "#f5f0ff", textDecoration: used ? "line-through" : "none",
            }}>
              {loc}
            </div>
          );
        })}
      </div>

      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 11, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Still in the game</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
          {state.remainingPool.map((id) => (
            <div key={id} style={{ fontSize: 14, padding: "6px 16px", borderRadius: 8, background: "#0d0618", border: "1px solid #ff2d95", color: "#f5f0ff" }}>
              {byId[id] || "?"}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
