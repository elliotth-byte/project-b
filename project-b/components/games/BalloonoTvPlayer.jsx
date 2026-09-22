import { useState, useEffect, useRef } from "react";
import { Card, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { reportScore } from "../../lib/challengeScores";
import {
  subscribeBalloono, moveMonkey, placeBomb, resolveExplosions, tickBubbles, placementValue,
} from "../../lib/games/balloonoData";
import { SatyrIcon, SATYR_COLORS } from "./BalloonoIcons";

// Display names for SATYR_COLORS, same order — used only so the
// phone can tell a player which satyr is theirs in plain words
// ("you're the green satyr") rather than leaving them to guess from a
// hex code.
const COLOR_NAMES = ["orange", "green", "blue", "gold", "purple", "pink", "tangerine", "teal", "brown", "indigo"];

// ─── Balloono (phone side) ───
// A D-pad and a bomb button — the board itself only ever renders on
// the shared TV (components/bigscreen/BalloonoTvDisplay.jsx), same
// split every Big Screen battle here follows. Each direction press
// fires one moveMonkey call; holding a direction just fires it
// repeatedly on an interval (see the hold-to-repeat handlers below) —
// the server-side movement cooldown in lib/games/balloonoData.js is
// what actually throttles how often a move can land, so this never
// needs its own rate-limiting logic, just a natural "hold to keep
// walking" feel matching the original's own arrow-key/WASD controls.
const HOLD_REPEAT_MS = 90;

export default function BalloonoTvPlayer({ gameId, round, challenge, player, players }) {
  const [state, setState] = useState(null);
  const holdIntervalRef = useRef(null);
  const reportedRef = useRef(false);

  useEffect(() => subscribeBalloono(gameId, round.round, setState), [gameId, round.round]);

  useEffect(() => {
    if (!state || state.winnerId) return;
    const id = setInterval(() => {
      resolveExplosions(gameId, round.round);
      tickBubbles(gameId, round.round);
    }, 300);
    return () => clearInterval(id);
  }, [state?.winnerId, gameId, round.round]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => { if (holdIntervalRef.current) window.clearInterval(holdIntervalRef.current); };
  }, []);

  useEffect(() => {
    if (!state) return;
    reportScore(gameId, round.round, player.id, player.name, placementValue(state, player.id), { final: false });
  }, [state?.eliminatedOrder?.length, state?.winnerId]); // eslint-disable-line react-hooks/exhaustive-deps

  const myMonkey = state?.monkeys?.[player.id];
  const iAmEliminated = myMonkey?.status === "eliminated";
  useEffect(() => {
    const gameOver = !challenge?.active || !!state?.winnerId || iAmEliminated;
    if (gameOver && state && !reportedRef.current) {
      reportedRef.current = true;
      reportScore(gameId, round.round, player.id, player.name, placementValue(state, player.id), { final: true });
    }
  }, [challenge?.active, state, iAmEliminated]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!challenge?.active) {
    const myScore = state ? placementValue(state, player.id) : 0;
    return <GameResultCard icon="💧" title="Balloono" valueLabel={`Score: ${myScore}`} />;
  }
  if (!state) return <Card style={{ marginBottom: 20, textAlign: "center" }}><p style={{ color: "#6b4f99", fontStyle: "italic" }}>Loading...</p></Card>;

  if (!myMonkey) {
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>💧</div>
        <p style={{ color: "#a68fd6", fontSize: 13, margin: 0 }}>Watching this one from the sidelines — the maze is full.</p>
      </Card>
    );
  }

  if (state.winnerId === player.id) return <GameResultCard icon="🏆" title="Last Satyr Standing!" valueLabel="You won" />;
  if (state.winnerId) return <GameResultCard icon="💧" title="Balloono" valueLabel="Someone else won" />;
  if (iAmEliminated) {
    const place = state.eliminatedOrder.indexOf(player.id);
    return <GameResultCard icon="💧" title="Popped!" valueLabel={place !== -1 ? `Eliminated ${place + 1}${["st","nd","rd"][place] || "th"}` : "Eliminated"} />;
  }

  const isBubbled = myMonkey.status === "bubbled";
  const mySlotIndex = Object.keys(state.monkeys).indexOf(player.id) % SATYR_COLORS.length;
  const myColor = SATYR_COLORS[mySlotIndex];
  const myColorName = COLOR_NAMES[mySlotIndex];

  const startHold = (direction) => {
    if (isBubbled) return;
    moveMonkey(gameId, round.round, player.id, direction);
    if (holdIntervalRef.current) window.clearInterval(holdIntervalRef.current);
    holdIntervalRef.current = window.setInterval(() => moveMonkey(gameId, round.round, player.id, direction), HOLD_REPEAT_MS);
  };
  const stopHold = () => {
    if (holdIntervalRef.current) { window.clearInterval(holdIntervalRef.current); holdIntervalRef.current = null; }
  };
  const drop = () => { if (!isBubbled) placeBomb(gameId, round.round, player.id); };

  const bombsAvailable = myMonkey.maxBombs - myMonkey.bombsPlaced;

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif", display: "flex", alignItems: "center", gap: 6 }}>
          <SatyrIcon size={20} color={myColor} /> Balloono
        </h3>
        <Badge>{Object.values(state.monkeys).filter((m) => m.status !== "eliminated").length} left</Badge>
      </div>

      {isBubbled ? (
        <p style={{ color: "#ff3860", fontSize: 14, fontWeight: 700, margin: "0 0 14px" }}>🫧 Trapped in a bubble! Hope nobody finds you...</p>
      ) : (
        <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 14px" }}>Look at the big screen — you're the {myColorName} satyr.</p>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 64px)", gridTemplateRows: "repeat(3, 64px)", gap: 4, margin: "0 auto 14px", opacity: isBubbled ? 0.4 : 1 }}>
        <div />
        <DPadButton dir="↑" onDown={() => startHold("up")} onUp={stopHold} disabled={isBubbled} />
        <div />
        <DPadButton dir="←" onDown={() => startHold("left")} onUp={stopHold} disabled={isBubbled} />
        <button
          onClick={drop} disabled={isBubbled || bombsAvailable <= 0}
          style={{
            borderRadius: 12, background: bombsAvailable > 0 ? "linear-gradient(135deg, #4a90d9, #2a6bb0)" : "#3d1f5c",
            border: "none", color: "#fff", fontSize: 24, cursor: bombsAvailable > 0 && !isBubbled ? "pointer" : "default",
          }}
        >
          💧
        </button>
        <DPadButton dir="→" onDown={() => startHold("right")} onUp={stopHold} disabled={isBubbled} />
        <div />
        <DPadButton dir="↓" onDown={() => startHold("down")} onUp={stopHold} disabled={isBubbled} />
        <div />
      </div>

      <p style={{ fontSize: 11, color: "#6b4f99", margin: 0 }}>
        {bombsAvailable} of {myMonkey.maxBombs} amphorae ready · range {myMonkey.range} · speed x{myMonkey.speed.toFixed(1)}
      </p>
    </Card>
  );
}

function DPadButton({ dir, onDown, onUp, disabled }) {
  return (
    <button
      onPointerDown={onDown} onPointerUp={onUp} onPointerLeave={onUp} onPointerCancel={onUp}
      disabled={disabled}
      style={{
        borderRadius: 10, background: "#0d0618", border: "2px solid #3d1f5c", color: "#f5f0ff",
        fontSize: 24, cursor: disabled ? "default" : "pointer", userSelect: "none", touchAction: "none",
      }}
    >
      {dir}
    </button>
  );
}
