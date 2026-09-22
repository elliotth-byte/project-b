import { useState, useEffect, useRef } from "react";
import { Card, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { reportScore } from "../../lib/challengeScores";
import { subscribePoseidonsPool, submitShot, tickPoseidonsPool, placementValue } from "../../lib/games/poseidonsPoolData";

const MAX_DRAG_PX = 100; // full-power drag distance, in on-screen pixels

// ─── Poseidon's Pool — Big Screen (phone side) ───
// Per this game's own design brief: the table itself only ever shows on
// the TV (components/bigscreen/PoseidonsPoolTvDisplay.jsx) — your phone
// is purely an aim/power device, no table rendering at all. Press and
// drag back from the center of the pad below to set your angle and
// power (like pulling back a slingshot — you shoot in the direction
// you're dragging AWAY from), release to shoot. Same control feel as
// components/games/MiniGolfTvPlayer.jsx and the full-table regular mode
// (components/games/PoseidonsPoolPlayer.jsx) — only the missing table
// differs here.
export default function PoseidonsPoolTvPlayer({ gameId, round, challenge, player }) {
  const [state, setState] = useState(null);
  const [drag, setDrag] = useState(null);
  const [cooldownLeftMs, setCooldownLeftMs] = useState(0);
  const padRef = useRef(null);
  const reportedFinalRef = useRef(false);

  useEffect(() => subscribePoseidonsPool(gameId, round.round, setState), [gameId, round.round]);

  useEffect(() => {
    if (!state || state.gameEnded) return;
    const id = setInterval(() => tickPoseidonsPool(gameId, round.round, challenge?.endsAt), 700);
    return () => clearInterval(id);
  }, [gameId, round.round, state?.gameEnded, challenge?.endsAt]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!state) return;
    const tickCooldown = () => setCooldownLeftMs(Math.max(0, (state.cooldownUntil?.[player.id] || 0) - Date.now()));
    tickCooldown();
    const id = setInterval(tickCooldown, 250);
    return () => clearInterval(id);
  }, [state?.cooldownUntil, player.id]);

  useEffect(() => {
    if (!state || state.degenerate) return;
    reportScore(gameId, round.round, player.id, player.name, placementValue(state, player.id), { final: false });
  }, [state?.eliminatedOrder?.length, state?.gameEnded]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!state || !state.gameEnded || reportedFinalRef.current) return;
    reportedFinalRef.current = true;
    reportScore(gameId, round.round, player.id, player.name, placementValue(state, player.id), { final: true });
  }, [state?.gameEnded]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!challenge?.active) return null;
  if (!state) return <Card style={{ marginBottom: 20, textAlign: "center" }}><p style={{ color: "#6b4f99", fontStyle: "italic" }}>Loading...</p></Card>;

  if (state.degenerate) {
    return <GameResultCard icon="🎱" title="No One To Play Against" valueLabel="You win by default" />;
  }

  if (state.gameEnded) {
    const iWon = state.winnerIds.includes(player.id);
    const label = iWon
      ? (state.winnerIds.length > 1 ? "Shared victory — check the big screen" : "You cleared the table!")
      : "Your ball was sunk — check the big screen for how it ends.";
    return <GameResultCard icon="🎱" title={iWon ? "Victory!" : "Table Cleared"} valueLabel={label} />;
  }

  const myBall = state.balls[player.id];
  if (!myBall) return <Card style={{ marginBottom: 20, textAlign: "center" }}><p style={{ color: "#6b4f99", fontStyle: "italic" }}>Not in this Battle.</p></Card>;

  const iAmEliminated = !!myBall.eliminated;
  const onCooldown = cooldownLeftMs > 0;
  const shotQueuedByMe = state.queue.some((q) => q.playerId === player.id);
  const canShoot = !iAmEliminated && !onCooldown && !shotQueuedByMe && !state.gameEnded;

  const getRelative = (e) => {
    const rect = padRef.current.getBoundingClientRect();
    const point = e.touches ? e.touches[0] : e;
    return { x: point.clientX - (rect.left + rect.width / 2), y: point.clientY - (rect.top + rect.height / 2) };
  };
  const onStart = (e) => {
    if (!canShoot) return;
    e.preventDefault();
    setDrag({ dx: 0, dy: 0 });
  };
  const onMove = (e) => {
    if (!drag) return;
    e.preventDefault();
    const { x, y } = getRelative(e);
    setDrag({ dx: x, dy: y });
  };
  const onEnd = () => {
    if (!drag) return;
    const dist = Math.hypot(drag.dx, drag.dy);
    if (dist > 8 && canShoot) {
      const angle = Math.atan2(-drag.dy, -drag.dx);
      const power = Math.min(1, dist / MAX_DRAG_PX);
      submitShot(gameId, round.round, player.id, angle, power);
    }
    setDrag(null);
  };

  const dragDist = drag ? Math.min(MAX_DRAG_PX, Math.hypot(drag.dx, drag.dy)) : 0;
  const dragAngle = drag ? Math.atan2(drag.dy, drag.dx) : 0;
  const aimX = drag ? Math.cos(dragAngle) * dragDist : 0;
  const aimY = drag ? Math.sin(dragAngle) * dragDist : 0;
  const power = dragDist / MAX_DRAG_PX;

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🎱 Poseidon's Pool</h3>
        <Badge color="#00ff9d">{iAmEliminated ? "Eliminated" : shotQueuedByMe ? "Queued" : canShoot ? "Your shot" : "Reloading"}</Badge>
      </div>

      {iAmEliminated ? (
        <p style={{ color: "#ff3860", fontSize: 14, fontWeight: 700, margin: "20px 0" }}>💀 Your ball was sunk — watch the big screen.</p>
      ) : (
        <>
          <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 12px" }}>
            {shotQueuedByMe ? "Your shot is lined up — watch the big screen." : onCooldown ? `Reloading — ${Math.ceil(cooldownLeftMs / 1000)}s` : "Press and drag back, then let go to shoot — watch your ball on the big screen."}
          </p>
          <div
            ref={padRef}
            onMouseDown={onStart}
            onMouseMove={onMove}
            onMouseUp={onEnd}
            onMouseLeave={onEnd}
            onTouchStart={onStart}
            onTouchMove={onMove}
            onTouchEnd={onEnd}
            style={{
              position: "relative", width: 240, height: 240, margin: "0 auto", borderRadius: "50%",
              background: canShoot ? "rgba(0,255,157,0.05)" : "#0d0618",
              border: `2px solid ${canShoot ? "#00ff9d" : "#3d1f5c"}`, touchAction: "none", userSelect: "none",
            }}
          >
            {drag && (
              <svg width="240" height="240" style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}>
                <line x1={120} y1={120} x2={120 + aimX} y2={120 + aimY} stroke="#ffd700" strokeWidth={4} strokeLinecap="round" />
              </svg>
            )}
            <div style={{
              position: "absolute", top: "50%", left: "50%", width: 24, height: 24, borderRadius: "50%",
              background: "#f5f0ff", transform: "translate(-50%, -50%)",
            }} />
          </div>
          {drag && (
            <div style={{ marginTop: 12 }}>
              <div style={{ height: 8, borderRadius: 4, background: "#0d0618", overflow: "hidden", maxWidth: 240, margin: "0 auto" }}>
                <div style={{ height: "100%", width: `${power * 100}%`, background: power > 0.8 ? "#ff3860" : power > 0.4 ? "#ffd700" : "#00ff9d" }} />
              </div>
              <p style={{ color: "#6b4f99", fontSize: 11, marginTop: 4 }}>Power: {Math.round(power * 100)}%</p>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
