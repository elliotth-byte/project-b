import { useState, useEffect, useRef } from "react";
import { Card, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { reportScore } from "../../lib/challengeScores";
import { subscribeMiniGolf, tickMiniGolf, submitPutt, placementValue } from "../../lib/games/miniGolfData";

const MAX_DRAG_PX = 90; // full-power drag distance, in on-screen pixels

// ─── Real-Time Mini Golf — Big Screen (phone side) ───
// Pure aiming device — the course itself only ever shows on the TV
// (see components/bigscreen/MiniGolfTvDisplay.jsx). Press and drag
// back from the center of the pad below to set your angle and power
// (like pulling back a slingshot — the ball putts in the direction
// you're dragging AWAY from, same intuition as the real thing), and
// release to putt. Only enabled once your own ball is at rest — mid-
// roll, this is just a "rolling..." status screen.
export default function MiniGolfTvPlayer({ gameId, round, challenge, player }) {
  const [state, setState] = useState(null);
  const [drag, setDrag] = useState(null); // { dx, dy } in pixels while actively dragging
  const padRef = useRef(null);
  const reportedRef = useRef(false);

  useEffect(() => subscribeMiniGolf(gameId, round.round, setState), [gameId, round.round]);

  useEffect(() => {
    const id = setInterval(() => tickMiniGolf(gameId, round.round), 200);
    return () => clearInterval(id);
  }, [gameId, round.round]);

  useEffect(() => {
    if (!state) return;
    reportScore(gameId, round.round, player.id, player.name, placementValue(state, player.id), { final: false });
  }, [state?.balls?.[player.id]?.finished, state?.ended]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!challenge?.active && state && !reportedRef.current) {
      reportedRef.current = true;
      reportScore(gameId, round.round, player.id, player.name, placementValue(state, player.id), { final: true });
    }
  }, [challenge?.active, state]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!challenge?.active) {
    const myScore = state ? placementValue(state, player.id) : 0;
    const ball = state?.balls?.[player.id];
    const label = ball?.finished ? `Finished — #${ball.finishRank}` : `${myScore} pt${myScore === 1 ? "" : "s"}`;
    return <GameResultCard icon="⛳" title="Mini Golf" valueLabel={label} />;
  }
  if (!state) return <Card style={{ marginBottom: 20, textAlign: "center" }}><p style={{ color: "#6b4f99", fontStyle: "italic" }}>Loading...</p></Card>;

  const ball = state.balls?.[player.id];
  if (!ball) return <Card style={{ marginBottom: 20, textAlign: "center" }}><p style={{ color: "#6b4f99", fontStyle: "italic" }}>Not in this Battle.</p></Card>;

  const getRelative = (e) => {
    const rect = padRef.current.getBoundingClientRect();
    const point = e.touches ? e.touches[0] : e;
    return { x: point.clientX - (rect.left + rect.width / 2), y: point.clientY - (rect.top + rect.height / 2) };
  };

  const onStart = (e) => {
    if (!ball.atRest || ball.finished || state.ended) return;
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
    if (dist > 8) {
      // dragging AWAY from center putts the ball in the OPPOSITE
      // direction — same feel as pulling back a slingshot.
      const angle = Math.atan2(-drag.dy, -drag.dx);
      const power = Math.min(1, dist / MAX_DRAG_PX);
      submitPutt(gameId, round.round, player.id, angle, power);
    }
    setDrag(null);
  };

  const canPutt = ball.atRest && !ball.finished && !state.ended;
  const dragDist = drag ? Math.min(MAX_DRAG_PX, Math.hypot(drag.dx, drag.dy)) : 0;
  const dragAngle = drag ? Math.atan2(drag.dy, drag.dx) : 0;
  const aimX = drag ? Math.cos(dragAngle) * dragDist : 0;
  const aimY = drag ? Math.sin(dragAngle) * dragDist : 0;
  const power = dragDist / MAX_DRAG_PX;

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>⛳ Mini Golf</h3>
        <Badge color="#00ff9d">{ball.finished ? `#${ball.finishRank}` : canPutt ? "Your putt" : "Rolling..."}</Badge>
      </div>

      {ball.finished ? (
        <p style={{ color: "#00ff9d", fontSize: 16, fontWeight: 700, margin: "20px 0" }}>🏁 You finished #{ball.finishRank}!</p>
      ) : state.ended ? (
        <p style={{ color: "#6b4f99", fontSize: 14, fontStyle: "italic", margin: "20px 0" }}>The race is over — check the big screen for the winners.</p>
      ) : (
        <>
          <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 12px" }}>
            {canPutt ? "Press and drag back, then let go to putt — watch your ball on the big screen." : "Ball's still rolling — wait for it to stop."}
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
              position: "relative", width: 220, height: 220, margin: "0 auto", borderRadius: "50%",
              background: canPutt ? "rgba(0,255,157,0.05)" : "#0d0618",
              border: `2px solid ${canPutt ? "#00ff9d" : "#3d1f5c"}`, touchAction: "none", userSelect: "none",
            }}
          >
            {drag && (
              <svg width="220" height="220" style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}>
                <line x1={110} y1={110} x2={110 + aimX} y2={110 + aimY} stroke="#ffd700" strokeWidth={4} strokeLinecap="round" />
              </svg>
            )}
            <div style={{
              position: "absolute", top: "50%", left: "50%", width: 20, height: 20, borderRadius: "50%",
              background: "#f5f0ff", transform: "translate(-50%, -50%)",
            }} />
          </div>
          {drag && (
            <div style={{ marginTop: 12 }}>
              <div style={{ height: 8, borderRadius: 4, background: "#0d0618", overflow: "hidden", maxWidth: 220, margin: "0 auto" }}>
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
