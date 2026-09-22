import { useState, useEffect } from "react";
import { subscribeWagerTrivia, tickWagerTrivia } from "../../lib/games/wagerTriviaTvData";
import { DIFFICULTY_POINTS } from "../../lib/games/triviaData";

const DIFFICULTY_COLORS = { easy: "#00ff9d", medium: "#ffd700", hard: "#ff3860" };

// ─── Big Screen: Wager Trivia ───
// See lib/games/wagerTriviaTvData.js for the full mechanic. The TV is
// the only place the category/difficulty stakes AND the question ever
// show — a player's own phone (components/games/WagerTriviaTvPlayer.jsx)
// only ever shows the opt-in/opt-out buttons and, once they're in, the
// same question with answer buttons, kept in careful sync with
// whichever phase the shared state says it's in. Polls
// tickWagerTrivia on its own 500ms interval — same belt-and-suspenders
// reasoning as every other shared timed battle here (see e.g.
// lib/games/simonTvData.js's own header comment).
export default function WagerTriviaTvDisplay({ gameId, round, players }) {
  const [state, setState] = useState(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => subscribeWagerTrivia(gameId, round.round, setState), [gameId, round.round]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => tickWagerTrivia(gameId, round.round), 500);
    return () => clearInterval(id);
  }, [gameId, round.round]);

  if (!state) return <div style={{ textAlign: "center", color: "#6b4f99", padding: 60 }}>Loading...</div>;

  const diffColor = DIFFICULTY_COLORS[state.difficulty] || "#a68fd6";
  const points = DIFFICULTY_POINTS[state.difficulty] || 0;
  const windowMs = state.phase === "deciding" ? 12000 : state.phase === "answering" ? 15000 : 3500;
  const secLeft = Math.max(0, Math.ceil((windowMs - (now - state.phaseStartedAt)) / 1000));

  const byId = {};
  (players || []).forEach((p) => (byId[p.id] = p.display_name));
  const leaderboard = Object.entries(state.scores || {}).sort((a, b) => b[1] - a[1]);
  const inCount = Object.values(state.decisions || {}).filter((d) => d === "in").length;
  const decidedCount = Object.keys(state.decisions || {}).length;

  return (
    <div style={{ padding: 40, display: "grid", gridTemplateColumns: "1fr 300px", gap: 32, minHeight: "70vh" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 14, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 3, marginBottom: 20 }}>
          🎲 Wager Trivia — Round {state.subRound}
        </div>

        <div style={{
          display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 10,
          background: "#0d0618", border: `2px solid ${diffColor}`, borderRadius: 16, padding: "24px 40px",
          boxShadow: `0 0 24px ${diffColor}33`, marginBottom: 28,
        }}>
          <div style={{ fontSize: 13, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 2 }}>📁 {state.category}</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: diffColor, textTransform: "uppercase", fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
            {state.difficulty} — worth {points} pt{points === 1 ? "" : "s"}
          </div>
          {state.phase !== "resolved" && (
            <div style={{ fontSize: 14, color: secLeft <= 3 ? "#ff3860" : "#6b4f99" }}>{secLeft}s</div>
          )}
        </div>

        {state.phase === "deciding" && (
          <div>
            <p style={{ color: "#f5f0ff", fontSize: 18, marginBottom: 8 }}>Opt in or stay safe — the question is still hidden.</p>
            <p style={{ color: "#6b4f99", fontSize: 13 }}>{decidedCount} of {(state.participantIds || []).length} decided</p>
          </div>
        )}

        {state.phase === "answering" && (
          <div>
            <p style={{ color: "#f5f0ff", fontSize: 20, fontWeight: 700, margin: "0 0 20px", fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
              {state.question.q}
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, maxWidth: 560, margin: "0 auto" }}>
              {state.question.options.map((opt, i) => (
                <div key={i} style={{
                  padding: "14px 18px", borderRadius: 10, background: "#150a28", border: "1px solid #3d1f5c",
                  color: "#f5f0ff", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif",
                }}>
                  {String.fromCharCode(65 + i)}. {opt}
                </div>
              ))}
            </div>
            <p style={{ color: "#6b4f99", fontSize: 13, marginTop: 16 }}>{inCount} player{inCount === 1 ? "" : "s"} answering</p>
          </div>
        )}

        {state.phase === "resolved" && state.lastOutcome && (
          <div>
            <p style={{ color: "#f5f0ff", fontSize: 18, margin: "0 0 6px" }}>
              Correct answer: <strong style={{ color: "#00ff9d" }}>{String.fromCharCode(65 + state.lastOutcome.correctIndex)}. {state.question.options[state.lastOutcome.correctIndex]}</strong>
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center", marginTop: 14 }}>
              {Object.entries(state.lastOutcome.results).map(([id, r]) => (
                <div key={id} style={{
                  fontSize: 13, padding: "6px 14px", borderRadius: 8,
                  background: r.correct ? "rgba(0,255,157,0.12)" : "rgba(255,56,96,0.12)",
                  border: `1px solid ${r.correct ? "#00ff9d" : "#ff3860"}`, color: r.correct ? "#00ff9d" : "#ff3860",
                }}>
                  {r.correct ? "✅" : "❌"} {r.delta > 0 ? "+" : ""}{r.delta}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div>
        <div style={{ fontSize: 14, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 2, marginBottom: 16 }}>Leaderboard</div>
        <div style={{ display: "grid", gap: 8 }}>
          {leaderboard.length === 0 && <p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic" }}>No scores yet</p>}
          {leaderboard.map(([id, score], i) => (
            <div key={id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0d0618", borderRadius: 8, padding: "10px 14px" }}>
              <span style={{ fontSize: 15, color: i === 0 && score > 0 ? "#c9a84c" : "#f5f0ff", fontWeight: i === 0 && score > 0 ? 700 : 400 }}>
                {i === 0 && score > 0 && "👑 "}{byId[id] || "?"}
              </span>
              <span style={{ fontSize: 18, color: score < 0 ? "#ff3860" : "#00ff9d", fontWeight: 800, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>{score}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
