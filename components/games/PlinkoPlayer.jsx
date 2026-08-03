import { useState, useEffect, useRef } from "react";
import { Card, Btn, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { useCountdown } from "./useCountdown";
import { reportScore } from "../../lib/challengeScores";

const SLOTS = [100, 50, 25, 10, 5, 10, 25, 50, 100];
const ROWS = SLOTS.length - 1;
const W = 300, H = 320;
const colX = (col) => (W / (SLOTS.length)) * (col + 0.5);

export default function PlinkoPlayer({ gameId, round, challenge, player }) {
  const cfg = challenge?.gameConfig || { shots: 3 };
  const { timeUp } = useCountdown(challenge?.endsAt);
  const canvasRef = useRef(null);
  const [score, setScore] = useState(0);
  const [shotsLeft, setShotsLeft] = useState(cfg.shots || 3);
  const [startCol, setStartCol] = useState(Math.floor(SLOTS.length / 2));
  const [dropping, setDropping] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [done, setDone] = useState(false);
  const reportedRef = useRef(false);
  const ballRef = useRef({ row: 0, col: startCol });

  const draw = () => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#3d1f5c";
    for (let r = 0; r < ROWS; r++) {
      const pegsInRow = r + 3;
      for (let p = 0; p < pegsInRow; p++) {
        const x = (W / (pegsInRow + 1)) * (p + 1);
        const y = 30 + r * ((H - 90) / ROWS);
        ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.fillStyle = "#150a28";
    ctx.fillRect(0, H - 34, W, 34);
    SLOTS.forEach((v, i) => {
      ctx.fillStyle = "#ff2d95";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(String(v), colX(i), H - 14);
    });
    const b = ballRef.current;
    const y = 30 + b.row * ((H - 90) / ROWS);
    const x = colX(b.col);
    ctx.fillStyle = "#ff3860";
    ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
  };

  useEffect(() => { draw(); }); // eslint-disable-line react-hooks/exhaustive-deps

  const drop = () => {
    if (dropping || shotsLeft <= 0) return;
    setDropping(true);
    setLastResult(null);
    let col = startCol;
    ballRef.current = { row: 0, col };
    draw();
    let row = 0;
    const interval = window.setInterval(() => {
      row += 1;
      col = Math.max(0, Math.min(SLOTS.length - 1, col + (Math.random() < 0.5 ? -0.5 : 0.5)));
      ballRef.current = { row, col };
      draw();
      if (row >= ROWS) {
        window.clearInterval(interval);
        const finalSlot = Math.round(col);
        const won = SLOTS[finalSlot];
        setScore((s) => s + won);
        setLastResult(won);
        setShotsLeft((s) => s - 1);
        setDropping(false);
      }
    }, 160);
  };

  useEffect(() => {
    reportScore(gameId, round.round, player.id, player.name, score, { final: false });
  }, [score]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if ((shotsLeft <= 0 && !dropping) || timeUp) {
      if (!reportedRef.current) {
        reportedRef.current = true;
        setDone(true);
        reportScore(gameId, round.round, player.id, player.name, score, { final: true });
      }
    }
  }, [shotsLeft, dropping, timeUp]); // eslint-disable-line react-hooks/exhaustive-deps

  if (done) return <GameResultCard icon="🔴" title="All Shots Used" valueLabel={`${score} points`} />;

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🔴 Plinko</h3>
        <Badge>{shotsLeft} shots left · {score} pts</Badge>
      </div>
      <canvas ref={canvasRef} width={W} height={H} style={{ background: "#0d0618", borderRadius: 10, border: "1px solid #3d1f5c" }} />
      {lastResult != null && !dropping && <p style={{ color: "#00ff9d", fontSize: 13, margin: "8px 0 0" }}>Landed on {lastResult} points!</p>}
      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 10 }}>
        <button disabled={dropping} onClick={() => setStartCol((c) => Math.max(0, c - 1))} style={arrowStyle}>←</button>
        <Btn onClick={drop} disabled={dropping || shotsLeft <= 0}>{dropping ? "Dropping..." : "Drop Chip"}</Btn>
        <button disabled={dropping} onClick={() => setStartCol((c) => Math.min(SLOTS.length - 1, c + 1))} style={arrowStyle}>→</button>
      </div>
    </Card>
  );
}

const arrowStyle = { width: 44, height: 36, borderRadius: 8, background: "#0d0618", border: "1px solid #3d1f5c", color: "#f5f0ff", fontSize: 16, cursor: "pointer" };
