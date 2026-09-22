import { useState, useEffect, useRef } from "react";
import { Card } from "../ui";
import GameResultCard from "./GameResultCard";
import { reportScore } from "../../lib/challengeScores";
import { subscribeWordScrambleTv, submitWordScrambleGuess, placementValue } from "../../lib/games/wordScrambleTvData";

// ─── Word Scramble — Big Screen (phone side) ───
// Deliberately just a text box — see
// components/bigscreen/WordScrambleTvDisplay.jsx for the actual
// scrambled letters, which only ever render there. Mirroring the
// scramble here too would defeat the entire point of a shared-screen
// game (everyone just solving alone on their own phone again, the TV
// reduced to decoration) — the phone's only job in Big Screen Mode is
// being the controller.
export default function WordScrambleTvPlayer({ gameId, round, challenge, player }) {
  const [state, setState] = useState(null);
  const [guess, setGuess] = useState("");
  const [feedback, setFeedback] = useState(null); // { ok: bool, word } | null
  const reportedRef = useRef(false);

  useEffect(() => subscribeWordScrambleTv(gameId, round.round, setState), [gameId, round.round]);

  // Continuous interim score, same pattern established for every other
  // timed digital mini-game in this app — see e.g. lib/games/
  // torchedData.js's own placementValue comment for why this matters:
  // a player who's actively ahead shouldn't report nothing if the
  // challenge's own timer runs out before a final report happens.
  useEffect(() => {
    if (!state) return;
    reportScore(gameId, round.round, player.id, player.name, placementValue(state, player.id), { final: false });
  }, [state?.scores]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!challenge?.active && state && !reportedRef.current) {
      reportedRef.current = true;
      reportScore(gameId, round.round, player.id, player.name, placementValue(state, player.id), { final: true });
    }
  }, [challenge?.active, state]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!challenge?.active) {
    const myScore = state ? placementValue(state, player.id) : 0;
    return <GameResultCard icon="🔤" title="Word Scramble" valueLabel={`You solved ${myScore} word${myScore === 1 ? "" : "s"}`} />;
  }

  const submit = async (e) => {
    e.preventDefault();
    if (!guess.trim()) return;
    const normalized = guess.trim().toUpperCase();
    const before = state?.activePool?.some((entry) => entry.word === normalized);
    await submitWordScrambleGuess(gameId, round.round, player.id, player.name, guess);
    setFeedback(before ? { ok: true, word: normalized } : { ok: false, word: normalized });
    setGuess("");
    setTimeout(() => setFeedback(null), 1500);
  };

  const myScore = state ? placementValue(state, player.id) : 0;

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <h3 style={{ color: "#ff2d95", margin: "0 0 4px", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🔤 Word Scramble</h3>
      <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 16px" }}>Look at the big screen — type any word you can solve.</p>
      <form onSubmit={submit}>
        <input
          value={guess} onChange={(e) => setGuess(e.target.value)} autoCapitalize="characters" autoComplete="off"
          placeholder="Type a word..."
          style={{
            width: "100%", boxSizing: "border-box", padding: "14px 16px", borderRadius: 10, textAlign: "center",
            background: "#0d0618", border: "2px solid #3d1f5c", color: "#f5f0ff", fontSize: 20, fontWeight: 700,
            textTransform: "uppercase", letterSpacing: 2, outline: "none", marginBottom: 12,
            fontFamily: "'Orbitron', 'Segoe UI', sans-serif",
          }}
        />
        <button type="submit" disabled={!guess.trim()} style={{
          width: "100%", padding: "12px 24px", borderRadius: 10, border: "none",
          background: guess.trim() ? "linear-gradient(135deg, #ff2d95, #b829ff)" : "#3d1f5c",
          color: guess.trim() ? "#05010f" : "#6b4f99", fontSize: 15, fontWeight: 700, cursor: guess.trim() ? "pointer" : "default",
        }}>
          Submit
        </button>
      </form>
      {feedback && (
        <p style={{ marginTop: 12, fontSize: 14, fontWeight: 700, color: feedback.ok ? "#00ff9d" : "#6b4f99" }}>
          {feedback.ok ? `✅ ${feedback.word} — nice!` : "Not on the board right now"}
        </p>
      )}
      <p style={{ marginTop: 16, fontSize: 12, color: "#6b4f99" }}>Your solves: <strong style={{ color: "#f5f0ff" }}>{myScore}</strong></p>
    </Card>
  );
}
