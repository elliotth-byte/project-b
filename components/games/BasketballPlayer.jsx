import { useState, useEffect, useRef } from "react";
import { Card, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { useCountdown } from "./useCountdown";
import { reportScore } from "../../lib/challengeScores";
import { drawGlossHighlight } from "./canvasShapes";

// ─── Basketball ───
// The old Facebook mini-game: swipe up on the ball to shoot, 3 misses
// and you're done. The hoop itself starts moving once you've made
// enough baskets — first sliding left/right only, then eventually
// roaming anywhere on the court — same escalating-difficulty shape the
// original had. Uses the challenge's own normal duration
// (challenge?.endsAt) purely as an outer backstop, same as
// components/games/BreakoutPlayer.jsx's identical lives+timer
// combination: lives are what normally ends the game, the timer just
// makes sure an extremely long streak can't run forever.
const W = 300, H = 380;
const BALL_R = 10;
const GRAVITY = 0.42;
const HOOP_HALF_WIDTH = 26; // full rim — anything through here scores
const SWISH_HALF_WIDTH = 12; // the narrower dead-center zone — clean, no rim/backboard involved
const BACKBOARD_OFFSET_Y = 42; // how far above the rim the backboard sits — moves WITH the hoop, not fixed to a spot on screen
const BACKBOARD_HALF_WIDTH = 32;
const DRAG_SENSITIVITY_Y = 0.11;
// Much gentler than the vertical constant, deliberately — a real free
// throw motion is mostly a straight-up swipe with some natural
// left/right wobble that shouldn't ruin the shot. At the vertical power
// a shot actually needs to reach the hoop (~14-15 launch speed, ~30-35
// frames of flight time), an equal horizontal sensitivity would mean
// barely 7px of horizontal wobble is enough to drift the ball outside
// the rim's width entirely — unplayably twitchy. This keeps the game
// reading as "aim mostly up" rather than "aim within a hair's-width
// vertical laser," while still letting a genuinely large, deliberate
// sideways swipe curve a shot meaningfully (e.g. off the backboard from
// an angle) if someone wants to try a trick shot.
const DRAG_SENSITIVITY_X = 0.025;
const MAX_LAUNCH_SPEED = 20; // clamps an extreme flick so collision checks (which assume roughly-continuous motion) don't get skipped over in a single frame
const READY_X = W / 2, READY_Y = H - 46; // the shooter's own spot never moves — only the hoop does, so aim has to compensate as it drifts
const START_HOOP_X = W / 2, START_HOOP_Y = 78;
const RESULT_FLASH_MS = 550;
const TRAIL_LENGTH = 10;

// Escalating hoop movement, same shape the original Facebook game had:
// stationary at first, then sliding along one axis, then roaming
// anywhere. Thresholds are counted in MAKES (successful baskets), not
// points — a bank shot and a swish should count the same toward
// "you've gotten good enough that this needs to get harder."
const HORIZONTAL_MOVE_AT = 3;
const FULL_MOVE_AT = 8;
const HOOP_MARGIN_X = 40; // keeps the whole hoop+backboard unit fully on-canvas
const HOOP_MIN_Y = 50;
const HOOP_MAX_Y = 170; // low enough to meaningfully change the shot, never so low it crowds the shooter's own spot
const RETARGET_MIN_FRAMES = 70;
const RETARGET_MAX_FRAMES = 160;

function pickHoopTarget(makes) {
  const x = HOOP_MARGIN_X + Math.random() * (W - HOOP_MARGIN_X * 2);
  if (makes < FULL_MOVE_AT) return { x, y: START_HOOP_Y };
  const y = HOOP_MIN_Y + Math.random() * (HOOP_MAX_Y - HOOP_MIN_Y);
  return { x, y };
}

function freshBall() {
  return { x: READY_X, y: READY_Y, vx: 0, vy: 0, bankedThisShot: false, trail: [] };
}

function freshState() {
  return {
    ball: freshBall(),
    hoopX: START_HOOP_X,
    hoopY: START_HOOP_Y,
    targetX: START_HOOP_X,
    targetY: START_HOOP_Y,
    retargetIn: RETARGET_MIN_FRAMES,
    makes: 0,
  };
}

function drawCourt(ctx, st, resultFlash) {
  ctx.clearRect(0, 0, W, H);
  const { ball, hoopX, hoopY } = st;
  const backboardY = hoopY - BACKBOARD_OFFSET_Y;

  ctx.save();
  ctx.fillStyle = "#e8e4f0";
  ctx.fillRect(hoopX - BACKBOARD_HALF_WIDTH, backboardY - 4, BACKBOARD_HALF_WIDTH * 2, 4);
  ctx.strokeStyle = "#ff2d95";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(hoopX - 10, backboardY - 3, 20, 2);
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "#ff6f00";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(hoopX, hoopY, HOOP_HALF_WIDTH, 6, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 1;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(hoopX + i * (HOOP_HALF_WIDTH / 2.5), hoopY + 2);
    ctx.lineTo(hoopX + i * (HOOP_HALF_WIDTH / 4), hoopY + 20);
    ctx.stroke();
  }
  ctx.restore();

  ball.trail.forEach((p, i) => {
    const alpha = ((i + 1) / ball.trail.length) * 0.25;
    ctx.beginPath();
    ctx.fillStyle = `rgba(255,111,0,${alpha})`;
    ctx.arc(p.x, p.y, BALL_R * 0.7, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.save();
  ctx.shadowColor = "#ff6f00";
  ctx.shadowBlur = 6;
  const grad = ctx.createRadialGradient(ball.x - BALL_R * 0.3, ball.y - BALL_R * 0.3, 1, ball.x, ball.y, BALL_R);
  grad.addColorStop(0, "#ffb066");
  grad.addColorStop(1, "#ff6f00");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(20,10,0,0.5)";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(ball.x - BALL_R, ball.y); ctx.lineTo(ball.x + BALL_R, ball.y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(ball.x, ball.y - BALL_R); ctx.lineTo(ball.x, ball.y + BALL_R); ctx.stroke();
  ctx.restore();
  drawGlossHighlight(ctx, ball.x, ball.y, BALL_R, 0.5);

  if (resultFlash) {
    ctx.save();
    ctx.font = "900 22px 'Orbitron', 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = resultFlash.color;
    ctx.shadowColor = resultFlash.color;
    ctx.shadowBlur = 10;
    ctx.fillText(resultFlash.text, W / 2, 40);
    ctx.restore();
  }
}

export default function BasketballPlayer({ gameId, round, challenge, player }) {
  const cfg = challenge?.gameConfig || { lives: 3 };
  const { timeUp } = useCountdown(challenge?.endsAt);
  const canvasRef = useRef(null);
  const stateRef = useRef(freshState());
  const phaseRef = useRef("ready"); // "ready" | "flight" | "result"
  const dragRef = useRef(null); // { x, y } while dragging, in canvas-space
  const [score, setScore] = useState(0);
  const [shots, setShots] = useState(0);
  const [lives, setLives] = useState(cfg.lives || 3);
  const [flash, setFlash] = useState(null); // { text, color } | null
  const [done, setDone] = useState(false);
  const doneRef = useRef(false);
  const reportedRef = useRef(false);

  useEffect(() => {
    if (timeUp || doneRef.current) return;
    let raf;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");

    const loop = () => {
      const st = stateRef.current;
      const ball = st.ball;

      if (st.makes >= HORIZONTAL_MOVE_AT) {
        const moveSpeed = Math.min(0.05, 0.02 + st.makes * 0.0015);
        st.hoopX += (st.targetX - st.hoopX) * moveSpeed;
        st.hoopY += (st.targetY - st.hoopY) * moveSpeed;
        st.retargetIn -= 1;
        if (st.retargetIn <= 0) {
          const next = pickHoopTarget(st.makes);
          st.targetX = next.x;
          st.targetY = next.y;
          st.retargetIn = RETARGET_MIN_FRAMES + Math.random() * (RETARGET_MAX_FRAMES - RETARGET_MIN_FRAMES);
        }
      }

      if (phaseRef.current === "flight" && !doneRef.current) {
        ball.vy += GRAVITY;
        const prevY = ball.y;
        ball.x += ball.vx;
        ball.y += ball.vy;
        ball.trail.push({ x: ball.x, y: ball.y });
        if (ball.trail.length > TRAIL_LENGTH) ball.trail.shift();

        if (ball.x < BALL_R) { ball.x = BALL_R; ball.vx = -ball.vx * 0.7; }
        if (ball.x > W - BALL_R) { ball.x = W - BALL_R; ball.vx = -ball.vx * 0.7; }

        const backboardY = st.hoopY - BACKBOARD_OFFSET_Y;
        if (
          ball.vy < 0 && prevY > backboardY && ball.y <= backboardY &&
          ball.x > st.hoopX - BACKBOARD_HALF_WIDTH && ball.x < st.hoopX + BACKBOARD_HALF_WIDTH
        ) {
          ball.y = backboardY + 1;
          ball.vy = Math.abs(ball.vy) * 0.55;
          ball.bankedThisShot = true;
        }

        const finishShot = () => {
          phaseRef.current = "result";
          window.setTimeout(() => {
            stateRef.current.ball = freshBall();
            setFlash(null);
            if (!doneRef.current) phaseRef.current = "ready";
          }, RESULT_FLASH_MS);
        };

        if (
          ball.vy > 0 && prevY < st.hoopY && ball.y >= st.hoopY &&
          ball.x > st.hoopX - HOOP_HALF_WIDTH && ball.x < st.hoopX + HOOP_HALF_WIDTH
        ) {
          const swish = !ball.bankedThisShot && ball.x > st.hoopX - SWISH_HALF_WIDTH && ball.x < st.hoopX + SWISH_HALF_WIDTH;
          const points = swish ? 3 : 2;
          st.makes += 1;
          if (st.makes === HORIZONTAL_MOVE_AT || st.makes === FULL_MOVE_AT) {
            const next = pickHoopTarget(st.makes);
            st.targetX = next.x;
            st.targetY = next.y;
            st.retargetIn = RETARGET_MIN_FRAMES;
          }
          setScore((s) => s + points);
          setShots((n) => n + 1);
          setFlash({ text: swish ? "SWISH! +3" : ball.bankedThisShot ? "BANK! +2" : "+2", color: swish ? "#00ff9d" : "#ffd93d" });
          finishShot();
        } else if (ball.y > H + BALL_R) {
          setShots((n) => n + 1);
          setFlash({ text: "MISS", color: "#ff3860" });
          setLives((l) => {
            const next = l - 1;
            if (next <= 0) { doneRef.current = true; setDone(true); }
            return Math.max(0, next);
          });
          finishShot();
        }
      }

      if (ctx) drawCourt(ctx, stateRef.current, flash);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const toCanvasPoint = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = W / rect.width;
    const scaleY = H / rect.height;
    const touch = e.touches?.[0] || e.changedTouches?.[0];
    const clientX = touch ? touch.clientX : e.clientX;
    const clientY = touch ? touch.clientY : e.clientY;
    if (clientX == null || clientY == null) return null;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  };

  const onDragStart = (e) => {
    if (phaseRef.current !== "ready") return;
    const p = toCanvasPoint(e);
    if (!p) return;
    const dx = p.x - stateRef.current.ball.x, dy = p.y - stateRef.current.ball.y;
    if (Math.sqrt(dx * dx + dy * dy) > 46) return;
    dragRef.current = p;
  };

  const onDragEnd = (e) => {
    if (!dragRef.current || phaseRef.current !== "ready") { dragRef.current = null; return; }
    const p = toCanvasPoint(e) || dragRef.current;
    const dx = p.x - dragRef.current.x;
    const dy = p.y - dragRef.current.y;
    dragRef.current = null;
    if (dy > -8) return;
    const vx = Math.max(-MAX_LAUNCH_SPEED, Math.min(MAX_LAUNCH_SPEED, dx * DRAG_SENSITIVITY_X));
    const vy = Math.max(-MAX_LAUNCH_SPEED, dy * DRAG_SENSITIVITY_Y);
    stateRef.current.ball = { ...stateRef.current.ball, vx, vy, bankedThisShot: false, trail: [] };
    phaseRef.current = "flight";
  };

  if (timeUp || done) {
    return <GameResultCard icon="🏀" title="Game Over" valueLabel={`${score} pts (${shots} shot${shots === 1 ? "" : "s"})`} />;
  }

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🏀 Basketball</h3>
        <Badge>{"❤️".repeat(lives)} · {score} pts</Badge>
      </div>
      <div
        style={{ position: "relative", width: "100%", maxWidth: W, margin: "0 auto" }}
        onMouseDown={onDragStart} onMouseUp={onDragEnd}
        onTouchStart={onDragStart} onTouchEnd={onDragEnd}
      >
        <canvas
          ref={canvasRef} width={W} height={H}
          style={{ width: "100%", maxWidth: W, height: "auto", background: "linear-gradient(180deg, #150a28, #0d0618)", borderRadius: 10, border: "1px solid #3d1f5c", touchAction: "none", display: "block" }}
        />
      </div>
      <p style={{ color: "#6b4f99", fontSize: 11, marginTop: 8, fontStyle: "italic" }}>
        Swipe up on the ball to shoot — {lives} miss{lives === 1 ? "" : "es"} left. Score enough and the hoop starts moving.
      </p>
    </Card>
  );
}
