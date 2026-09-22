import { useState, useEffect, useRef } from "react";
import { Card, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { reportScore } from "../../lib/challengeScores";
import { subscribeMidasHoard, submitHoardGuess, submitHoardDecision, tickMidasHoard, placementValue, WIN_SCORE } from "../../lib/games/midasHoardData";

// ─── Midas's Hoard — Big Screen (phone side) ───
// The pile itself only ever shows on the TV (components/bigscreen/
// MidasHoardTvDisplay.jsx) — this is purely the guess field, then the
// Stay/Fold buttons once every guess is in and revealed up there.
export default function MidasHoardTvPlayer({ gameId, round, challenge, player }) {
  const [state, setState] = useState(null);
  const [guessInput, setGuessInput] = useState("");
  const reportedRef = useRef(false);

  useEffect(() => subscribeMidasHoard(gameId, round.round, setState), [gameId, round.round]);

  // Same belt-and-suspenders poll as the TV display itself — keeps a
  // solo phone from stalling a round if the TV page isn't open at the
  // exact moment a phase's window runs out.
  useEffect(() => {
    if (state?.winnerId) return;
    const id = setInterval(() => tickMidasHoard(gameId, round.round), 500);
    return () => clearInterval(id);
  }, [gameId, round.round, state?.winnerId]);

  useEffect(() => { setGuessInput(""); }, [state?.roundNum]);

  useEffect(() => {
    if (!state) return;
    reportScore(gameId, round.round, player.id, player.name, placementValue(state, player.id), { final: false });
  }, [state?.scores, state?.winnerId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!challenge?.active && state && !reportedRef.current) {
      reportedRef.current = true;
      reportScore(gameId, round.round, player.id, player.name, placementValue(state, player.id), { final: true });
    }
  }, [challenge?.active, state]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!challenge?.active) {
    const myScore = state ? placementValue(state, player.id) : 0;
    const won = state?.winnerId === player.id;
    return <GameResultCard icon={won ? "🏆" : "💰"} title={won ? "Claimed the Hoard!" : "Midas's Hoard"} valueLabel={`${state?.scores?.[player.id] || 0} pt${(state?.scores?.[player.id] || 0) === 1 ? "" : "s"}`} />;
  }
  if (!state) return <Card style={{ marginBottom: 20, textAlign: "center" }}><p style={{ color: "#6b4f99", fontStyle: "italic" }}>Loading...</p></Card>;

  const myScore = state.scores?.[player.id] || 0;
  const iAmAlive = state.aliveIds.includes(player.id);
  const wasEliminatedThisReveal = state.phase === "resolved" && state.lastOutcome?.eliminatedIds.includes(player.id);
  const iWon = state.winnerId === player.id;

  if (state.winnerId || (!iAmAlive && !wasEliminatedThisReveal)) {
    return (
      <GameResultCard
        icon={iWon ? "🏆" : "🗿"}
        title={iWon ? "You Claimed the Hoard!" : "Turned to Gold"}
        valueLabel={iWon ? `${myScore} pts` : `Eliminated in round ${state.eliminatedInRound?.[player.id] || "?"}`}
      />
    );
  }

  const myGuess = state.guesses?.[player.id];
  const myDecision = state.decisions?.[player.id];

  const submitGuess = () => {
    if (guessInput === "") return;
    submitHoardGuess(gameId, round.round, player.id, guessInput);
  };
  const decide = (d) => submitHoardDecision(gameId, round.round, player.id, d);

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>💰 Midas's Hoard</h3>
        <Badge>{myScore}/{WIN_SCORE} pts</Badge>
      </div>

      {state.phase === "guessing" && myGuess == null && wasEliminatedThisReveal === false && (
        <>
          <p style={{ color: "#a68fd6", fontSize: 13, margin: "0 0 12px" }}>Look at the big screen — how many golden trinkets are in the pile?</p>
          <input
            type="number" inputMode="numeric"
            value={guessInput}
            onChange={(e) => setGuessInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submitGuess(); }}
            placeholder="Your guess"
            style={{
              width: "100%", padding: "14px 12px", borderRadius: 10, border: "2px solid #c9a84c",
              background: "#0d0a05", color: "#f5f0ff", fontSize: 20, fontWeight: 700, textAlign: "center",
              marginBottom: 12, boxSizing: "border-box",
            }}
          />
          <button
            onClick={submitGuess}
            disabled={guessInput === ""}
            style={{
              width: "100%", padding: "14px 20px", borderRadius: 10, border: "none", cursor: guessInput === "" ? "default" : "pointer",
              opacity: guessInput === "" ? 0.5 : 1, fontSize: 15, fontWeight: 800, textTransform: "uppercase",
              background: "linear-gradient(135deg, #ffd700, #c9a84c)", color: "#05010f",
              fontFamily: "'Orbitron', 'Segoe UI', sans-serif",
            }}
          >
            Submit Guess
          </button>
        </>
      )}

      {state.phase === "guessing" && myGuess != null && (
        <p style={{ color: "#6b4f99", fontSize: 14, fontStyle: "italic" }}>You guessed <strong style={{ color: "#ffd700" }}>{myGuess}</strong> — waiting on everyone else...</p>
      )}

      {state.phase === "deciding" && myGuess == null && (
        <p style={{ color: "#6b4f99", fontSize: 14, fontStyle: "italic" }}>You didn't guess this round — sitting it out safely.</p>
      )}

      {state.phase === "deciding" && myGuess != null && !myDecision && (
        <>
          <p style={{ color: "#f5f0ff", fontSize: 14, margin: "0 0 4px" }}>Every guess is up on the big screen.</p>
          <p style={{ color: "#a68fd6", fontSize: 13, margin: "0 0 16px" }}>You guessed <strong style={{ color: "#ffd700" }}>{myGuess}</strong> — stay near the hoard, or fold back to safety?</p>
          <div style={{ display: "grid", gap: 10 }}>
            <button onClick={() => decide("stay")} style={{
              padding: "16px 24px", borderRadius: 10, border: "2px solid #ff3860", background: "rgba(255,56,96,0.1)",
              color: "#ff3860", fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: "'Orbitron', 'Segoe UI', sans-serif",
            }}>
              🔥 Stay
            </button>
            <button onClick={() => decide("fold")} style={{
              padding: "16px 24px", borderRadius: 10, border: "2px solid #00ff9d", background: "rgba(0,255,157,0.1)",
              color: "#00ff9d", fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: "'Orbitron', 'Segoe UI', sans-serif",
            }}>
              🛡️ Fold
            </button>
          </div>
        </>
      )}

      {state.phase === "deciding" && myDecision && (
        <p style={{ color: "#6b4f99", fontSize: 14, fontStyle: "italic" }}>
          {myDecision === "stay" ? "🔥 Staying — waiting on everyone else..." : "🛡️ Folded — you're safe this round."}
        </p>
      )}

      {state.phase === "resolved" && state.lastOutcome && (
        <>
          {myGuess == null ? (
            <p style={{ color: "#a68fd6", fontSize: 14 }}>You sat this round out — no change.</p>
          ) : myDecision !== "stay" ? (
            <p style={{ color: "#a68fd6", fontSize: 14 }}>You folded — no change. The true count was <strong style={{ color: "#ffd700" }}>{state.lastOutcome.targetCount}</strong>.</p>
          ) : wasEliminatedThisReveal ? (
            <p style={{ color: "#ff3860", fontSize: 16, fontWeight: 700 }}>🗿 Farthest guess — turned to gold. True count: {state.lastOutcome.targetCount}</p>
          ) : state.lastOutcome.scorerIds.includes(player.id) ? (
            <p style={{ color: "#00ff9d", fontSize: 16, fontWeight: 700 }}>✨ Closest guess! +1 point. True count: {state.lastOutcome.targetCount}</p>
          ) : (
            <p style={{ color: "#6b4f99", fontSize: 14 }}>You stayed, but no point either way. True count: {state.lastOutcome.targetCount}</p>
          )}
          <p style={{ color: "#6b4f99", fontSize: 12, marginTop: 8 }}>{state.winnerId ? "Game over!" : "Next round starting soon..."}</p>
        </>
      )}
    </Card>
  );
}
