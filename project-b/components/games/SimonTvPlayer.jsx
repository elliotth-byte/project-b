import { useState, useEffect, useRef } from "react";
import { Card, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { reportScore } from "../../lib/challengeScores";
import { subscribeSimonTv, submitSimonTap, placementValue } from "../../lib/games/simonTvData";

// Same 4 pad colors as components/games/SimonPlayer.jsx and
// components/bigscreen/SimonTvDisplay.jsx — no pitches needed here
// (the TV plays the tones; this side is silent, pure input).
const PAD_COLORS = ["#ff2d95", "#00d9ff", "#ffd700", "#00ff9d"];

// ─── Simon — Big Screen (phone side) ───
// Deliberately never shows the sequence itself — see
// components/bigscreen/SimonTvDisplay.jsx's own comment on why. This
// is just 4 tappable pads, enabled only while the shared state says
// it's actually time to input, and a wrong tap here reports the same
// instant, honest "you're out" feedback the original single-player
// Simon already gives — no waiting for a round timer to confirm what
// already happened.
export default function SimonTvPlayer({ gameId, round, challenge, player }) {
  const [state, setState] = useState(null);
  const [flash, setFlash] = useState(null); // { ok: bool } | null — brief local tap feedback
  const reportedRef = useRef(false);

  useEffect(() => subscribeSimonTv(gameId, round.round, setState), [gameId, round.round]);

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
    return <GameResultCard icon="🔴" title="Simon" valueLabel={`Score: ${myScore}`} />;
  }
  if (!state) return <Card style={{ marginBottom: 20, textAlign: "center" }}><p style={{ color: "#6b4f99", fontStyle: "italic" }}>Loading...</p></Card>;

  const myProgress = state.playerProgress?.[player.id];
  const iAmAlive = myProgress?.alive !== false;
  const iWon = state.winnerId === player.id;

  if (state.winnerId || !iAmAlive) {
    const elimRound = state.eliminatedInRound?.[player.id];
    return (
      <GameResultCard
        icon={iWon ? "🏆" : "🔴"}
        title={iWon ? "Last One Standing!" : "Sequence Broken"}
        valueLabel={iWon ? "You won" : elimRound ? `Eliminated in round ${elimRound}` : "Game over"}
      />
    );
  }

  const canTap = state.phase === "input" && myProgress?.thisRoundStatus === "playing";

  const tap = async (padIdx) => {
    if (!canTap) return;
    await submitSimonTap(gameId, round.round, player.id, padIdx);
    setFlash({ padIdx });
    setTimeout(() => setFlash(null), 150);
  };

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🔴 Simon</h3>
        <Badge>Round {state.roundNum}</Badge>
      </div>
      <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 16px" }}>
        {state.phase === "playback" ? "Watch the big screen..." : myProgress?.thisRoundStatus === "correct" ? "Nice! Waiting on everyone else..." : "Repeat what you just watched"}
      </p>
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(2, 100px)", gridTemplateRows: "repeat(2, 100px)", gap: 6,
        margin: "0 auto", width: "fit-content",
      }}>
        {PAD_COLORS.map((color, i) => {
          const outerRadius = 50;
          const cornerRadius = [i === 0 ? outerRadius : 4, i === 1 ? outerRadius : 4, i === 3 ? outerRadius : 4, i === 2 ? outerRadius : 4].join("px ") + "px";
          const isFlashing = flash?.padIdx === i;
          return (
            <button
              key={i} onClick={() => tap(i)} disabled={!canTap}
              style={{
                width: 100, height: 100, borderRadius: cornerRadius, cursor: canTap ? "pointer" : "default",
                background: isFlashing ? `radial-gradient(circle at 50% 50%, ${color}, ${color}cc)` : `radial-gradient(circle at 50% 50%, ${color}33, ${color}11)`,
                border: `2px solid ${color}`, opacity: canTap ? 1 : 0.5,
                boxShadow: isFlashing ? `0 0 20px ${color}` : "none",
              }}
            />
          );
        })}
      </div>
    </Card>
  );
}
