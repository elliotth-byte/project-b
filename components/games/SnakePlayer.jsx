import { useState, useEffect, useRef, useCallback } from "react";
import { Card, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { useCountdown } from "./useCountdown";
import { useSwipeControls } from "../../lib/games/useSwipeControls";
import { reportScore } from "../../lib/challengeScores";
import DPad from "./DPad";

const COLS = 16, ROWS = 16, CELL = 18;
const W = COLS * CELL, H = ROWS * CELL;
const START_STEP_MS = 150;
const MIN_STEP_MS = 70; // speeds up as the snake grows, same escalating-difficulty idea as Simon — floors here so it never gets literally unplayable

function randomFood(snake) {
  let cell;
  do {
    cell = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
  } while (snake.some((s) => s.x === cell.x && s.y === cell.y));
  return cell;
}

export default function SnakePlayer({ gameId, round, challenge, player }) {
  const { timeUp } = useCountdown(challenge?.endsAt);
  const canvasRef = useRef(null);
  const stateRef = useRef(null);
  const [phase, setPhase] = useState("ready"); // "ready" | "playing" | "over"
  const [score, setScore] = useState(0);
  const reportedRef = useRef(false);
  const dirRef = useRef({ x: 1, y: 0 });
  const pendingDirRef = useRef({ x: 1, y: 0 }); // buffered next direction, applied once per tick so a fast double-tap can't reverse into itself mid-frame

  const startGame = () => {
    const startSnake = [{ x: 7, y: 8 }, { x: 6, y: 8 }, { x: 5, y: 8 }];
    stateRef.current = { snake: startSnake, food: randomFood(startSnake), stepMs: START_STEP_MS };
    dirRef.current = { x: 1, y: 0 };
    pendingDirRef.current = { x: 1, y: 0 };
    setScore(0);
    setPhase("playing");
  };

  const setDirection = useCallback((dx, dy) => {
    // Checked against the PENDING direction, not the last-applied one —
    // otherwise two quick taps in the same tick window (e.g. up, then
    // left) could get wrongly rejected as a reversal, since left isn't
    // actually opposite up, only opposite the stale still-applied
    // direction from before the first tap landed.
    const cur = pendingDirRef.current;
    if (cur.x === -dx && cur.y === -dy) return; // no reversing directly into yourself
    pendingDirRef.current = { x: dx, y: dy };
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowUp") setDirection(0, -1);
      else if (e.key === "ArrowDown") setDirection(0, 1);
      else if (e.key === "ArrowLeft") setDirection(-1, 0);
      else if (e.key === "ArrowRight") setDirection(1, 0);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setDirection]);

  const swipeEnabled = !!player?.gamePrefs?.swipeControls;
  const swipeHandlers = useSwipeControls((dir) => {
    if (dir === "up") setDirection(0, -1);
    else if (dir === "down") setDirection(0, 1);
    else if (dir === "left") setDirection(-1, 0);
    else setDirection(1, 0);
  }, swipeEnabled);

  useEffect(() => {
    if (phase !== "playing" || timeUp) return;
    let raf, lastStep = 0;
    const ctx = canvasRef.current?.getContext("2d");

    const loop = (t) => {
      const st = stateRef.current;
      if (!st) { raf = requestAnimationFrame(loop); return; }
      if (t - lastStep >= st.stepMs) {
        lastStep = t;
        dirRef.current = pendingDirRef.current;
        const head = st.snake[0];
        const nx = head.x + dirRef.current.x, ny = head.y + dirRef.current.y;

        const hitWall = nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS;
        const hitSelf = st.snake.some((s) => s.x === nx && s.y === ny);
        if (hitWall || hitSelf) {
          setPhase("over");
          return;
        }

        const ateFood = nx === st.food.x && ny === st.food.y;
        const newSnake = [{ x: nx, y: ny }, ...st.snake];
        if (!ateFood) newSnake.pop();
        else {
          st.food = randomFood(newSnake);
          st.stepMs = Math.max(MIN_STEP_MS, st.stepMs - 3);
          setScore((s) => s + 10);
        }
        st.snake = newSnake;
      }

      if (ctx) {
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = "#ff2d95";
        ctx.fillRect(st.food.x * CELL + 2, st.food.y * CELL + 2, CELL - 4, CELL - 4);
        st.snake.forEach((seg, i) => {
          ctx.fillStyle = i === 0 ? "#00ff9d" : "#00d9ff";
          ctx.fillRect(seg.x * CELL + 1, seg.y * CELL + 1, CELL - 2, CELL - 2);
        });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase, timeUp]);

  useEffect(() => {
    if ((phase === "over" || timeUp) && !reportedRef.current) {
      reportedRef.current = true;
      reportScore(gameId, round.round, player.id, player.name, score, { final: true });
    }
  }, [phase, timeUp]); // eslint-disable-line react-hooks/exhaustive-deps

  if (phase === "over" || timeUp) {
    return <GameResultCard icon="🐍" title="Game Over" valueLabel={`${score} pts`} />;
  }

  if (phase === "ready") {
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <h3 style={{ color: "#ff2d95", margin: "0 0 8px", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🐍 Snake</h3>
        <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 14px" }}>Eat the food, don't hit the walls or yourself. Speeds up as you grow.</p>
        <button onClick={startGame} style={{
          padding: "10px 24px", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 700,
          background: "linear-gradient(135deg, #ff2d95, #b829ff)", border: "none", color: "#05010f",
          fontFamily: "'Orbitron', 'Segoe UI', sans-serif",
        }}>Start</button>
      </Card>
    );
  }

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🐍 Snake</h3>
        <Badge>{score} pts</Badge>
      </div>
      <canvas
        ref={canvasRef} width={W} height={H}
        onTouchStart={swipeHandlers.onTouchStart} onTouchEnd={swipeHandlers.onTouchEnd}
        style={{ width: "100%", maxWidth: W, height: "auto", background: "#0d0618", borderRadius: 10, border: "1px solid #3d1f5c", touchAction: swipeEnabled ? "none" : "auto", display: "block", margin: "0 auto" }}
      />
      <div style={{ marginTop: 10 }}>
        <DPad onUp={() => setDirection(0, -1)} onDown={() => setDirection(0, 1)} onLeft={() => setDirection(-1, 0)} onRight={() => setDirection(1, 0)} />
      </div>
      <p style={{ color: "#6b4f99", fontSize: 11, marginTop: 8, fontStyle: "italic" }}>
        Arrow keys work too.{swipeEnabled && " Or swipe on the board."}
      </p>
    </Card>
  );
}
