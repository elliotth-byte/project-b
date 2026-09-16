import { useState, useEffect } from "react";
import { subscribeWordScrambleTv } from "../../lib/games/wordScrambleTvData";

// ─── Big Screen: Word Scramble ───
// See lib/games/wordScrambleTvData.js for the full mechanic — this is
// the puzzle itself (the scrambled letters players are actually
// solving), shown ONLY here, never on a player's own phone (their side
// is components/games/WordScrambleTvPlayer.jsx, a plain text box —
// see that file's own comment on why intentionally not mirroring the
// scramble there too). A live leaderboard and a rolling feed of recent
// solves round out what the room needs to see on the shared screen:
// what's still open, who's ahead, and what just got solved.
export default function WordScrambleTvDisplay({ gameId, round, players }) {
  const [state, setState] = useState(null);

  useEffect(() => subscribeWordScrambleTv(gameId, round.round, setState), [gameId, round.round]);

  if (!state) return <div style={{ textAlign: "center", color: "#6b4f99", padding: 60 }}>Loading...</div>;

  const byId = {};
  (players || []).forEach((p) => (byId[p.id] = p.display_name));

  const leaderboard = Object.entries(state.scores || {})
    .map(([id, count]) => ({ id, name: byId[id] || "?", count }))
    .sort((a, b) => b.count - a.count);

  return (
    <div style={{ padding: 40, display: "grid", gridTemplateColumns: "1fr 320px", gap: 32, minHeight: "70vh" }}>
      <div>
        <div style={{ fontSize: 14, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 3, marginBottom: 20, textAlign: "center" }}>
          🔤 Word Scramble — solve any of these from your phone
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 20 }}>
          {state.activePool.map((entry) => (
            <div key={entry.id} style={{
              background: "#0d0618", border: "2px solid #ff2d95", borderRadius: 14, padding: "24px 16px",
              textAlign: "center", boxShadow: "0 0 20px rgba(255,45,149,0.25)",
            }}>
              <div style={{ display: "flex", justifyContent: "center", gap: 6, flexWrap: "wrap" }}>
                {entry.scrambled.map((letter, i) => (
                  <span key={i} style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    width: 44, height: 44, background: "#150a28", border: "1px solid #3d1f5c", borderRadius: 8,
                    fontSize: 26, fontWeight: 700, color: "#f5f0ff", fontFamily: "'Orbitron', 'Segoe UI', sans-serif",
                  }}>
                    {letter}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
        {state.solvedLog?.length > 0 && (
          <div style={{ marginTop: 28, textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Just solved</div>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
              {[...state.solvedLog].reverse().slice(0, 6).map((s, i) => (
                <div key={i} style={{ fontSize: 12, color: "#a68fd6", background: "#0d0618", borderRadius: 6, padding: "4px 10px" }}>
                  <strong style={{ color: "#00ff9d" }}>{s.playerName}</strong> → {s.word}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <div>
        <div style={{ fontSize: 14, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 2, marginBottom: 16 }}>Leaderboard</div>
        <div style={{ display: "grid", gap: 8 }}>
          {leaderboard.length === 0 && <p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic" }}>No solves yet</p>}
          {leaderboard.map((p, i) => (
            <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0d0618", borderRadius: 8, padding: "10px 14px" }}>
              <span style={{ fontSize: 16, color: i === 0 ? "#c9a84c" : "#f5f0ff", fontWeight: i === 0 ? 700 : 400 }}>
                {i === 0 && "👑 "}{p.name}
              </span>
              <span style={{ fontSize: 20, color: "#ff3860", fontWeight: 800, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>{p.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
