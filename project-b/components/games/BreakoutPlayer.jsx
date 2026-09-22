import { useState, useEffect, useRef } from "react";
import { Card, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { useCountdown } from "./useCountdown";
import { reportScore } from "../../lib/challengeScores";
import { roundedRectPath, drawGlossHighlight } from "./canvasShapes";

const W = 300, H = 380, PADDLE_W = 60, PADDLE_H = 10, BALL_R = 6;
const ROWS = 4, COLS = 7, BRICK_W = W / COLS, BRICK_H = 16;
// One color per row, classic-Breakout style, instead of every brick
// being the same flat pink — purely visual, doesn't change scoring.
const ROW_COLORS = ["#ff2d95", "#ff6f4d", "#ffd93d", "#00d9ff"];

function drawBoard(ctx, st) {
  ctx.clearRect(0, 0, W, H);

  // Bricks — rounded, gradient-shaded per row, with a thin bevel
  // highlight along the top edge instead of a flat fill.
  for (const b of st.bricks) {
    if (!b.alive) continue;
    const x = b.c * BRICK_W + 1, y = b.r * BRICK_H + 20, w = BRICK_W - 2, h = BRICK_H - 2;
    const base = ROW_COLORS[b.r % ROW_COLORS.length];
    ctx.save();
    const grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, base);
    grad.addColorStop(1, base + "aa");
    ctx.fillStyle = grad;
    roundedRectPath(ctx, x, y, w, h, 3);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 2, y + 1.5);
    ctx.lineTo(x + w - 2, y + 1.5);
    ctx.stroke();
    ctx.restore();
  }

  // Paddle — rounded ends + a subtle gradient instead of a flat bar.
  ctx.save();
  const paddleGrad = ctx.createLinearGradient(st.paddleX, 0, st.paddleX + PADDLE_W, 0);
  paddleGrad.addColorStop(0, "#ffffff");
  paddleGrad.addColorStop(1, "#c9bfe0");
  ctx.fillStyle = paddleGrad;
  roundedRectPath(ctx, st.paddleX, H - 20, PADDLE_W, PADDLE_H, PADDLE_H / 2);
  ctx.fill();
  ctx.restore();

  // Ball — radial gradient sphere with a soft glow + gloss highlight,
  // instead of a flat filled circle.
  ctx.save();
  ctx.shadowColor = "#ff2d95";
  ctx.shadowBlur = 6;
  const ballGrad = ctx.createRadialGradient(st.ballX - BALL_R * 0.3, st.ballY - BALL_R * 0.3, 1, st.ballX, st.ballY, BALL_R);
  ballGrad.addColorStop(0, "#ffe6f3");
  ballGrad.addColorStop(1, "#ff2d95");
  ctx.fillStyle = ballGrad;
  ctx.beginPath();
  ctx.arc(st.ballX, st.ballY, BALL_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  drawGlossHighlight(ctx, st.ballX, st.ballY, BALL_R, 0.5);
}

