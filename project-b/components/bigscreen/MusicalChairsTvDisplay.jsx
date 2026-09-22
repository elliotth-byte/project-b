import { useState, useEffect } from "react";
import { subscribeMusicalChairsTv, resolveMusicalChairsRound } from "../../lib/games/musicalChairsTvData";

// ─── Big Screen: Musical Chairs ───
// See lib/games/musicalChairsTvData.js for the full mechanic. The
// question and the chair count are the only things that ever need to
// be on the shared screen — answer OPTIONS live on each phone instead
// (components/games/MusicalChairsTvPlayer.jsx), the same "TV shows the
// shared thing, phone is the private input surface" split every other
// Big Screen battle in this app already follows.
export default function MusicalChairsTvDisplay({ gameId, round, players, settings }) {
  const [state, setState] = useState(null);

  useEffect(() => subscribeMusicalChairsTv(gameId, round.round, setState), [gameId, round.round]);

  // Drives round resolution from the TV itself, mirrored server-side
  // too — same belt-and-suspenders reasoning as every other shared
  // timed battle here (see e.g. lib/games/simonTvData.js's own
  // resolveSimonRound comment).
  useEffect(() => {
    if (!state || state.winnerId) return;
    const id = setInterval(() => resolveMusicalChairsRound(gameId, round.round, settings), 1000);
    return () => clearInterval(id);
  }, [state?.roundNum, state?.winnerId, gameId, round.round, settings]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!state) return <div style={{ textAlign: "center", color: "#6b4f99", padding: 60 }}>Loading...</div>;

  const byId = {};
  (players || []).forEach((p) => (byId[p.id] = p.display_name));
  const chairsOpen = state.chairsThisRound - state.chairsClaimed.length;
  const stillAnswering = Object.entries(state.playerProgress).filter(([, p]) => p.alive && p.status === "answering");

  return (
    <div style={{ padding: 40, display: "flex", flexDirection: "column", alignItems: "center", minHeight: "70vh" }}>
      <div style={{ fontSize: 14, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 3, marginBottom: 20 }}>
        🎵 Musical Chairs — Round {state.roundNum}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 28 }}>
        {Array.from({ length: state.chairsThisRound }).map((_, i) => (
          <div key={i} style={{ fontSize: 40, opacity: i < state.chairsClaimed.length ? 0.25 : 1, filter: i < state.chairsClaimed.length ? "grayscale(1)" : "none" }}>🪑</div>
        ))}
      </div>
      <div style={{ fontSize: 13, color: chairsOpen > 0 ? "#00ff9d" : "#ff3860", fontWeight: 700, marginBottom: 28 }}>
        {chairsOpen > 0 ? `${chairsOpen} chair${chairsOpen === 1 ? "" : "s"} still open` : "All chairs claimed!"}
      </div>

      <div style={{
        background: "#0d0618", border: "2px solid #ff2d95", borderRadius: 16, padding: "32px 48px",
        textAlign: "center", maxWidth: 700, boxShadow: "0 0 24px rgba(255,45,149,0.25)", marginBottom: 32,
      }}>
        <p style={{ color: "#f5f0ff", fontSize: 28, fontWeight: 700, margin: 0, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
          {state.question.q}
        </p>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center", maxWidth: 800 }}>
        {Object.entries(state.playerProgress).map(([id, p]) => (
          <div key={id} style={{
            fontSize: 13, padding: "6px 14px", borderRadius: 8,
            background: !p.alive ? "#0d0618" : p.status === "safe" ? "rgba(0,255,157,0.15)" : "#150a28",
            border: `1px solid ${!p.alive ? "#3d1f5c" : p.status === "safe" ? "#00ff9d" : "#ff2d95"}`,
            color: !p.alive ? "#6b4f99" : "#f5f0ff", textDecoration: !p.alive ? "line-through" : "none",
          }}>
            {p.status === "safe" && "🪑 "}{byId[id] || "?"}
          </div>
        ))}
      </div>
      {stillAnswering.length > 0 && chairsOpen > 0 && (
        <p style={{ marginTop: 20, fontSize: 12, color: "#6b4f99" }}>Waiting on {stillAnswering.length} more...</p>
      )}
    </div>
  );
}
