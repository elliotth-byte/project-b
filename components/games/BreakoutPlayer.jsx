import { useState, useEffect, useRef } from "react";
import { Card, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { useCountdown } from "./useCountdown";
import { reportScore } from "../../lib/challengeScores";

const W = 300, H = 380, PADDLE_W = 60, PADDLE_H = 10, BALL_R = 6;
const ROWS = 4, COLS = 7, BRICK_W = W / COLS, BRICK_H = 16;

export default function BreakoutPlayer({ gameId, round, challenge, player }) {
  const cfg = challenge?.gameConfig || { lives: 3 };
  const { timeUp } = useCountdown(challenge?.endsAt);
  const canvasRef = useRef(null);
  const stateRef = useRef(null);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(cfg.lives || 3);
  const [done, setDone] = useState(false);
  const doneRef = useRef(false);
  const reportedRef = useRef(false);

  useEffect(() => {
    const bricks = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) bricks.push({ r, c, alive: true });
    stateRef.current = {
      paddleX: W / 2 - PADDLE_W / 2, ballX: W / 2, ballY: H - 40, vx: 2.4, vy: -3.2, bricks,
    };
  }, []);

  useEffect(() => {
    if (timeUp || doneRef.current) return;
    let raf;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");

    const loop = () => {
      const st = stateRef.current;
      if (!st || doneRef.current) return;
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
          else { st.ballX = W / 2; st.ballY = H - 40; st.vx = 2.4; st.vy = -3.2; }
          return Math.max(0, next);
        });
      }

      if (st.bricks.every((b) => !b.alive)) { doneRef.current = true; setDone(true); }

      if (ctx) {
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = "#c9a84c";
        for (const b of st.bricks) if (b.alive) ctx.fillRect(b.c * BRICK_W + 1, b.r * BRICK_H + 20, BRICK_W - 2, BRICK_H - 2);
        ctx.fillStyle = "#f0e6d3";
        ctx.fillRect(st.paddleX, H - 20, PADDLE_W, PADDLE_H);
        ctx.beginPath(); ctx.arc(st.ballX, st.ballY, BALL_R, 0, Math.PI * 2); ctx.fill();
      }
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
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    if (stateRef.current) stateRef.current.paddleX = Math.max(0, Math.min(W - PADDLE_W, x - PADDLE_W / 2));
  };

  if (timeUp || done) {
    return <GameResultCard icon="🧱" title="Breakout Over" valueLabel={`${score} points`} />;
  }

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ color: "#c9a84c", margin: 0, fontSize: 15, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>🧱 Breakout</h3>
        <Badge>{"❤️".repeat(lives)} · {score} pts</Badge>
      </div>
      <canvas
        ref={canvasRef} width={W} height={H}
        onMouseMove={onPointerMove} onTouchMove={onPointerMove}
        style={{ background: "#060e1a", borderRadius: 10, border: "1px solid #253550", touchAction: "none" }}
      />
      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 8 }}>
        <button onClick={() => movePaddle(-24)} style={arrowStyle}>←</button>
        <button onClick={() => movePaddle(24)} style={arrowStyle}>→</button>
      </div>
      <p style={{ color: "#706050", fontSize: 11, marginTop: 6, fontStyle: "italic" }}>Drag on the board, or use the arrows.</p>
    </Card>
  );
}

const arrowStyle = { width: 60, height: 36, borderRadius: 8, background: "#0a1020", border: "1px solid #253550", color: "#f0e6d3", fontSize: 16, cursor: "pointer" };
