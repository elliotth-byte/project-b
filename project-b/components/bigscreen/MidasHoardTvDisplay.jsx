import { useState, useEffect } from "react";
import { subscribeMidasHoard, tickMidasHoard, WIN_SCORE } from "../../lib/games/midasHoardData";

const GUESS_WINDOW_MS = 25000, DECIDE_WINDOW_MS = 15000, RESOLVED_DISPLAY_MS = 6000;

// ─── Big Screen: Midas's Hoard ───
// See lib/games/midasHoardData.js for the full mechanic. The pile
// itself — and everyone's guesses once they're revealed — only ever
// shows here; a phone (components/games/MidasHoardTvPlayer.jsx) is
// just a numeric guess field, then Stay/Fold buttons. Polls
// tickMidasHoard on its own 500ms interval — same belt-and-suspenders
// reasoning as every other shared timed battle here.
export default function MidasHoardTvDisplay({ gameId, round, players }) {
  const [state, setState] = useState(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => subscribeMidasHoard(gameId, round.round, setState), [gameId, round.round]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (state?.winnerId) return;
    const id = setInterval(() => tickMidasHoard(gameId, round.round), 500);
    return () => clearInterval(id);
  }, [gameId, round.round, state?.winnerId]);

  if (!state) return <div style={{ textAlign: "center", color: "#6b4f99", padding: 60 }}>Loading...</div>;

  const byId = {};
  (players || []).forEach((p) => (byId[p.id] = p.display_name));
  const windowMs = state.phase === "guessing" ? GUESS_WINDOW_MS : state.phase === "deciding" ? DECIDE_WINDOW_MS : RESOLVED_DISPLAY_MS;
  const secLeft = Math.max(0, Math.ceil((windowMs - (now - state.phaseStartedAt)) / 1000));
  const guessedCount = Object.keys(state.guesses || {}).length;
  const decidedCount = Object.keys(state.decisions || {}).length;
  const guessedIds = state.aliveIds.filter((id) => state.guesses[id] != null);
  const sortedGuesses = guessedIds.slice().sort((a, b) => state.guesses[a] - state.guesses[b]);
  const leaderboard = state.aliveIds.slice().sort((a, b) => (state.scores[b] || 0) - (state.scores[a] || 0));

  return (
    <div style={{ padding: 40, display: "grid", gridTemplateColumns: "1fr 300px", gap: 32, minHeight: "70vh" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 14, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 3, marginBottom: 20 }}>
          💰 Midas's Hoard — Round {state.roundNum} · First to {WIN_SCORE}
        </div>

        {!state.winnerId && (
          <div style={{ fontSize: 14, color: secLeft <= 3 ? "#ff3860" : "#6b4f99", marginBottom: 14 }}>{secLeft}s</div>
        )}

        {(state.phase === "guessing" || state.phase === "deciding") && (
          <div style={{ position: "relative", width: 420, height: 320, margin: "0 auto 20px", background: "linear-gradient(180deg, #241340, #150a28 60%, #3a2510)", borderRadius: 16, border: "2px solid #c9a84c", overflow: "hidden", boxShadow: "0 0 30px rgba(201,168,76,0.25)" }}>
            {state.items.map((it, i) => (
              <div key={i} style={{ position: "absolute", left: `${it.x}%`, top: `${it.y}%`, transform: "translate(-50%,-50%)", fontSize: 15 }}>🪙</div>
            ))}
            <div style={{ position: "absolute", top: 8, left: 0, right: 0, textAlign: "center", fontSize: 11, color: "#e8dcc8", letterSpacing: 2, textTransform: "uppercase" }}>King Midas's Vault</div>
          </div>
        )}

        {state.phase === "guessing" && (
          <p style={{ color: "#f5f0ff", fontSize: 16 }}>How many golden trinkets has Midas's curse piled up? {guessedCount}/{guessedIds.length || state.aliveIds.length} guessed</p>
        )}

        {state.phase === "deciding" && (
          <div>
            <p style={{ color: "#f5f0ff", fontSize: 16, marginBottom: 10 }}>Every guess is in. Stay near the hoard, or fold back to safety?</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
              {sortedGuesses.map((id) => (
                <div key={id} style={{ fontSize: 14, padding: "8px 16px", borderRadius: 10, background: "#0d0618", border: "1px solid #c9a84c", color: "#f5f0ff" }}>
                  {byId[id] || "?"}: <strong style={{ color: "#ffd700" }}>{state.guesses[id]}</strong>
                  {state.decisions[id] && <span style={{ marginLeft: 6, color: state.decisions[id] === "stay" ? "#ff3860" : "#00ff9d" }}>{state.decisions[id] === "stay" ? "🔥 staying" : "🛡️ folded"}</span>}
                </div>
              ))}
            </div>
            <p style={{ color: "#6b4f99", fontSize: 12, marginTop: 12 }}>{decidedCount}/{guessedIds.length} decided</p>
          </div>
        )}

        {state.phase === "resolved" && state.lastOutcome && (
          <div>
            <p style={{ color: "#f5f0ff", fontSize: 20, margin: "0 0 12px" }}>
              The true count was <strong style={{ color: "#ffd700", fontSize: 26 }}>{state.lastOutcome.targetCount}</strong>
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center", marginBottom: 10 }}>
              {Object.keys(state.lastOutcome.guesses).map((id) => {
                const won = state.lastOutcome.scorerIds.includes(id);
                const gonged = state.lastOutcome.eliminatedIds.includes(id);
                return (
                  <div key={id} style={{
                    fontSize: 14, padding: "8px 16px", borderRadius: 10, background: "#0d0618",
                    border: `1px solid ${won ? "#00ff9d" : gonged ? "#ff3860" : "#3d1f5c"}`,
                    color: won ? "#00ff9d" : gonged ? "#ff3860" : "#6b4f99",
                  }}>
                    {won ? "✨ " : gonged ? "🗿 " : ""}{byId[id] || "?"}: {state.lastOutcome.guesses[id]}
                  </div>
                );
              })}
            </div>
            {state.lastOutcome.scorerIds.length === 0 && state.lastOutcome.eliminatedIds.length === 0 && (
              <p style={{ color: "#a68fd6", fontSize: 13, fontStyle: "italic" }}>Everyone folded — no points, no one turned to gold.</p>
            )}
            {state.winnerId && (
              <p style={{ color: "#ffd700", fontSize: 24, fontWeight: 800, marginTop: 16, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
                🏆 {byId[state.winnerId] || "?"} claims the hoard!
              </p>
            )}
          </div>
        )}
      </div>

      <div>
        <div style={{ fontSize: 14, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 2, marginBottom: 16 }}>Standings</div>
        <div style={{ display: "grid", gap: 8 }}>
          {leaderboard.map((id, i) => (
            <div key={id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0d0618", borderRadius: 8, padding: "10px 14px" }}>
              <span style={{ fontSize: 15, color: i === 0 && state.scores[id] > 0 ? "#ffd700" : "#f5f0ff" }}>
                {i === 0 && state.scores[id] > 0 && "👑 "}{byId[id] || "?"}
              </span>
              <span style={{ fontSize: 18, color: "#ffd700", fontWeight: 800, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>{state.scores[id] || 0}</span>
            </div>
          ))}
          {Object.keys(state.eliminatedInRound || {}).length > 0 && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #3d1f5c" }}>
              <div style={{ fontSize: 12, color: "#6b4f99", marginBottom: 8 }}>🗿 Turned to Gold</div>
              {Object.entries(state.eliminatedInRound).map(([id, r]) => (
                <div key={id} style={{ fontSize: 13, color: "#6b4f99", padding: "4px 0", textDecoration: "line-through" }}>{byId[id] || "?"} (round {r})</div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
