import { useState, useEffect, useRef } from "react";
import { Card, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { reportScore } from "../../lib/challengeScores";
import { subscribeEyes, submitEyesAnswer, placementValue, EYES_ROUNDS_PER_GAME } from "../../lib/games/eyesInTheSystemData";
import { EyeIcon, EyesZone, EYE_COLORS } from "./EyesInTheSystemIcons";

// ─── Eyes in the System (normal mode) ───
// Everyone gets the exact same 8 rounds (see lib/games/
// eyesInTheSystemData.js's initEyesInTheSystem), but each player moves
// through them entirely on their own — no waiting on anyone else, the
// same shape lib/games/wordData.js's own per-player word sets already
// use. Most correct wins; total time across all 8 is the tiebreak
// underneath it (see placementValue's own comment for how both fold
// into one reported number).

export default function EyesInTheSystemPlayer({ gameId, round, challenge, player }) {
  const [state, setState] = useState(null);
  const [roundIndex, setRoundIndex] = useState(0);
  const [feedback, setFeedback] = useState(null); // { correct: bool, correctZone } | null
  const roundStartRef = useRef(Date.now());
  const reportedRef = useRef(false);

  useEffect(() => subscribeEyes(gameId, round.round, setState), [gameId, round.round]);

  useEffect(() => {
    if (!state) return;
    const myEntry = state.results?.[player.id];
    const answeredCount = myEntry?.answers?.length || 0;
    setRoundIndex(answeredCount);
    roundStartRef.current = Date.now();
  }, [state?.results, player.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!state) return;
    reportScore(gameId, round.round, player.id, player.name, placementValue(state, player.id), { final: false });
  }, [state?.results]); // eslint-disable-line react-hooks/exhaustive-deps

  const myEntry = state?.results?.[player.id];
  const done = myEntry?.answers?.length >= EYES_ROUNDS_PER_GAME;

  useEffect(() => {
    if ((done || !challenge?.active) && state && !reportedRef.current) {
      reportedRef.current = true;
      reportScore(gameId, round.round, player.id, player.name, placementValue(state, player.id), { final: true });
    }
  }, [done, challenge?.active, state]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!challenge?.active) {
    return <GameResultCard icon="👁" title="Eyes in the System" valueLabel={`${myEntry?.correctCount ?? 0} of ${EYES_ROUNDS_PER_GAME} correct`} />;
  }
  if (!state) return <Card style={{ marginBottom: 20, textAlign: "center" }}><p style={{ color: "#6b4f99", fontStyle: "italic" }}>Loading...</p></Card>;
  if (done) {
    return <GameResultCard icon="👁" title="Eyes in the System" valueLabel={`${myEntry.correctCount} of ${EYES_ROUNDS_PER_GAME} correct`} />;
  }

  const currentRound = state.rounds?.[roundIndex];
  // Defensive guard against a real, possible race: roundIndex (React
  // state, only updated via the effect above once state.results
  // actually changes) can briefly be stale or out of bounds relative
  // to state.rounds on the render right after a subscription update
  // lands but before that effect has re-run — without this, that
  // render would crash trying to read .zones/.targetColor/.correctZone
  // off undefined, which is exactly the kind of failure that shows up
  // to a player as "the game just isn't loading" rather than a visible
  // error. Falls back to the same loading card the initial state===null
  // case already uses, rather than crashing — the very next render
  // (once the effect catches up) recovers on its own.
  if (!currentRound) return <Card style={{ marginBottom: 20, textAlign: "center" }}><p style={{ color: "#6b4f99", fontStyle: "italic" }}>Loading...</p></Card>;

  const answer = async (zoneKey) => {
    if (feedback) return;
    const timeMs = Date.now() - roundStartRef.current;
    const correct = currentRound.correctZone === zoneKey;
    setFeedback({ correct, correctZone: currentRound.correctZone });
    await submitEyesAnswer(gameId, round.round, player.id, roundIndex, zoneKey, timeMs);
    setTimeout(() => setFeedback(null), 1200);
  };

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>👁 Eyes in the System</h3>
        <Badge>Round {roundIndex + 1} / {EYES_ROUNDS_PER_GAME}</Badge>
      </div>
      <p style={{ color: "#a68fd6", fontSize: 13, margin: "0 0 14px" }}>
        Which zone has the most <strong style={{ color: EYE_COLORS[currentRound.targetColor] }}>{currentRound.targetColor}</strong> eyes?
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10, maxWidth: 280, margin: "0 auto" }}>
        {currentRound.zones.map((zone) => (
          <EyesZone
            key={zone.zone} zone={zone} size={240}
            highlight={feedback && zone.zone === feedback.correctZone}
            onClick={() => answer(zone.zone)}
            disabled={!!feedback}
          />
        ))}
      </div>
      {feedback && (
        <p style={{ marginTop: 12, fontSize: 14, fontWeight: 700, color: feedback.correct ? "#00ff9d" : "#ff3860" }}>
          {feedback.correct ? "✅ Correct!" : `Zone ${feedback.correctZone} had the most`}
        </p>
      )}
    </Card>
  );
}
