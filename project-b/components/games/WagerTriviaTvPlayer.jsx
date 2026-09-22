import { useState, useEffect, useRef } from "react";
import { Card, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { reportScore } from "../../lib/challengeScores";
import { subscribeWagerTrivia, submitDecision, submitAnswer, tickWagerTrivia, placementValue } from "../../lib/games/wagerTriviaTvData";

// ─── Wager Trivia — Big Screen (phone side) ───
// Deliberately blind to the question during "deciding" — the category
// and difficulty (shown on the TV, see components/bigscreen/
// WagerTriviaTvDisplay.jsx) are all a player has to go on when opting
// in or staying safe. The question itself only ever shows here once
// the player is actually "in" and the shared phase has moved past
// deciding — someone who opted out stays on a simple waiting screen,
// on purpose, so they can't see the question either (that's the whole
// point of the wager).
export default function WagerTriviaTvPlayer({ gameId, round, challenge, player }) {
  const [state, setState] = useState(null);
  const [now, setNow] = useState(Date.now());
  const reportedRef = useRef(false);

  useEffect(() => subscribeWagerTrivia(gameId, round.round, setState), [gameId, round.round]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  // Same belt-and-suspenders poll as the TV display itself — keeps a
  // solo phone from stalling a round if the TV page happens to not be
  // open at the exact moment a phase's window runs out.
  useEffect(() => {
    const id = setInterval(() => tickWagerTrivia(gameId, round.round), 500);
    return () => clearInterval(id);
  }, [gameId, round.round]);

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
    return <GameResultCard icon="🎲" title="Wager Trivia" valueLabel={`${myScore} pt${myScore === 1 ? "" : "s"}`} />;
  }
  if (!state) return <Card style={{ marginBottom: 20, textAlign: "center" }}><p style={{ color: "#6b4f99", fontStyle: "italic" }}>Loading...</p></Card>;

  const myScore = placementValue(state, player.id);
  const myDecision = state.decisions?.[player.id];
  const myAnswer = state.answers?.[player.id];

  const decide = (d) => submitDecision(gameId, round.round, player.id, d);
  const answer = (i) => submitAnswer(gameId, round.round, player.id, i);

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🎲 Wager Trivia</h3>
        <Badge color={myScore < 0 ? "#ff3860" : "#00ff9d"}>{myScore} pt{myScore === 1 ? "" : "s"}</Badge>
      </div>

      {state.phase === "deciding" && !myDecision && (
        <>
          <p style={{ color: "#a68fd6", fontSize: 13, margin: "0 0 4px" }}>Look at the big screen for the category and difficulty.</p>
          <p style={{ color: "#f5f0ff", fontSize: 14, margin: "0 0 16px" }}>Opt in on stakes alone — the question stays hidden until everyone's decided.</p>
          <div style={{ display: "grid", gap: 10 }}>
            <button onClick={() => decide("in")} style={{
              padding: "16px 24px", borderRadius: 10, border: "2px solid #00ff9d", background: "rgba(0,255,157,0.1)",
              color: "#00ff9d", fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: "'Orbitron', 'Segoe UI', sans-serif",
            }}>
              🎲 Opt In
            </button>
            <button onClick={() => decide("out")} style={{
              padding: "16px 24px", borderRadius: 10, border: "2px solid #3d1f5c", background: "#0d0618",
              color: "#a68fd6", fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: "'Orbitron', 'Segoe UI', sans-serif",
            }}>
              🛡️ Stay Safe
            </button>
          </div>
        </>
      )}

      {state.phase === "deciding" && myDecision && (
        <p style={{ color: "#6b4f99", fontSize: 14, fontStyle: "italic" }}>
          {myDecision === "in" ? "You're in — waiting on everyone else..." : "Staying safe this round — waiting on everyone else..."}
        </p>
      )}

      {state.phase === "answering" && myDecision !== "in" && (
        <p style={{ color: "#6b4f99", fontSize: 14, fontStyle: "italic" }}>You stayed safe this round — check the big screen.</p>
      )}

      {state.phase === "answering" && myDecision === "in" && myAnswer == null && (
        <>
          <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 12px" }}>Look at the big screen for the question — tap your answer below.</p>
          <div style={{ display: "grid", gap: 8 }}>
            {state.question.options.map((opt, i) => (
              <button key={i} onClick={() => answer(i)} style={{
                textAlign: "left", padding: "12px 14px", borderRadius: 8, cursor: "pointer",
                background: "#0d0618", border: "2px solid #3d1f5c", color: "#f5f0ff", fontSize: 14,
                fontFamily: "'Orbitron', 'Segoe UI', sans-serif",
              }}>
                {String.fromCharCode(65 + i)}. {opt}
              </button>
            ))}
          </div>
        </>
      )}

      {state.phase === "answering" && myDecision === "in" && myAnswer != null && (
        <p style={{ color: "#6b4f99", fontSize: 14, fontStyle: "italic" }}>Answer locked in — waiting on everyone else...</p>
      )}

      {state.phase === "resolved" && state.lastOutcome && (
        <>
          {myDecision !== "in" ? (
            <p style={{ color: "#a68fd6", fontSize: 14 }}>You stayed safe — no change to your score.</p>
          ) : state.lastOutcome.results[player.id]?.correct ? (
            <p style={{ color: "#00ff9d", fontSize: 16, fontWeight: 700 }}>✅ Correct! +{state.lastOutcome.results[player.id].delta}</p>
          ) : (
            <p style={{ color: "#ff3860", fontSize: 16, fontWeight: 700 }}>❌ Wrong — {state.lastOutcome.results[player.id]?.delta ?? 0}</p>
          )}
          <p style={{ color: "#6b4f99", fontSize: 12, marginTop: 8 }}>Next round starting soon...</p>
        </>
      )}
    </Card>
  );
}
