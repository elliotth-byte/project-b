import { useState, useEffect } from "react";
import { subscribeGameState } from "../../lib/gameStorage";
import { KEY_CHALLENGE } from "../../lib/gameState";
import { RELICS } from "../../lib/games/hermesGraspData";
import { GRID_COLS_TV, subscribeTriggerHappyTv, tickTriggerHappyTv } from "../../lib/games/triggerHappyTvData";

function relicEmoji(id) {
  return RELICS.find((r) => r.id === id)?.emoji || "";
}

function StaticGrid({ layout, cols, size = 68 }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: `repeat(${cols}, ${size}px)`, gap: 6,
      margin: "0 auto", width: "fit-content", background: "#05010f", border: "2px solid #3d1f5c", borderRadius: 10, padding: 8,
    }}>
      {layout.map((relicId, i) => (
        <div key={i} style={{
          width: size, height: size, fontSize: size * 0.42, borderRadius: 8,
          background: "linear-gradient(160deg, #1a1330, #0d0618)", border: "2px solid #3d1f5c",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {relicEmoji(relicId)}
        </div>
      ))}
    </div>
  );
}

function ComparisonGrid({ layout, cols, grid, label, size = 44 }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 13, color: "#a68fd6", marginBottom: 6 }}>{label}</div>
      <div style={{
        display: "grid", gridTemplateColumns: `repeat(${cols}, ${size}px)`, gap: 4,
        margin: "0 auto", background: "#05010f", border: "2px solid #3d1f5c", borderRadius: 8, padding: 6,
      }}>
        {layout.map((relicId, i) => {
          const guess = grid?.[i] || null;
          const correct = guess === relicId;
          return (
            <div key={i} style={{
              width: size, height: size, fontSize: size * 0.42, borderRadius: 6,
              background: correct ? "rgba(0,255,157,0.18)" : guess ? "rgba(255,56,96,0.15)" : "#0d0618",
              border: `2px solid ${correct ? "#00ff9d" : guess ? "#ff3860" : "#3d1f5c"}`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {relicEmoji(guess)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Big Screen: Trigger Happy ───
// See lib/games/triggerHappyTvData.js for the full duel mechanic.
// display.jsx doesn't pass the live challenge object down to TV
// components (see its own BattleComponent render) — this subscribes to
// KEY_CHALLENGE directly, same pattern as components/bigscreen/
// LifesTapestryTvDisplay.jsx.
export default function TriggerHappyTvDisplay({ gameId, round, players, settings }) {
  const [challenge, setChallenge] = useState(null);
  useEffect(() => subscribeGameState(gameId, KEY_CHALLENGE, setChallenge), [gameId]);

  const [state, setState] = useState(null);
  useEffect(() => subscribeTriggerHappyTv(gameId, round.round, setState), [gameId, round.round]);

  // Same belt-and-suspenders poll as every other shared timed battle
  // here — the TV drives this too, on top of both duelists' own phones.
  useEffect(() => {
    const id = setInterval(() => tickTriggerHappyTv(gameId, round.round, settings), 1000);
    return () => clearInterval(id);
  }, [gameId, round.round, settings]);

  if (!state) return <div style={{ textAlign: "center", color: "#6b4f99", padding: 60 }}>Loading...</div>;

  const byId = {};
  (players || []).forEach((p) => (byId[p.id] = p.display_name));
  const [aId, bId] = state.currentPair;

  const leaderboard = [...state.participantIds].sort((x, y) => (state.wins[y] || 0) - (state.wins[x] || 0));

  return (
    <div style={{ padding: 36, display: "grid", gridTemplateColumns: "1fr 280px", gap: 30, minHeight: "70vh" }}>
      <div>
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 14, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 3 }}>🎚️ Trigger Happy</div>
          <p style={{ color: "#f5f0ff", fontSize: 26, fontWeight: 800, margin: "6px 0 0", fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
            ⚔️ {byId[aId] || "?"} <span style={{ color: "#6b4f99" }}>vs</span> {byId[bId] || "?"}
          </p>
        </div>

        {state.phase === "memorize" && (
          <>
            <p style={{ color: "#a68fd6", fontSize: 14, textAlign: "center", margin: "0 0 16px" }}>
              Study the grid — either duelist can pull the lever whenever they're ready.
            </p>
            <StaticGrid layout={state.layout} cols={GRID_COLS_TV} />
          </>
        )}

        {state.phase === "blank_replicating" && (
          <>
            <p style={{ color: "#ffb347", fontSize: 15, textAlign: "center", margin: "0 0 16px", fontWeight: 700 }}>
              🎚️ Lever pulled! Both duelists are replicating on their phones...
            </p>
            <div style={{
              display: "grid", gridTemplateColumns: `repeat(${GRID_COLS_TV}, 68px)`, gap: 6,
              margin: "0 auto", width: "fit-content", background: "#05010f", border: "2px solid #3d1f5c", borderRadius: 10, padding: 8,
            }}>
              {state.layout.map((_, i) => (
                <div key={i} style={{ width: 68, height: 68, borderRadius: 8, background: "#0d0618", border: "2px solid #3d1f5c" }} />
              ))}
            </div>
            <p style={{ textAlign: "center", marginTop: 14, fontSize: 13, color: "#6b4f99" }}>
              {[aId, bId].map((id) => (state.submissions[id] ? `${byId[id] || "?"} ✅` : `${byId[id] || "?"} ⏳`)).join("   ·   ")}
            </p>
          </>
        )}

        {(state.phase === "revealed" || state.phase === "picking_next") && state.lastResult && (
          <>
            <div style={{ display: "flex", justifyContent: "center", gap: 28, marginBottom: 14 }}>
              <ComparisonGrid layout={state.layout} cols={GRID_COLS_TV} grid={state.submissions[state.lastResult.aId]?.grid} label={`${byId[state.lastResult.aId] || "?"} — ${state.lastResult.aAccuracy}/${state.layout.length} · ${(state.lastResult.aMs / 1000).toFixed(1)}s`} />
              <ComparisonGrid layout={state.layout} cols={GRID_COLS_TV} grid={state.submissions[state.lastResult.bId]?.grid} label={`${byId[state.lastResult.bId] || "?"} — ${state.lastResult.bAccuracy}/${state.layout.length} · ${(state.lastResult.bMs / 1000).toFixed(1)}s`} />
            </div>
            <p style={{ textAlign: "center", fontSize: 20, fontWeight: 800, color: "#ffd700", fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
              🏆 {byId[state.lastResult.winnerId] || "?"} wins the duel!{state.lastResult.tie ? " (dead tie — picked arbitrarily)" : ""}
            </p>
            {state.phase === "picking_next" && (
              <p style={{ textAlign: "center", color: "#a68fd6", fontSize: 13, marginTop: 8 }}>
                {byId[state.pendingPickerId] || "?"} is choosing the next matchup on their phone...
              </p>
            )}
          </>
        )}
      </div>

      <div>
        <div style={{ fontSize: 14, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 2, marginBottom: 12 }}>Duel Wins</div>
        <div style={{ display: "grid", gap: 8 }}>
          {leaderboard.map((id) => (
            <div key={id} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0d0618",
              borderRadius: 8, padding: "8px 12px", border: `1px solid ${[aId, bId].includes(id) ? "#ff2d95" : "#3d1f5c"}`,
            }}>
              <span style={{ fontSize: 13, color: "#f5f0ff" }}>{byId[id] || "?"}</span>
              <span style={{ fontSize: 13, color: "#00ff9d", fontWeight: 700 }}>{state.wins[id] || 0}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
