import { useState, useEffect, useRef } from "react";
import { TABLE_W, TABLE_H, BALL_R, POCKET_R, POCKETS } from "../../lib/games/poseidonsPoolData";

// ─── Poseidon's Pool — the shared table itself ───
// Rendered by BOTH the regular phone component (components/games/
// PoseidonsPoolPlayer.jsx, at a compact size alongside its own aim
// controls) and the Big Screen TV display (components/bigscreen/
// PoseidonsPoolTvDisplay.jsx, large) — one piece of rendering logic, so
// the two never drift out of sync visually. NOT used by the Big Screen
// mode's own phone component (components/games/
// PoseidonsPoolTvPlayer.jsx) — that one is deliberately aim/power-only,
// no table, per this game's own design brief.
//
// Every ball's displayed position comes from `state.balls` (the
// authoritative, already-final resting positions) UNLESS a shot is
// currently within its own replay window (state.currentShot, still
// short of its own durationMs) — in that case this interpolates along
// that shot's precomputed keyframes purely for a smooth-looking replay.
// See lib/games/poseidonsPoolData.js's own header for why the replay is
// cosmetic only and never itself authoritative.

function interpAt(traj, elapsed) {
  if (!traj || traj.length === 0) return null;
  if (elapsed <= traj[0].t) return traj[0];
  for (let i = 1; i < traj.length; i++) {
    if (elapsed <= traj[i].t) {
      const a = traj[i - 1], b = traj[i];
      const span = b.t - a.t || 1;
      const f = (elapsed - a.t) / span;
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }
  }
  return traj[traj.length - 1];
}

function ballsToRender(state, elapsed) {
  const shot = state.currentShot;
  const animating = shot && elapsed < shot.durationMs;
  const out = [];
  state.participantIds.forEach((id) => {
    const eliminated = state.balls[id]?.eliminated;
    if (animating && shot.trajectories[id]) {
      const traj = shot.trajectories[id];
      const lastT = traj[traj.length - 1].t;
      const isSunk = shot.sunkIds.includes(id);
      if (isSunk && elapsed >= lastT) return; // sunk — already vanished into the pocket
      const pos = interpAt(traj, elapsed);
      out.push({ id, x: pos.x, y: pos.y });
      return;
    }
    if (!eliminated) {
      out.push({ id, x: state.balls[id].x, y: state.balls[id].y });
    }
  });
  return out;
}

export default function PoseidonsPoolTable({ state, width = 300, myPlayerId, aimAngle, aimPower, showAim }) {
  const [now, setNow] = useState(() => Date.now());
  const rafRef = useRef(null);

  useEffect(() => {
    const shot = state?.currentShot;
    const stillAnimating = shot && Date.now() - shot.startedAt < shot.durationMs;
    if (!stillAnimating) return undefined;
    let active = true;
    const loop = () => {
      if (!active) return;
      setNow(Date.now());
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { active = false; if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [state?.currentShot?.id, state?.currentShot?.startedAt]);

  if (!state) return null;
  const shot = state.currentShot;
  const elapsed = shot ? now - shot.startedAt : 0;
  const renderBalls = ballsToRender(state, elapsed);
  const height = Math.round(width * (TABLE_H / TABLE_W));

  const myBall = myPlayerId ? state.balls[myPlayerId] : null;
  const aimLine = showAim && myBall && !myBall.eliminated
    ? { x1: myBall.x, y1: myBall.y, x2: myBall.x + Math.cos(aimAngle) * (120 + 260 * (aimPower || 0)), y2: myBall.y + Math.sin(aimAngle) * (120 + 260 * (aimPower || 0)) }
    : null;

  return (
    <div style={{
      position: "relative", width, height, margin: "0 auto", borderRadius: 16,
      background: "radial-gradient(circle at 35% 30%, #10493a, #072620 75%)",
      border: "8px solid #5c3a1e", boxShadow: "inset 0 0 40px rgba(0,0,0,0.55), 0 0 20px rgba(0,0,0,0.4)",
      overflow: "hidden",
    }}>
      <svg width={width} height={height} viewBox={`0 0 ${TABLE_W} ${TABLE_H}`} style={{ position: "absolute", inset: 0 }}>
        {POCKETS.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={POCKET_R} fill="#040404" stroke="#000" strokeWidth={4} />
        ))}
        {aimLine && (
          <line x1={aimLine.x1} y1={aimLine.y1} x2={aimLine.x2} y2={aimLine.y2} stroke="#ffd700" strokeWidth={5} strokeLinecap="round" strokeDasharray="2 14" opacity={0.85} />
        )}
        {renderBalls.map((b) => {
          const def = state.ballDefs[b.id];
          const isMe = b.id === myPlayerId;
          return (
            <g key={b.id}>
              <circle cx={b.x} cy={b.y} r={BALL_R} fill={def?.color || "#f5f0ff"} stroke={isMe ? "#fff" : "#00000066"} strokeWidth={isMe ? 3 : 1.5} />
              <text x={b.x} y={b.y + 7} fontSize={20} fontWeight={800} textAnchor="middle" fill="#05010f" style={{ fontFamily: "'Orbitron', sans-serif", pointerEvents: "none" }}>
                {def?.number ?? ""}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
