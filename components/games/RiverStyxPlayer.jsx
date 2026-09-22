import { useState, useEffect, useRef } from "react";
import { Card, Btn, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import TsuroTileSvg from "./TsuroTileSvg";
import { reportScore } from "../../lib/challengeScores";
import { subscribeRiverStyx, submitPlacement, tickRiverStyx, placementValue } from "../../lib/games/riverStyxData";

// ─── River Styx — Big Screen (phone side) ───
// Per this game's own design brief: the shared board, everyone's
// shades, and the log only ever show on the TV (see
// components/bigscreen/RiverStyxTvDisplay.jsx). Your phone is purely
// your own hand of 3 tiles — pick one, rotate it, and, only on your
// turn, confirm the placement. Which cell it lands in and which of
// your shade's edges it enters through are both forced by the game
// state, not something you choose here.
export default function RiverStyxPlayer({ gameId, round, player, players, settings }) {
  const [state, setState] = useState(null);
  const [selected, setSelected] = useState(0);
  const [rotation, setRotation] = useState(0);
  const [placing, setPlacing] = useState(false);
  const reportedRef = useRef(false);

  useEffect(() => subscribeRiverStyx(gameId, round.round, setState), [gameId, round.round]);

  useEffect(() => {
    const id = setInterval(() => tickRiverStyx(gameId, round.round, settings), 1500);
    return () => clearInterval(id);
  }, [gameId, round.round, settings]);

  useEffect(() => { setSelected(0); setRotation(0); }, [state?.hands?.[player.id]?.length]);

  useEffect(() => {
    if (state?.gameEnded && !reportedRef.current) {
      reportedRef.current = true;
      reportScore(gameId, round.round, player.id, player.name, placementValue(state, player.id), { final: true });
    }
  }, [state?.gameEnded]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!state) return <Card style={{ marginBottom: 20, textAlign: "center" }}><p style={{ color: "#6b4f99", fontStyle: "italic" }}>Loading...</p></Card>;

  const byId = {};
  (players || []).forEach((p) => (byId[p.id] = p.display_name || p.name));

  if (state.gameEnded) {
    const iWon = state.winnerIds.includes(player.id);
    const label = state.winnerIds.length > 1
      ? `Shared victory with ${state.winnerIds.filter((id) => id !== player.id).map((id) => byId[id] || "?").join(", ") || "the rest"}`
      : iWon ? "You crossed the Styx unscathed!" : "Your shade was lost to the river.";
    return <GameResultCard icon="💀" title={iWon ? "Victory!" : "The Crossing Ends"} valueLabel={label} />;
  }

  const myStatus = state.positions[player.id]?.status;
  const myTurn = state.turnOrder[state.turnIndex] === player.id;

  if (myStatus === "eliminated") {
    const fellAt = state.finishOrder.indexOf(player.id);
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <div style={{ fontSize: 28, marginBottom: 6 }}>💀</div>
        <h3 style={{ color: "#ff2d95", margin: "0 0 8px", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>Lost to the Styx</h3>
        <p style={{ color: "#a68fd6", fontSize: 13 }}>
          You fell {fellAt >= 0 ? `${fellAt + 1}${["st", "nd", "rd"][fellAt] || "th"}` : ""} — watch the big screen for how the crossing ends.
        </p>
      </Card>
    );
  }

  const hand = state.hands[player.id] || [];
  const activeCount = state.participantIds.filter((id) => state.positions[id].status === "active").length;

  if (!myTurn) {
    const whoseTurn = byId[state.turnOrder[state.turnIndex]] || "?";
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>💀 River Styx</h3>
          <Badge>{activeCount} shades left</Badge>
        </div>
        <p style={{ color: "#a68fd6", fontSize: 14, margin: "0 0 14px" }}>Waiting on <strong>{whoseTurn}</strong>'s turn...</p>
        <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
          {hand.map((designIndex, i) => (
            <TsuroTileSvg key={i} designIndex={designIndex} rotation={0} size={54} dim />
          ))}
        </div>
        <p style={{ color: "#6b4f99", fontSize: 11, marginTop: 10 }}>Your hand — ready for your turn.</p>
      </Card>
    );
  }

  const confirm = async () => {
    setPlacing(true);
    await submitPlacement(gameId, round.round, player.id, selected, rotation);
    setPlacing(false);
  };

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>💀 River Styx</h3>
        <Badge>{activeCount} shades left</Badge>
      </div>
      <p style={{ color: "#00ff9d", fontSize: 13, fontWeight: 700, margin: "0 0 12px" }}>Your turn — pick and place a tile!</p>

      <div style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 14 }}>
        {hand.map((designIndex, i) => (
          <div
            key={i} onClick={() => setSelected(i)}
            style={{
              cursor: "pointer", borderRadius: 8, padding: 3,
              border: `2px solid ${selected === i ? "#ffd700" : "transparent"}`,
              boxShadow: selected === i ? "0 0 12px rgba(255,215,0,0.5)" : "none",
            }}
          >
            <TsuroTileSvg designIndex={designIndex} rotation={selected === i ? rotation : 0} size={64} />
          </div>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 14 }}>
        <Btn small variant="ghost" onClick={() => setRotation((r) => (r + 1) % 4)}>🔄 Rotate</Btn>
      </div>

      <Btn onClick={confirm} disabled={placing}>{placing ? "Placing..." : "⚔️ Place Tile"}</Btn>
      <p style={{ color: "#6b4f99", fontSize: 11, marginTop: 10, fontStyle: "italic" }}>
        Look at the big screen — your shade enters wherever it's currently facing.
      </p>
    </Card>
  );
}
