import { useState, useEffect, useRef, useCallback } from "react";
import { Card, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { useCountdown } from "./useCountdown";
import { reportScore } from "../../lib/challengeScores";

// 9-wide grid so 5 home slots can sit with real gaps between them, the
// way the original arcade game's 5 lily pads work — landing in a gap (or
// an already-filled slot) doesn't count as arriving home.
const COLS = 9, ROWS = 7, CELL = 36;
const W = COLS * CELL, H = ROWS * CELL;
const LANES = [1, 2, 3, 4, 5];
const HOME_COLS = [0, 2, 4, 6, 8]; // 5 slots, gaps at 1/3/5/7
const START = { col: 4, row: ROWS - 1 };
const ATTEMPT_MS = 25000; // each frog gets 25s to reach a home slot before it's treated as a life lost

// ─── Scoring (see the point breakdown this was built to match) ───
const POINTS = { forwardStep: 10, arriveHome: 50, timeBonusPerHalfSec: 10, ladyFrog: 200, fly: 200, levelComplete: 1000 };

export default function FroggerPlayer({ gameId, round, challenge, player }) {
  const cfg = challenge?.gameConfig || { lives: 3 };
  const { timeUp } = useCountdown(challenge?.endsAt);
  const canvasRef = useRef(null);
  const stateRef = useRef(null);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(cfg.lives || 3);
  const [homesFilled, setHomesFilled] = useState(0);
  const [carrying, setCarrying] = useState(false);
  const [done, setDone] = useState(false);
  const [won, setWon] = useState(false);
  const doneRef = useRef(false);
  const reportedRef = useRef(false);
  const scoreRef = useRef(0); // mirrors `score` for the rAF loop below, which closes over stale state otherwise

  useEffect(() => { scoreRef.current = score; }, [score]);

  useEffect(() => {
    const cars = LANES.map((row, i) => ({
      row, dir: i % 2 === 0 ? 1 : -1, speed: 0.6 + i * 0.15,
      x: (i * 60) % W, width: 30,
    }));
    stateRef.current = {
      frog: { ...START }, cars, homes: Array(5).fill(false),
      bestRow: START.row, attemptStart: Date.now(), carrying: false,
      lady: null, ladyNextSpawn: Date.now() + 4000 + Math.random() * 4000,
      fly: null, flyNextSpawn: Date.now() + 6000 + Math.random() * 6000,
    };
  }, [cfg.lives]);

  const resetFrog = (keepCarrying = false) => {
    const st = stateRef.current;
    if (!st) return;
    st.frog = { ...START };
    st.bestRow = START.row;
    st.attemptStart = Date.now();
    if (!keepCarrying) { st.carrying = false; setCarrying(false); }
  };

  const loseLife = () => {
    setLives((l) => {
      const next = l - 1;
      if (next <= 0) { doneRef.current = true; setDone(true); }
      return Math.max(0, next);
    });
    resetFrog(false); // dying always drops the lady frog, if carrying one
  };

  const move = useCallback((dc, dr) => {
    const st = stateRef.current;
    if (!st || doneRef.current) return;
    const nc = st.frog.col + dc, nr = st.frog.row + dr;
    if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) return;
    st.frog = { col: nc, row: nr };

    // Forward step bonus: only for reaching a NEW farthest row this
    // attempt, not for every hop (no farming points by shuffling back
    // and forth in the same lane).
    if (nr < st.bestRow) {
      st.bestRow = nr;
      setScore((s) => s + POINTS.forwardStep);
    }

    // Picking up the lady frog — she's standing in one of the lanes.
    if (st.lady && st.lady.row === nr && st.lady.col === nc) {
      st.lady = null;
      st.carrying = true;
      setCarrying(true);
    }

    if (nr === 0) {
      const slotIdx = HOME_COLS.indexOf(nc);
      if (slotIdx === -1 || st.homes[slotIdx]) {
        // Landed in a gap, or a slot that's already filled — doesn't count.
        loseLife();
        return;
      }
      st.homes[slotIdx] = true;
      const filledCount = st.homes.filter(Boolean).length;
      setHomesFilled(filledCount);

      const remainingMs = Math.max(0, ATTEMPT_MS - (Date.now() - st.attemptStart));
      const timeBonus = Math.floor(remainingMs / 500) * POINTS.timeBonusPerHalfSec;
      let gained = POINTS.arriveHome + timeBonus;
      if (st.carrying) gained += POINTS.ladyFrog;
      if (st.fly && st.fly.slotIdx === slotIdx) { gained += POINTS.fly; st.fly = null; }
      setScore((s) => s + gained);

      if (filledCount >= 5) {
        setScore((s) => s + POINTS.levelComplete);
        doneRef.current = true;
        setWon(true);
        setDone(true);
        return;
      }
      resetFrog(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      const now = Date.now();

      // Every point scored ramps traffic up a little — capped so it never
      // gets literally unplayable.
      const difficulty = Math.min(2.5, 1 + scoreRef.current * 0.004);
      st.cars.forEach((car) => {
        car.x += car.dir * car.speed * 2 * difficulty;
        if (car.x > W + 40) car.x = -40;
        if (car.x < -40) car.x = W + 40;
      });

      // This attempt's clock ran out — same as getting hit.
      if (now - st.attemptStart > ATTEMPT_MS) { loseLife(); }

      // Bonus spawns — lady frog stands in a random lane cell; fly
      // appears inside a random home slot. Both time out if unclaimed.
      if (!st.lady && now > st.ladyNextSpawn) {
        st.lady = { row: LANES[Math.floor(Math.random() * LANES.length)], col: Math.floor(Math.random() * COLS), expiresAt: now + 6000 };
      }
      if (st.lady && now > st.lady.expiresAt) st.lady = null;
      if (!st.fly && now > st.flyNextSpawn) {
        const openSlots = st.homes.map((f, i) => !f ? i : -1).filter((i) => i !== -1);
        const slotIdx = openSlots.length > 0 ? openSlots[Math.floor(Math.random() * openSlots.length)] : Math.floor(Math.random() * 5);
        st.fly = { slotIdx, expiresAt: now + 7000 };
        st.flyNextSpawn = now + 9000 + Math.random() * 7000;
      }
      if (st.fly && now > st.fly.expiresAt) st.fly = null;

      const frogRect = { x: st.frog.col * CELL + 5, y: st.frog.row * CELL + 5, w: CELL - 10, h: CELL - 10 };
      for (const car of st.cars) {
        if (car.row !== st.frog.row) continue;
        if (car.x < frogRect.x + frogRect.w && car.x + car.width > frogRect.x) {
          loseLife();
          break;
        }
      }

      if (ctx) {
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = "#0f2818"; ctx.fillRect(0, 0, W, CELL);
        // Home slots — filled ones glow green, open ones just outlined.
        HOME_COLS.forEach((c, i) => {
          ctx.fillStyle = st.homes[i] ? "rgba(0,255,157,0.35)" : "rgba(255,255,255,0.08)";
          ctx.fillRect(c * CELL + 3, 3, CELL - 6, CELL - 6);
        });
        if (st.fly) {
          ctx.font = `${CELL - 14}px sans-serif`;
          ctx.fillText("🪰", HOME_COLS[st.fly.slotIdx] * CELL + 6, CELL - 8);
        }
        ctx.fillStyle = "#1a0a2e";
        LANES.forEach((row) => ctx.fillRect(0, row * CELL, W, CELL));
        ctx.fillRect(0, (ROWS - 1) * CELL, W, CELL);
        ctx.fillStyle = "#ff3860";
        st.cars.forEach((car) => ctx.fillRect(car.x, car.row * CELL + 7, car.width, CELL - 14));
        if (st.lady) {
          ctx.font = `${CELL - 12}px sans-serif`;
          ctx.fillText("🤍", st.lady.col * CELL + 6, st.lady.row * CELL + CELL - 8);
        }
        ctx.font = `${CELL - 10}px sans-serif`;
        ctx.fillText(st.carrying ? "🐸💕" : "🐸", st.frog.col * CELL + 2, st.frog.row * CELL + CELL - 6);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [timeUp]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    reportScore(gameId, round.round, player.id, player.name, score, { final: false });
  }, [score]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if ((timeUp || done) && !reportedRef.current) {
      reportedRef.current = true;
      reportScore(gameId, round.round, player.id, player.name, score, { final: true });
    }
  }, [timeUp, done]); // eslint-disable-line react-hooks/exhaustive-deps

  if (timeUp || done) {
    return <GameResultCard icon="🐸" title={won ? "Board Cleared!" : "Game Over"} valueLabel={`${score} pts`} />;
  }

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🐸 Frogger</h3>
        <Badge>{"❤️".repeat(lives)} · {score} pts</Badge>
      </div>
      <p style={{ color: "#6b4f99", fontSize: 11, margin: "0 0 8px" }}>
        🏠 {homesFilled}/5 home{carrying && " · 🤍 carrying the lady frog"}
      </p>
      <canvas ref={canvasRef} width={W} height={H} style={{ background: "#0d0618", borderRadius: 10, border: "1px solid #3d1f5c" }} />
      <div style={{ display: "grid", gridTemplateColumns: "44px 44px 44px", gridTemplateRows: "40px 40px", gap: 4, margin: "10px auto 0", width: "fit-content" }}>
        <div /><button onClick={() => move(0, -1)} style={arrowStyle}>↑</button><div />
        <button onClick={() => move(-1, 0)} style={arrowStyle}>←</button>
        <button onClick={() => move(0, 1)} style={arrowStyle}>↓</button>
        <button onClick={() => move(1, 0)} style={arrowStyle}>→</button>
      </div>
      <p style={{ color: "#6b4f99", fontSize: 11, marginTop: 8, fontStyle: "italic" }}>Arrow keys work too.</p>
    </Card>
  );
}

const arrowStyle = { width: 44, height: 40, borderRadius: 8, background: "#0d0618", border: "1px solid #3d1f5c", color: "#f5f0ff", fontSize: 16, cursor: "pointer" };
