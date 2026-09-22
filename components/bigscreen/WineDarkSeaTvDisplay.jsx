import { useState, useEffect } from "react";
import { subscribeWineDarkSea, tickWineDarkSea, placementValue } from "../../lib/games/wineDarkSeaData";
import { BOARD_SIZE } from "../../lib/games/tsuroCore";
import { EDGE_POINT_FRACTION, colorForPlayer } from "../../lib/games/tsuroTileArt";
import TsuroTileSvg from "../games/TsuroTileSvg";

const CELL = 64;
const GAP = 3;
const STEP = CELL + GAP;
const BOARD_PX = BOARD_SIZE * CELL + (BOARD_SIZE - 1) * GAP;

// ─── Big Screen: The Wine-Dark Sea ───
// See lib/games/wineDarkSeaData.js for the full mechanic — same board
// display as River Styx (components/bigscreen/RiverStyxTvDisplay.jsx),
// plus Charybdis's whirlpools drawn directly on the grid. A phone
// (components/games/WineDarkSeaPlayer.jsx) only ever shows its own
// hand and a rotate/confirm control.
export default function WineDarkSeaTvDisplay({ gameId, round, players, settings }) {
  const [state, setState] = useState(null);
  useEffect(() => subscribeWineDarkSea(gameId, round.round, setState), [gameId, round.round]);

  useEffect(() => {
    const id = setInterval(() => tickWineDarkSea(gameId, round.round, settings), 1500);
    return () => clearInterval(id);
  }, [gameId, round.round, settings]);

  if (!state) return <div style={{ textAlign: "center", color: "#6b4f99", padding: 60 }}>Loading...</div>;

  const byId = {};
  (players || []).forEach((p) => (byId[p.id] = p.display_name));

  if (state.gameEnded) {
    const ranked = [...state.participantIds].sort((a, b) => placementValue(state, b) - placementValue(state, a));
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <div style={{ fontSize: 14, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 3, marginBottom: 12 }}>🌀 The Wine-Dark Sea — The Voyage Ends</div>
        <p style={{ fontSize: 24, color: "#4fc3f7", fontWeight: 800, fontFamily: "'Orbitron', 'Segoe UI', sans-serif", margin: "0 0 24px" }}>
          {state.winnerIds.length > 1
            ? `👑 Shared victory: ${state.winnerIds.map((id) => byId[id] || "?").join(", ")}`
            : `👑 ${byId[state.winnerIds[0]] || "?"}'s ship makes it home!`}
        </p>
        <div style={{ display: "grid", gap: 8, maxWidth: 420, margin: "0 auto" }}>
          {ranked.map((id) => (
            <div key={id} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0d0618", borderRadius: 8, padding: "10px 16px",
              border: `1px solid ${colorForPlayer(state.participantIds, id)}55`,
            }}>
              <span style={{ color: "#f5f0ff", fontSize: 15 }}>{state.winnerIds.includes(id) ? "👑 " : ""}{byId[id] || "?"}</span>
              <span style={{ color: colorForPlayer(state.participantIds, id), fontWeight: 800, fontSize: 15 }}>
                {state.winnerIds.includes(id) ? "Made it home" : `Lost #${state.finishOrder.indexOf(id) + 1}`}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const whoseTurn = state.turnOrder[state.turnIndex];

  return (
    <div style={{ padding: 32, display: "grid", gridTemplateColumns: `${BOARD_PX}px 1fr`, gap: 32, minHeight: "70vh", justifyContent: "center" }}>
      <div>
        <div style={{ textAlign: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 13, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 3 }}>🌀 The Wine-Dark Sea</div>
          <p style={{ color: "#00ff9d", fontSize: 14, fontWeight: 700, marginTop: 4 }}>{byId[whoseTurn] || "?"}'s turn</p>
        </div>
        <div style={{ position: "relative", width: BOARD_PX, height: BOARD_PX, margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${BOARD_SIZE}, ${CELL}px)`, gridTemplateRows: `repeat(${BOARD_SIZE}, ${CELL}px)`, gap: GAP }}>
            {Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, cell) => {
              const tile = state.tilesByCell[cell];
              return (
                <div key={cell}>
                  <TsuroTileSvg designIndex={tile?.designIndex ?? null} rotation={tile?.rotation ?? 0} size={CELL} empty={!tile} />
                </div>
              );
            })}
          </div>
          {/* Charybdis's whirlpools — drawn centered in their cell. */}
          {state.monsters.map((cell, i) => {
            const row = Math.floor(cell / BOARD_SIZE);
            const col = cell % BOARD_SIZE;
            const x = col * STEP + CELL / 2;
            const y = row * STEP + CELL / 2;
            return (
              <div key={i} style={{
                position: "absolute", left: x - 14, top: y - 14, width: 28, height: 28, borderRadius: "50%",
                background: "radial-gradient(circle, #1a0a2e 0%, #4a1f7a 55%, #b829ff 100%)",
                border: "2px solid #b829ff", boxShadow: "0 0 12px 2px rgba(184,41,255,0.6)",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, zIndex: 4,
              }}>🌀</div>
            );
          })}
          {/* Marker overlay — same edge-point positioning as River Styx. */}
          {state.participantIds.map((id) => {
            const pos = state.positions[id];
            if (pos.status !== "active" || pos.cell == null) return null;
            const row = Math.floor(pos.cell / BOARD_SIZE);
            const col = pos.cell % BOARD_SIZE;
            const [fx, fy] = EDGE_POINT_FRACTION[pos.point];
            const x = col * STEP + fx * CELL;
            const y = row * STEP + fy * CELL;
            const color = colorForPlayer(state.participantIds, id);
            return (
              <div key={id} title={byId[id]} style={{
                position: "absolute", left: x - 8, top: y - 8, width: 16, height: 16, borderRadius: "50%",
                background: color, border: "2px solid #05010f", boxShadow: id === whoseTurn ? `0 0 10px 3px ${color}` : "none",
                zIndex: 5,
              }} />
            );
          })}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 13, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 2, marginBottom: 10 }}>Ships</div>
        <div style={{ display: "grid", gap: 6, marginBottom: 22 }}>
          {state.participantIds.map((id) => {
            const alive = state.positions[id].status === "active";
            const color = colorForPlayer(state.participantIds, id);
            return (
              <div key={id} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0d0618", borderRadius: 8,
                padding: "6px 12px", opacity: alive ? 1 : 0.45, border: id === whoseTurn ? `1px solid ${color}` : "1px solid transparent",
              }}>
                <span style={{ fontSize: 13, color: "#f5f0ff", display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: color, display: "inline-block" }} />
                  {alive ? "" : "🌀 "}{byId[id] || "?"}
                </span>
                <span style={{ fontSize: 12, color: "#a68fd6" }}>{alive ? `🎴 ${(state.hands[id] || []).length}` : "sunk"}</span>
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: 13, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 2, marginBottom: 10 }}>Log</div>
        <div style={{ display: "grid", gap: 4, maxHeight: 260, overflowY: "auto" }}>
          {state.log.slice(-8).reverse().map((line, i) => (
            <p key={i} style={{ color: "#a68fd6", fontSize: 12, margin: 0, fontStyle: "italic" }}>{line}</p>
          ))}
        </div>
      </div>
    </div>
  );
}
