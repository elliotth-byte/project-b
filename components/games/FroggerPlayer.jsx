import { useState, useEffect, useRef, useCallback } from "react";
import { Card, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { useCountdown } from "./useCountdown";
import { reportScore } from "../../lib/challengeScores";

const COLS = 7, ROWS = 7, CELL = 40;
const W = COLS * CELL, H = ROWS * CELL;
const LANES = [1, 2, 3, 4, 5]; // car lanes; row 0 = goal, row 6 = start

export default function FroggerPlayer({ gameId, round, challenge, player }) {
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
    const cars = LANES.map((row, i) => ({
      row, dir: i % 2 === 0 ? 1 : -1, speed: 0.6 + i * 0.15,
      x: (i * 60) % W, width: 34,
    }));
    stateRef.current = { frog: { col: Math.floor(COLS / 2), row: ROWS - 1 }, cars };
  }, [cfg.lives]);

  const resetFrog = () => { if (stateRef.current) stateRef.current.frog = { col: Math.floor(COLS / 2), row: ROWS - 1 }; };

  const move = useCallback((dc, dr) => {
    const st = stateRef.current;
    if (!st || doneRef.current) return;
    const nc = st.frog.col + dc, nr = st.frog.row + dr;
    if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) return;
    st.frog = { col: nc, row: nr };
    if (nr === 0) {
      setScore((s) => s + 1);
      resetFrog();
    }
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowUp") move(0, -1);
      else if (e.key === "ArrowDown") move(0, 1);
      else if (e.key === "ArrowLeft") move(-1, 0);
      else if (e.key === "ArrowRight") move(1, 0);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move]);

  useEffect(() => {
    if (timeUp || doneRef.current) return;
    let raf;
    const ctx = canvasRef.current?.getContext("2d");
    const loop = () => {
      const st = stateRef.current;
      if (!st || doneRef.current) return;
      st.cars.forEach((car) => {
        car.x += car.dir * car.speed * 2;
        if (car.x > W + 40) car.x = -40;
        if (car.x < -40) car.x = W + 40;
      });

      const frogRect = { x: st.frog.col * CELL + 6, y: st.frog.row * CELL + 6, w: CELL - 12, h: CELL - 12 };
      for (const car of st.cars) {
        if (car.row !== st.frog.row) continue;
        if (car.x < frogRect.x + frogRect.w && car.x + car.width > frogRect.x) {
          setLives((l) => {
            const next = l - 1;
            if (next <= 0) { doneRef.current = true; setDone(true); }
            return Math.max(0, next);
          });
          resetFrog();
          break;
        }
      }

      if (ctx) {
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = "#0f2818"; ctx.fillRect(0, 0, W, CELL);
        ctx.fillStyle = "#1a2438";
        LANES.forEach((row) => ctx.fillRect(0, row * CELL, W, CELL));
        ctx.fillStyle = "#0f1a30"; ctx.fillRect(0, (ROWS - 1) * CELL, W, CELL);
        ctx.fillStyle = "#c45c3c";
        st.cars.forEach((car) => ctx.fillRect(car.x, car.row * CELL + 8, car.width, CELL - 16));
        ctx.font = "26px sans-serif";
        ctx.fillText("🐸", st.frog.col * CELL + 5, st.frog.row * CELL + 30);
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

  if (timeUp || done) return <GameResultCard icon="🐸" title="Game Over" valueLabel={`${score} crossings`} />;

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ color: "#c9a84c", margin: 0, fontSize: 15, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>🐸 Frogger</h3>
        <Badge>{"❤️".repeat(lives)} · {score} crossings</Badge>
      </div>
      <canvas ref={canvasRef} width={W} height={H} style={{ background: "#0a1020", borderRadius: 10, border: "1px solid #253550" }} />
      <div style={{ display: "grid", gridTemplateColumns: "44px 44px 44px", gridTemplateRows: "40px 40px", gap: 4, margin: "10px auto 0", width: "fit-content" }}>
        <div /><button onClick={() => move(0, -1)} style={arrowStyle}>↑</button><div />
        <button onClick={() => move(-1, 0)} style={arrowStyle}>←</button>
        <button onClick={() => move(0, 1)} style={arrowStyle}>↓</button>
        <button onClick={() => move(1, 0)} style={arrowStyle}>→</button>
      </div>
      <p style={{ color: "#706050", fontSize: 11, marginTop: 8, fontStyle: "italic" }}>Arrow keys work too.</p>
    </Card>
  );
}

const arrowStyle = { width: 44, height: 40, borderRadius: 8, background: "#0a1020", border: "1px solid #253550", color: "#f0e6d3", fontSize: 16, cursor: "pointer" };
