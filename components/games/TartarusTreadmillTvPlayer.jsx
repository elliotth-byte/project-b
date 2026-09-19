import { useState, useEffect, useRef } from "react";
import { Card, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { reportScore } from "../../lib/challengeScores";
import {
  subscribeTartarusTreadmill, tickTartarusTreadmill, submitMove, submitJump, placementValue,
  TARTARUS_LANE_LENGTH,
} from "../../lib/games/tartarusTreadmillData";

// ─── Tartarus Treadmill — Big Screen (phone side) ───
// Pure controller — the lane itself only ever shows on the TV (see
// components/bigscreen/TartarusTreadmillTvDisplay.jsx). Three big
// buttons: push left/right against (or with) the belt, and jump to
// survive a falling obstacle. Moves and jumps land immediately, no
// waiting on a shared tick — see lib/games/tartarusTreadmillData.js's
// own header comment for why that's deliberate.
export default function TartarusTreadmillTvPlayer({ gameId, round, challenge, player }) {
  const [state, setState] = useState(null);
  const reportedRef = useRef(false);

  useEffect(() => subscribeTartarusTreadmill(gameId, round.round, setState), [gameId, round.round]);

  useEffect(() => {
    const id = setInterval(() => tickTartarusTreadmill(gameId, round.round), 250);
    return () => clearInterval(id);
  }, [gameId, round.round]);

  useEffect(() => {
    if (!state) return;
    reportScore(gameId, round.round, player.id, player.name, placementValue(state, player.id), { final: false });
  }, [state?.stepCount, state?.eliminatedInRound]); // eslint-disable-line react-hooks/exhaustive-deps

  const iAmAlive = state?.alive?.[player.id];
  useEffect(() => {
    const gameOver = !challenge?.active || (state && !iAmAlive);
    if (gameOver && state && !reportedRef.current) {
      reportedRef.current = true;
      reportScore(gameId, round.round, player.id, player.name, placementValue(state, player.id), { final: true });
    }
  }, [challenge?.active, state, iAmAlive]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!challenge?.active) {
    const myValue = state ? placementValue(state, player.id) : 0;
    return <GameResultCard icon="🌀" title="Tartarus Treadmill" valueLabel={myValue >= 100000 ? "Survived!" : `Reached step ${myValue % 1000}`} />;
  }
  if (!state) return <Card style={{ marginBottom: 20, textAlign: "center" }}><p style={{ color: "#6b4f99", fontStyle: "italic" }}>Loading...</p></Card>;
  if (!iAmAlive) return <GameResultCard icon="🌀" title="Fell into Tartarus" valueLabel={state.ended && state.winnerId === player.id ? "Survived!" : "Eliminated"} />;

  const myPosition = state.positions[player.id];
  const distanceToEdge = TARTARUS_LANE_LENGTH - 1 - myPosition;
  const move = (dir) => submitMove(gameId, round.round, player.id, dir);
  const jump = () => submitJump(gameId, round.round, player.id);

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🌀 Tartarus Treadmill</h3>
        <Badge color={distanceToEdge <= 3 ? "#ff3860" : "#00ff9d"}>{distanceToEdge} from the edge</Badge>
      </div>
      <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 16px" }}>
        Belt pushing {state.beltDirection === 1 ? "toward Tartarus" : "toward safety"} — watch the big screen for falling debris.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
        <button onClick={() => move(-1)} style={{
          padding: "22px 10px", borderRadius: 10, border: "2px solid #00ff9d", background: "rgba(0,255,157,0.1)",
          color: "#00ff9d", fontSize: 20, fontWeight: 800, cursor: "pointer",
        }}>
          ◀ Push
        </button>
        <button onClick={() => move(1)} style={{
          padding: "22px 10px", borderRadius: 10, border: "2px solid #ff3860", background: "rgba(255,56,96,0.1)",
          color: "#ff3860", fontSize: 20, fontWeight: 800, cursor: "pointer",
        }}>
          Push ▶
        </button>
      </div>
      <button onClick={jump} style={{
        width: "100%", padding: "18px 10px", borderRadius: 10, border: "2px solid #ffd700", background: "rgba(255,215,0,0.12)",
        color: "#ffd700", fontSize: 18, fontWeight: 800, cursor: "pointer", fontFamily: "'Orbitron', 'Segoe UI', sans-serif",
      }}>
        ⤴ JUMP
      </button>
    </Card>
  );
}
