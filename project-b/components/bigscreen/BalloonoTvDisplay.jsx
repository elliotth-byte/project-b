import { useState, useEffect } from "react";
import { subscribeBalloono, resolveExplosions, tickBubbles } from "../../lib/games/balloonoData";
import { SatyrIcon, GhostSatyrIcon, AmphoraIcon, BubbleIcon, BlockIcon, PowerupIcon, SATYR_COLORS } from "../games/BalloonoIcons";

function cellPxFor(gridSize) {
  // Same shrink-as-the-grid-grows approach every other maze game in
  // this app already uses (see e.g. components/games/Maze2DPlayer.jsx's
  // own cell-size formula) — a bigger battle's larger board still needs
  // to fit on a TV screen.
  if (gridSize <= 11) return 40;
  if (gridSize <= 15) return 30;
  return 22;
}
const BOMB_FUSE_MS_APPROX = 2400; // matches lib/games/balloonoData.js's own BOMB_FUSE_MS — used only for the pulse-when-close visual cue below, not for any actual timing logic

// ─── Big Screen: Balloono ───
// See lib/games/balloonoData.js for the full engine and its own header
// comment on why movement here is grid-stepped rather than smooth
// pixel motion. The board renders here on the shared TV; each player's
// own phone (components/games/BalloonoTvPlayer.jsx) is a D-pad and a
// bomb button — the same TV-shows-everything, phone-is-input split
// every Big Screen battle in this app follows, which fits especially
// well here since every player needs to see the WHOLE board (where
// opponents and bombs are) at once, not just their own corner of it.
export default function BalloonoTvDisplay({ gameId, round, players }) {
  const [state, setState] = useState(null);

  useEffect(() => subscribeBalloono(gameId, round.round, setState), [gameId, round.round]);

  useEffect(() => {
    if (!state || state.winnerId) return;
    const id = setInterval(() => {
      resolveExplosions(gameId, round.round);
      tickBubbles(gameId, round.round);
    }, 300);
    return () => clearInterval(id);
  }, [state?.winnerId, gameId, round.round]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!state) return <div style={{ textAlign: "center", color: "#6b4f99", padding: 60 }}>Loading...</div>;
  const CELL_PX = cellPxFor(state.gridSize);

  const byId = {};
  (players || []).forEach((p) => (byId[p.id] = p.display_name));
  const slotColor = {};
  Object.keys(state.monkeys).forEach((id, i) => (slotColor[id] = SATYR_COLORS[i % SATYR_COLORS.length]));

  if (state.winnerId) {
    return (
      <div style={{ minHeight: "60vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
        <SatyrIcon size={110} color={slotColor[state.winnerId]} />
        <p style={{ color: "#f5f0ff", fontSize: 40, fontWeight: 800, fontFamily: "'Orbitron', 'Segoe UI', sans-serif", margin: "16px 0 0" }}>
          {byId[state.winnerId] || "?"} wins Balloono!
        </p>
      </div>
    );
  }

  const bombAt = {};
  state.bombs.forEach((b) => (bombAt[`${b.r},${b.c}`] = b));
  const monkeysAt = {};
  Object.entries(state.monkeys).forEach(([id, m]) => {
    if (m.status === "eliminated") return;
    const key = `${m.r},${m.c}`;
    (monkeysAt[key] = monkeysAt[key] || []).push([id, m]);
  });

  const alive = Object.entries(state.monkeys).filter(([, m]) => m.status !== "eliminated");

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ fontSize: 14, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 3, marginBottom: 10 }}>
        💧 Balloono — {alive.length} satyrs left
      </div>
      <div style={{
        display: "grid", gridTemplateColumns: `repeat(${state.gridSize}, ${CELL_PX}px)`, gridTemplateRows: `repeat(${state.gridSize}, ${CELL_PX}px)`,
        gap: 1, background: "#0a1f0a", border: "3px solid #3d1f5c", borderRadius: 8,
      }}>
        {state.board.map((row, r) => row.map((cellType, c) => {
          const key = `${r},${c}`;
          const bomb = bombAt[key];
          const monkeysHere = monkeysAt[key];
          const powerup = state.powerups[key];
          const bombNearFuse = bomb && Date.now() - bomb.placedAt > BOMB_FUSE_MS_APPROX - 700;
          return (
            <div key={key} style={{
              width: CELL_PX, height: CELL_PX, position: "relative",
              background: cellType === "wall" ? "#241340" : ((r + c) % 2 === 0 ? "#1a3d1a" : "#1f451f"),
            }}>
              {cellType === "block" && <BlockIcon size={CELL_PX - 4} />}
              {powerup && <div style={{ position: "absolute", inset: 0 }}><PowerupIcon type={powerup} size={CELL_PX - 8} /></div>}
              {bomb && <div style={{ position: "absolute", inset: 0 }}><AmphoraIcon size={CELL_PX - 6} pulse={bombNearFuse} /></div>}
              {monkeysHere && monkeysHere.map(([id, m], i) => (
                <div key={id} style={{ position: "absolute", inset: 0, transform: monkeysHere.length > 1 ? `translate(${i * 4 - 2}px, ${i * 4 - 2}px)` : "none", zIndex: 2 }}>
                  {m.status === "bubbled" ? (
                    <BubbleIcon size={CELL_PX}><SatyrIcon size={CELL_PX - 10} color={slotColor[id]} /></BubbleIcon>
                  ) : (
                    <SatyrIcon size={CELL_PX - 4} color={slotColor[id]} />
                  )}
                </div>
              ))}
            </div>
          );
        }))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center", marginTop: 16, maxWidth: state.gridSize * CELL_PX }}>
        {Object.entries(state.monkeys).map(([id, m]) => (
          <div key={id} style={{
            display: "flex", alignItems: "center", gap: 6, fontSize: 13, padding: "4px 10px", borderRadius: 8,
            background: "#0d0618", border: `1px solid ${m.status === "eliminated" ? "#3d1f5c" : slotColor[id]}`,
            color: m.status === "eliminated" ? "#6b4f99" : "#f5f0ff", opacity: m.status === "eliminated" ? 0.6 : 1,
          }}>
            {m.status === "eliminated" ? <GhostSatyrIcon size={18} /> : <SatyrIcon size={18} color={slotColor[id]} />}
            {byId[id] || "?"}{m.status === "bubbled" && " 🫧"}
          </div>
        ))}
      </div>
    </div>
  );
}
