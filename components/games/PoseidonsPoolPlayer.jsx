import { useState, useEffect, useRef } from "react";
import { Card, Btn, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import PoseidonsPoolTable from "./PoseidonsPoolTable";
import { reportScore } from "../../lib/challengeScores";
import { subscribePoseidonsPool, submitShot, tickPoseidonsPool, placementValue } from "../../lib/games/poseidonsPoolData";

const MAX_DRAG_PX = 100; // full-power drag distance, in on-screen pixels

// ─── Poseidon's Pool (regular mode, phone side) ───
// Unlike the Big Screen companion mode's phone view (PoseidonsPoolTvPlayer.jsx,
// deliberately aim/power-only), this shows the FULL shared table — every
// ball, live positions, pockets — right here on the phone, since there's
// no separate screen for it to live on. Drag back on the pad below the
// table (like pulling back a slingshot — same control feel as
// components/games/MiniGolfTvPlayer.jsx) to aim and set power, release
// to shoot. Disabled during your own cooldown, while a shot of yours is
// still queued/resolving, or once you're eliminated (spectating the
// live table from then on).
export default function PoseidonsPoolPlayer({ gameId, round, challenge, player, players }) {
  const [state, setState] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [drag, setDrag] = useState(null); // { dx, dy } in pixels while actively dragging
  const [cooldownLeftMs, setCooldownLeftMs] = useState(0);
  const padRef = useRef(null);
  const reportedFinalRef = useRef(false);

  useEffect(() => {
    const unsubscribe = subscribePoseidonsPool(gameId, round.round, (v) => { setState(v); setLoaded(true); });
    return unsubscribe;
  }, [gameId, round.round]);

  // Belt-and-suspenders tick — the shot queue is entirely player-
  // initiated, this only ever matters for draining a queued shot (or
  // catching the outer timer) while nobody else's tab happens to be
  // open at the right instant. See lib/games/poseidonsPoolData.js's own
  // header for why this is safe to call redundantly from anywhere.
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
  if (state === null && !loaded) {
    return <Card style={{ marginBottom: 20, textAlign: "center" }}><p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic" }}>Loading...</p></Card>;
  }
  if (state === null && loaded) {
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <div style={{ fontSize: 28, marginBottom: 6 }}>🎱</div>
        <div style={{ fontSize: 12, letterSpacing: 4, textTransform: "uppercase", color: "#00ff9d" }}>Not Enough Players</div>
        <p style={{ color: "#6b4f99", fontSize: 12, marginTop: 10, fontStyle: "italic" }}>Poseidon's Pool needs at least 2 players.</p>
      </Card>
    );
  }

  const byName = (id) => players?.find((p) => p.id === id)?.display_name || "?";

  if (state.degenerate) {
    return <GameResultCard icon="🎱" title="No One To Play Against" valueLabel="You win by default" />;
  }

  if (state.gameEnded) {
    const ranking = [...state.participantIds].sort((a, b) => placementValue(state, b) - placementValue(state, a));
    const iWon = state.winnerIds.includes(player.id);
    const title = iWon
      ? (state.winnerIds.length > 1 ? "Shared Victory!" : "You Cleared The Table!")
      : "The Table's Been Cleared";
    return (
      <Card style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 28, textAlign: "center", marginBottom: 6 }}>🎱</div>
        <div style={{ fontSize: 12, letterSpacing: 4, textTransform: "uppercase", color: "#00ff9d", textAlign: "center", marginBottom: 6 }}>{title}</div>
        {state.winnerIds.length > 0 && (
          <p style={{ color: "#ff2d95", fontSize: 15, fontWeight: 700, textAlign: "center", fontFamily: "'Courier New', Courier, monospace", margin: "0 0 16px" }}>
            {state.winnerIds.map((id) => byName(id)).join(" & ")} last {state.winnerIds.length > 1 ? "on the table" : "standing"}
          </p>
        )}
        <div style={{ display: "grid", gap: 6 }}>
          {ranking.map((id, i) => (
            <div key={id} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              background: id === player.id ? "rgba(255,45,149,0.12)" : "#0d0618",
              border: `1px solid ${id === player.id ? "#ff2d95" : "#3d1f5c"}`, borderRadius: 6, padding: "8px 12px",
            }}>
              <span style={{ fontSize: 13, color: "#f5f0ff" }}>
                <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", background: state.ballDefs[id]?.color, marginRight: 6 }} />
                {state.winnerIds.includes(id) ? "🏆 " : ""}{byName(id)}
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#00ff9d" }}>
                {state.winnerIds.includes(id) ? "Winner" : `Sunk #${state.eliminatedOrder.indexOf(id) + 1}`}
              </span>
            </div>
          ))}
        </div>
      </Card>
    );
  }

  const myBall = state.balls[player.id];
  const iAmEliminated = !!myBall?.eliminated;
  const onCooldown = cooldownLeftMs > 0;
  const shotQueuedByMe = state.queue.some((q) => q.playerId === player.id);
  const canShoot = !iAmEliminated && !onCooldown && !shotQueuedByMe;
  const aliveCount = state.participantIds.filter((id) => !state.balls[id].eliminated).length;

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
      // dragging AWAY from center shoots in the OPPOSITE direction —
      // same slingshot intuition as MiniGolfTvPlayer.jsx.
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
  const shootAngle = drag ? Math.atan2(-drag.dy, -drag.dx) : 0;

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🎱 Poseidon's Pool</h3>
        <Badge color="#00ff9d">{aliveCount} left</Badge>
      </div>

      <PoseidonsPoolTable state={state} width={280} myPlayerId={player.id} aimAngle={shootAngle} aimPower={power} showAim={!!drag} />

      {iAmEliminated ? (
        <p style={{ color: "#ff3860", fontSize: 13, fontWeight: 700, margin: "14px 0 0" }}>💀 Your ball was sunk — spectating the rest of the table.</p>
      ) : (
        <>
          <p style={{ color: "#a68fd6", fontSize: 12, margin: "14px 0 8px" }}>
            {shotQueuedByMe ? "Your shot is lined up in the queue..." : onCooldown ? `Reloading — ${Math.ceil(cooldownLeftMs / 1000)}s` : "Press and drag back on your ball's pad, then let go to shoot."}
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
              position: "relative", width: 200, height: 200, margin: "0 auto", borderRadius: "50%",
              background: canShoot ? "rgba(0,255,157,0.05)" : "#0d0618",
              border: `2px solid ${canShoot ? "#00ff9d" : "#3d1f5c"}`, touchAction: "none", userSelect: "none",
            }}
          >
            {drag && (
              <svg width="200" height="200" style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}>
                <line x1={100} y1={100} x2={100 + aimX} y2={100 + aimY} stroke="#ffd700" strokeWidth={4} strokeLinecap="round" />
              </svg>
            )}
            <div style={{
              position: "absolute", top: "50%", left: "50%", width: 22, height: 22, borderRadius: "50%",
              background: state.ballDefs[player.id]?.color || "#f5f0ff", transform: "translate(-50%, -50%)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "#05010f",
            }}>{state.ballDefs[player.id]?.number}</div>
          </div>
          {drag && (
            <div style={{ marginTop: 12 }}>
              <div style={{ height: 8, borderRadius: 4, background: "#0d0618", overflow: "hidden", maxWidth: 200, margin: "0 auto" }}>
                <div style={{ height: "100%", width: `${power * 100}%`, background: power > 0.8 ? "#ff3860" : power > 0.4 ? "#ffd700" : "#00ff9d" }} />
              </div>
              <p style={{ color: "#6b4f99", fontSize: 11, marginTop: 4 }}>Power: {Math.round(power * 100)}%</p>
            </div>
          )}
        </>
      )}

      {state.shotLog.length > 0 && (
        <div style={{ marginTop: 16, textAlign: "left" }}>
          <div style={{ fontSize: 11, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 2, marginBottom: 6 }}>Recent Shots</div>
          <div style={{ display: "grid", gap: 4, maxHeight: 110, overflowY: "auto" }}>
            {state.shotLog.slice(-6).reverse().map((s, i) => (
              <p key={i} style={{ fontSize: 11, color: "#a68fd6", margin: 0 }}>
                {byName(s.playerId)} shot{s.sunkIds.length ? ` — sank ${s.sunkIds.map((id) => byName(id)).join(", ")}${s.selfScratch ? " (scratch!)" : ""}` : " — nothing sunk"}
              </p>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
