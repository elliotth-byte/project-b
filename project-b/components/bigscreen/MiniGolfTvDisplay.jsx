import { useState, useEffect } from "react";
import { subscribeMiniGolf, tickMiniGolf, movingObstacleSegments, COURSE, MINIGOLF_BALL_RADIUS } from "../../lib/games/miniGolfData";

const BALL_COLORS = ["#00ff9d", "#ff2d95", "#c9a84c", "#4fd1ff", "#ff8c42", "#b980ff", "#ff5c5c", "#7cff5c"];

// ─── Big Screen: Real-Time Mini Golf ───
// The course itself only ever lives here — a player's own phone (see
// components/games/MiniGolfTvPlayer.jsx) is a pure aiming device with
// no course drawing of its own. Every ball, the rotating windmill, and
// the sliding gate are all rendered straight from shared state, with
// the two moving obstacles recomputed from state.simTime the same way
// the physics engine itself does (see lib/games/miniGolfData.js's own
// movingObstacleSegments) — so what's drawn here is never a separate
// guess at where they are, just the same deterministic math. Polls
// tickMiniGolf on a tighter interval than most other Big Screen
// battles here (200ms, not 500ms+) since a physics-driven course reads
// as noticeably choppier than a turn-based board at the usual cadence.
export default function MiniGolfTvDisplay({ gameId, round, players }) {
  const [state, setState] = useState(null);

  useEffect(() => subscribeMiniGolf(gameId, round.round, setState), [gameId, round.round]);

  useEffect(() => {
    const id = setInterval(() => tickMiniGolf(gameId, round.round), 200);
    return () => clearInterval(id);
  }, [gameId, round.round]);

  if (!state) return <div style={{ textAlign: "center", color: "#6b4f99", padding: 60 }}>Loading...</div>;

  const byId = {};
  (players || []).forEach((p) => (byId[p.id] = p.display_name));

  const colorFor = (playerId) => {
    const idx = (state.participantIds || []).indexOf(playerId);
    return BALL_COLORS[idx % BALL_COLORS.length] || "#f5f0ff";
  };

  const moving = movingObstacleSegments(state.simTime || 0);
  const blades = moving.filter((s) => s.kind === "blade");
  const gateSeg = moving.find((s) => s.kind === "gate");

  const finishers = state.finishOrder || [];

  return (
    <div style={{ padding: 24, minHeight: "70vh" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 14, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 3 }}>
          ⛳ Real-Time Mini Golf — first {state.winnersNeeded} to finish
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {finishers.map((id, i) => (
            <div key={id} style={{ fontSize: 13, padding: "5px 12px", borderRadius: 8, background: "#0d0618", border: `1px solid ${colorFor(id)}`, color: colorFor(id) }}>
              {i + 1}. {byId[id] || "?"}
            </div>
          ))}
        </div>
      </div>

      {state.ended && (
        <div style={{ textAlign: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#c9a84c", fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
            🏆 {finishers.slice(0, state.winnersNeeded).map((id) => byId[id] || "?").join(", ")} win!
          </div>
        </div>
      )}

      <svg viewBox={`0 0 ${COURSE.bounds.width} ${COURSE.bounds.height}`} style={{ width: "100%", height: "auto", background: "#0a0512", borderRadius: 12, border: "1px solid #3d1f5c" }}>
        {/* static walls */}
        {COURSE.walls.map((w, i) => (
          <line key={`w${i}`} x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2} stroke="#a68fd6" strokeWidth={6} strokeLinecap="round" />
        ))}

        {/* bumpers */}
        {COURSE.bumpers.map((b, i) => (
          <circle key={`b${i}`} cx={b.x} cy={b.y} r={b.r} fill="rgba(255,45,149,0.18)" stroke="#ff2d95" strokeWidth={3} />
        ))}

        {/* windmill blades */}
        {blades.map((s, i) => (
          <line key={`bl${i}`} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke="#ffd700" strokeWidth={7} strokeLinecap="round" />
        ))}
        <circle cx={COURSE.windmill.pivot.x} cy={COURSE.windmill.pivot.y} r={8} fill="#ffd700" />

        {/* sliding gate */}
        {gateSeg && (
          <line x1={gateSeg.x1} y1={gateSeg.y1} x2={gateSeg.x2} y2={gateSeg.y2} stroke="#4fd1ff" strokeWidth={8} strokeLinecap="round" />
        )}

        {/* start + finish */}
        <circle cx={COURSE.start.x} cy={COURSE.start.y} r={16} fill="none" stroke="#6b4f99" strokeWidth={2} strokeDasharray="4 4" />
        <circle cx={COURSE.finish.x} cy={COURSE.finish.y} r={COURSE.finish.r} fill="#0d0618" stroke="#00ff9d" strokeWidth={4} />
        <circle cx={COURSE.finish.x} cy={COURSE.finish.y} r={COURSE.finish.r * 0.4} fill="#00ff9d" opacity={0.5} />

        {/* balls */}
        {(state.participantIds || []).map((id) => {
          const ball = state.balls?.[id];
          if (!ball) return null;
          return (
            <g key={id}>
              <circle cx={ball.x} cy={ball.y} r={MINIGOLF_BALL_RADIUS} fill={colorFor(id)} stroke="#0a0512" strokeWidth={2} opacity={ball.finished ? 0.4 : 1} />
              <text x={ball.x} y={ball.y - 16} textAnchor="middle" fontSize={13} fill={colorFor(id)} fontFamily="'Orbitron', sans-serif">
                {byId[id] || "?"}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