export default function BreakoutPlayer({ gameId, round, challenge, player }) {
  const cfg = challenge?.gameConfig || { lives: 3 };
  const { timeUp } = useCountdown(challenge?.endsAt);
  const canvasRef = useRef(null);
  const stateRef = useRef(null);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(cfg.lives || 3);
  const [level, setLevel] = useState(1); // increments each time the board is fully cleared
  const [done, setDone] = useState(false);
  const doneRef = useRef(false);
  const reportedRef = useRef(false);
  const [countdown, setCountdown] = useState(3); // 3-2-1-GO before the ball actually moves
  const countdownRef = useRef(3);

  const freshBricks = () => {
    const bricks = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) bricks.push({ r, c, alive: true });
    return bricks;
  };

  const speedForLevel = (lvl) => 1 + (lvl - 1) * 0.22; // each cleared board ramps ball speed up ~22%

  useEffect(() => {
    const speed = speedForLevel(1);
    stateRef.current = {
      paddleX: W / 2 - PADDLE_W / 2, ballX: W / 2, ballY: H - 40, vx: 2.4 * speed, vy: -3.2 * speed, bricks: freshBricks(), level: 1,
    };
  }, []);

  // 3-2-1-GO countdown before the ball starts moving — gives a player a
  // beat to get oriented instead of the ball launching the instant the
  // board renders.
  useEffect(() => {
    if (countdownRef.current <= 0) return;
    const t = window.setTimeout(() => {
      countdownRef.current -= 1;
      setCountdown(countdownRef.current);
    }, 700);
    return () => window.clearTimeout(t);
  }, [countdown]);

  useEffect(() => {
    if (timeUp || doneRef.current) return;
    let raf;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");

    const loop = () => {
      const st = stateRef.current;
      if (!st || doneRef.current) { raf = requestAnimationFrame(loop); return; }

      // Defensive: if the paddle (or ball) position was ever corrupted
      // into something non-finite — from any cause, a stray NaN
      // anywhere upstream — this recovers instead of silently rendering
      // nothing forever. fillRect with a NaN coordinate draws nothing
      // and throws no error, which is exactly what an invisible paddle
      // with no console error would look like.
      if (!Number.isFinite(st.paddleX)) st.paddleX = W / 2 - PADDLE_W / 2;
      if (!Number.isFinite(st.ballX) || !Number.isFinite(st.ballY)) { st.ballX = W / 2; st.ballY = H - 40; }
      st.paddleX = Math.max(0, Math.min(W - PADDLE_W, st.paddleX));

      if (countdownRef.current > 0) {
        // Still draw the static board during the countdown — just skip
        // all movement/collision this frame.
        if (ctx) drawBoard(ctx, st);
        raf = requestAnimationFrame(loop);
        return;
      }

      st.ballX += st.vx; st.ballY += st.vy;
      if (st.ballX < BALL_R || st.ballX > W - BALL_R) st.vx = -st.vx;
      if (st.ballY < BALL_R) st.vy = -st.vy;

      // paddle collision
      if (st.ballY > H - 20 - BALL_R && st.ballY < H - 10 && st.ballX > st.paddleX && st.ballX < st.paddleX + PADDLE_W) {
        st.vy = -Math.abs(st.vy);
        const hitPos = (st.ballX - st.paddleX) / PADDLE_W - 0.5;
        st.vx = hitPos * 6;
      }

      // brick collision
      for (const b of st.bricks) {
        if (!b.alive) continue;
        const bx = b.c * BRICK_W, by = b.r * BRICK_H + 20;
        if (st.ballX > bx && st.ballX < bx + BRICK_W && st.ballY > by && st.ballY < by + BRICK_H) {
          b.alive = false;
          st.vy = -st.vy;
          setScore((s) => s + 10);
          break;
        }
      }

      if (st.ballY > H + BALL_R) {
        setLives((l) => {
          const next = l - 1;
          if (next <= 0) { doneRef.current = true; setDone(true); }
          else { const speed = speedForLevel(st.level); st.ballX = W / 2; st.ballY = H - 40; st.vx = 2.4 * speed; st.vy = -3.2 * speed; }
          return Math.max(0, next);
        });
      }

      // Board cleared: don't end the game — spawn a fresh, harder board and
      // keep going. Lives and score carry over; only speed and level reset
      // the ball's position.
      if (st.bricks.every((b) => !b.alive)) {
        st.level += 1;
        const speed = speedForLevel(st.level);
        st.bricks = freshBricks();
        st.ballX = W / 2; st.ballY = H - 40;
        st.vx = speed * (st.vx >= 0 ? 2.4 : -2.4);
        st.vy = -Math.abs(3.2 * speed);
        setLevel(st.level);
      }

      if (ctx) drawBoard(ctx, st);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [timeUp]);

  useEffect(() => {
    reportScore(gameId, round.round, player.id, player.name, score, { final: false });
  }, [score]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if ((timeUp || done) && !reportedRef.current) {
      reportedRef.current = true;
      reportScore(gameId, round.round, player.id, player.name, score, { final: true });
    }
  }, [timeUp, done]); // eslint-disable-line react-hooks/exhaustive-deps

  const movePaddle = (dx) => {
    if (!stateRef.current) return;
    stateRef.current.paddleX = Math.max(0, Math.min(W - PADDLE_W, stateRef.current.paddleX + dx));
  };

  const onPointerMove = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    // Scale factor between the canvas's CSS-rendered size and its actual
    // internal pixel space — needed now that the canvas has responsive
    // CSS sizing below (rect.width won't always equal W). Without this,
    // touch/mouse coordinates would be wrong on any screen where the two
    // differ, same fix SpotDiffPlayer.jsx already uses.
    const scaleX = W / rect.width;
    const touch = e.touches?.[0];
    const clientX = touch ? touch.clientX : e.clientX;
    if (clientX == null) return; // e.g. a stray touchend with no active touch
    const x = (clientX - rect.left) * scaleX;
    if (stateRef.current) stateRef.current.paddleX = Math.max(0, Math.min(W - PADDLE_W, x - PADDLE_W / 2));
  };

  if (timeUp || done) {
    return <GameResultCard icon="🧱" title="Breakout Over" valueLabel={`${score} points`} />;
  }

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🧱 Breakout {level > 1 ? `— Board ${level}` : ""}</h3>
        <Badge>{"❤️".repeat(lives)} · {score} pts</Badge>
      </div>
      <div style={{ position: "relative", width: "100%", maxWidth: W, margin: "0 auto" }}>
        <canvas
          ref={canvasRef} width={W} height={H}
          onMouseMove={onPointerMove} onTouchMove={onPointerMove}
          style={{ width: "100%", maxWidth: W, height: "auto", background: "#0d0618", borderRadius: 10, border: "1px solid #3d1f5c", touchAction: "none", display: "block" }}
        />
        {countdown > 0 && (
          <div style={{
            position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(5,1,15,0.55)", borderRadius: 10, pointerEvents: "none",
          }}>
            <span style={{ fontSize: 48, fontWeight: 900, color: "#ff2d95", textShadow: "0 0 20px #ff2d95", fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
              {countdown}
            </span>
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 8 }}>
        <button onClick={() => movePaddle(-24)} style={arrowStyle}>←</button>
        <button onClick={() => movePaddle(24)} style={arrowStyle}>→</button>
      </div>
      <p style={{ color: "#6b4f99", fontSize: 11, marginTop: 6, fontStyle: "italic" }}>Drag on the board, or use the arrows.</p>
    </Card>
  );
}

const arrowStyle = { width: 60, height: 36, borderRadius: 8, background: "#0d0618", border: "1px solid #3d1f5c", color: "#f5f0ff", fontSize: 16, cursor: "pointer" };
