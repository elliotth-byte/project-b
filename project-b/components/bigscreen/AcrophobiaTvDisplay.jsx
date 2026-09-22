import { useState, useEffect } from "react";
import { subscribeAcrophobia, tickAcrophobia, ACROPHOBIA_SUBMIT_WINDOW_MS, ACROPHOBIA_VOTE_WINDOW_MS } from "../../lib/games/acrophobiaData";

// ─── Big Screen: Acrophobia ───
// A clone of the classic web party game — see lib/games/acrophobiaData.js's
// own header comment for the full mechanic. The TV is where the room
// reads everyone's phrases together, which is the whole point of the
// game, so it's the star screen here (a player's own phone, see
// components/games/AcrophobiaTvPlayer.jsx, only ever shows the input
// box and the vote buttons). Big-Screen-exclusive, unlike Spyfall's TV
// display — there's no way to play this without a shared screen
// everyone can read at once. Polls tickAcrophobia on its own interval,
// same belt-and-suspenders reasoning as every other shared timed
// battle here.
export default function AcrophobiaTvDisplay({ gameId, round, players }) {
  const [state, setState] = useState(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => subscribeAcrophobia(gameId, round.round, setState), [gameId, round.round]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => tickAcrophobia(gameId, round.round), 500);
    return () => clearInterval(id);
  }, [gameId, round.round]);

  if (!state) return <div style={{ textAlign: "center", color: "#6b4f99", padding: 60 }}>Loading...</div>;

  const byId = {};
  (players || []).forEach((p) => (byId[p.id] = p.display_name));

  const windowMs = state.phase === "submitting" ? ACROPHOBIA_SUBMIT_WINDOW_MS : state.phase === "voting" ? ACROPHOBIA_VOTE_WINDOW_MS : 0;
  const secLeft = windowMs ? Math.max(0, Math.ceil((windowMs - (now - state.phaseStartedAt)) / 1000)) : null;

  const leaderboard = Object.entries(state.scores || {}).sort((a, b) => b[1] - a[1]);
  const submittedCount = Object.keys(state.submissions || {}).length;
  const totalPlayers = (state.participantIds || []).length;
  const voteCount = Object.keys(state.votes || {}).length;

  return (
    <div style={{ padding: 40, display: "grid", gridTemplateColumns: "1fr 300px", gap: 32, minHeight: "70vh" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 14, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 3, marginBottom: 20 }}>
          🔤 Acrophobia — Round {state.subRound}
        </div>

        <div style={{
          display: "inline-flex", gap: 14, justifyContent: "center", marginBottom: 28,
        }}>
          {state.letters.map((letter, i) => (
            <div key={i} style={{
              width: 72, height: 84, display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 42, fontWeight: 800, color: "#f5f0ff", background: "#0d0618",
              border: "3px solid #ff2d95", borderRadius: 14, boxShadow: "0 0 24px rgba(255,45,149,0.35)",
              fontFamily: "'Orbitron', 'Segoe UI', sans-serif",
            }}>
              {letter}
            </div>
          ))}
        </div>

        {secLeft !== null && (
          <div style={{ fontSize: 16, fontWeight: 700, color: secLeft <= 5 ? "#ff3860" : "#00ff9d", marginBottom: 20 }}>{secLeft}s</div>
        )}

        {state.phase === "submitting" && (
          <p style={{ color: "#a68fd6", fontSize: 15 }}>
            Everyone's writing a phrase — one word per letter, in order. {submittedCount} of {totalPlayers} in.
          </p>
        )}

        {state.phase === "voting" && (
          <div style={{ display: "grid", gap: 12, maxWidth: 640, margin: "0 auto" }}>
            {state.votingOrder.map((authorId, i) => (
              <div key={authorId} style={{
                padding: "14px 20px", borderRadius: 10, background: "#150a28", border: "1px solid #3d1f5c",
                color: "#f5f0ff", fontSize: 17, textAlign: "left",
              }}>
                <span style={{ color: "#c9a84c", fontWeight: 700, marginRight: 10 }}>{String.fromCharCode(65 + i)}.</span>
                {state.submissions[authorId]}
              </div>
            ))}
            <p style={{ color: "#6b4f99", fontSize: 13, marginTop: 4 }}>{voteCount} of {totalPlayers} voted</p>
          </div>
        )}

        {state.phase === "resolved" && state.lastOutcome && (
          <div style={{ display: "grid", gap: 10, maxWidth: 640, margin: "0 auto" }}>
            {state.lastOutcome.votingOrder.map((authorId, i) => {
              const isTop = state.lastOutcome.topAuthorIds.includes(authorId);
              return (
                <div key={authorId} style={{
                  padding: "14px 20px", borderRadius: 10, textAlign: "left",
                  background: isTop ? "rgba(201,168,76,0.12)" : "#150a28",
                  border: `1px solid ${isTop ? "#c9a84c" : "#3d1f5c"}`, color: "#f5f0ff",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 17 }}>{isTop && "👑 "}{state.lastOutcome.submissions[authorId]}</span>
                    <span style={{ fontSize: 13, color: "#6b4f99" }}>
                      {byId[authorId] || "?"} · +{state.lastOutcome.pointsAwarded[authorId]}
                    </span>
                  </div>
                </div>
              );
            })}
            <p style={{ color: "#6b4f99", fontSize: 13, marginTop: 4 }}>Next round starting soon...</p>
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
              <span style={{ fontSize: 18, color: "#00ff9d", fontWeight: 800, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>{score}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
