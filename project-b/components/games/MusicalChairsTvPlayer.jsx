import { useState, useEffect, useRef } from "react";
import { Card, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { reportScore } from "../../lib/challengeScores";
import { subscribeMusicalChairsTv, submitMusicalChairsAnswer, placementValue } from "../../lib/games/musicalChairsTvData";

// ─── Musical Chairs — Big Screen (phone side) ───
// The question itself lives only on the TV (see components/bigscreen/
// MusicalChairsTvDisplay.jsx) — this is the answer options, plus this
// player's own lockout countdown after a wrong guess. Deliberately a
// per-player, client-side-only countdown display (lockedUntil is a
// real timestamp in shared state, this just renders the remaining
// time against it) — the actual enforcement of the lockout happens
// server-side in submitMusicalChairsAnswer itself, so a player can't
// get around it by refreshing or fiddling with their own clock.
export default function MusicalChairsTvPlayer({ gameId, round, challenge, player }) {
  const [state, setState] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [wrongFlash, setWrongFlash] = useState(false);
  const reportedRef = useRef(false);

  useEffect(() => subscribeMusicalChairsTv(gameId, round.round, setState), [gameId, round.round]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!state) return;
    reportScore(gameId, round.round, player.id, player.name, placementValue(state, player.id), { final: false });
  }, [state?.roundNum, state?.winnerId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const gameOver = !challenge?.active || !!state?.winnerId || state?.playerProgress?.[player.id]?.alive === false;
    if (gameOver && state && !reportedRef.current) {
      reportedRef.current = true;
      reportScore(gameId, round.round, player.id, player.name, placementValue(state, player.id), { final: true });
    }
  }, [challenge?.active, state]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!challenge?.active) {
    const myScore = state ? placementValue(state, player.id) : 0;
    return <GameResultCard icon="🎵" title="Musical Chairs" valueLabel={`Score: ${myScore}`} />;
  }
  if (!state) return <Card style={{ marginBottom: 20, textAlign: "center" }}><p style={{ color: "#6b4f99", fontStyle: "italic" }}>Loading...</p></Card>;

  const myProgress = state.playerProgress?.[player.id];
  const iAmAlive = myProgress?.alive !== false;
  const iWon = state.winnerId === player.id;

  if (state.winnerId || !iAmAlive) {
    const elimRound = state.eliminatedInRound?.[player.id];
    return (
      <GameResultCard
        icon={iWon ? "🏆" : "🎵"}
        title={iWon ? "Last Chair Standing!" : "No Chair Left"}
        valueLabel={iWon ? "You won" : elimRound ? `Eliminated in round ${elimRound}` : "Game over"}
      />
    );
  }

  const lockedMsRemaining = myProgress?.lockedUntil ? Math.max(0, myProgress.lockedUntil - now) : 0;
  const isLocked = lockedMsRemaining > 0;
  const gotChair = myProgress?.status === "safe";

  const answer = async (idx) => {
    if (gotChair || isLocked) return;
    const wasCorrect = idx === state.question.answer;
    await submitMusicalChairsAnswer(gameId, round.round, player.id, idx);
    if (!wasCorrect) {
      setWrongFlash(true);
      setTimeout(() => setWrongFlash(false), 300);
    }
  };

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🎵 Musical Chairs</h3>
        <Badge>Round {state.roundNum}</Badge>
      </div>

      {gotChair ? (
        <p style={{ color: "#00ff9d", fontSize: 15, fontWeight: 700, margin: "20px 0" }}>🪑 You've got a chair! Waiting on everyone else...</p>
      ) : isLocked ? (
        <p style={{ color: "#ff3860", fontSize: 15, fontWeight: 700, margin: "20px 0" }}>Locked out — try again in {Math.ceil(lockedMsRemaining / 1000)}s</p>
      ) : (
        <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 16px" }}>Answer fast — chairs are limited.</p>
      )}

      <div style={{ display: "grid", gap: 8, opacity: gotChair || isLocked ? 0.4 : 1, border: wrongFlash ? "2px solid #ff3860" : "2px solid transparent", borderRadius: 10, padding: 4, transition: "border-color 0.1s" }}>
        {state.question.options.map((opt, i) => (
          <button
            key={i} onClick={() => answer(i)} disabled={gotChair || isLocked}
            style={{
              padding: "12px 16px", borderRadius: 8, textAlign: "left", fontSize: 14,
              background: "#0d0618", border: "2px solid #3d1f5c", color: "#f5f0ff",
              cursor: gotChair || isLocked ? "default" : "pointer",
            }}
          >
            {opt}
          </button>
        ))}
      </div>
    </Card>
  );
}
