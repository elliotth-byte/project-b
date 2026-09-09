import { useState, useEffect, useRef } from "react";
import { Card, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { useCountdown } from "./useCountdown";
import { reportScore } from "../../lib/challengeScores";

// ─── Pegasus's Flight ───
// A Greek-mythology-skinned Flappy Bird: tap to flap Pegasus between
// pairs of marble columns, grab Zeus's lightning bolts for a bonus,
// three crashes and you're grounded — same lives+outer-timer shape as
// components/games/BasketballPlayer.jsx (lives are what normally ends
// it, challenge?.endsAt is purely a backstop against an absurdly long
// run). Rendered entirely as real SVG shapes (columns, bird, sky,
// bolts), not canvas or emoji — same choice as
// components/games/RelicIcons.jsx made for Hermes' Grasp, for the same
// reason: hand-built vector shapes theme cleanly and scale crisply at
// any size, where a canvas draw call or a borrowed emoji can't.
const W = 300, H = 420;
const GROUND_H = 30;
const GROUND_Y = H - GROUND_H;
const BIRD_X = 78;
const BIRD_R = 11;
const COLUMN_W = 34;
const COLUMN_SPACING = 165;
const GRAVITY = 0.34;
const FLAP_V = -6.1;
const MAX_FALL_V = 8.5;

function freshState() {
  return {
    birdY: H / 2,
    vy: 0,
    columns: [{ x: W + 60, gapY: H / 2, gapH: 132, passed: false, bolt: false }],
    scrollSpeed: 2.1,
    crashed: false,
  };
}

function spawnColumn(prevX, gapH) {
  const margin = 50;
  const gapY = margin + Math.random() * (GROUND_Y - margin * 2);
  return { x: prevX + COLUMN_SPACING, gapY, gapH, passed: false, bolt: Math.random() < 0.35 };
}

// A fluted Doric column — capital, shaft with a few flute lines, base —
// drawn as a reusable group rather than one flat rect, so it actually
// reads as "column" rather than "pipe wearing a Greek label."
function Column({ x, top, height, flip }) {
  if (height <= 0) return null;
  const capH = 10, baseH = 8;
  const shaftTop = flip ? top + capH : top + baseH;
  const shaftH = Math.max(0, height - capH - baseH);
  const shaftY = flip ? top + capH : top + baseH;
  return (
    <g>
      <rect x={x - 3} y={top} width={COLUMN_W + 6} height={capH} fill="#e8dcc8" stroke="#a68fd6" strokeWidth="1" />
      <rect x={x} y={shaftY} width={COLUMN_W} height={shaftH} fill="#f0e6d2" stroke="#c9b896" strokeWidth="1" />
      {[0.2, 0.4, 0.6, 0.8].map((f) => (
        <line key={f} x1={x + COLUMN_W * f} y1={shaftY} x2={x + COLUMN_W * f} y2={shaftY + shaftH} stroke="#c9b896" strokeWidth="1" opacity="0.6" />
      ))}
      <rect x={x - 3} y={top + height - (flip ? capH : baseH)} width={COLUMN_W + 6} height={flip ? capH : baseH} fill="#e8dcc8" stroke="#a68fd6" strokeWidth="1" />
    </g>
  );
}

function Bolt({ x, y }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <circle r="11" fill="#ffd700" opacity="0.18" />
      <path d="M -2,-9 L 4,-1 L -1,-1 L 3,9 L -6,0 L -1,0 Z" fill="#ffd700" stroke="#ff9f4d" strokeWidth="0.6" />
    </g>
  );
}

// A simple winged-horse silhouette — body, neck/head, mane, and a wing
// whose angle reacts to velocity, so it visibly flaps up on a tap and
// trails down while falling rather than sitting rigid.
function PegasusIcon({ y, vy }) {
  const tilt = Math.max(-25, Math.min(70, vy * 7));
  const wingAngle = vy < -1 ? -35 : vy > 3 ? 25 : -5;
  return (
    <g transform={`translate(${BIRD_X}, ${y}) rotate(${tilt})`}>
      <ellipse cx="0" cy="0" rx="13" ry="9" fill="#f5f0ff" stroke="#c9b896" strokeWidth="1" />
      <path d="M 8,-4 Q 18,-8 16,2 Q 12,4 8,1 Z" fill="#f5f0ff" stroke="#c9b896" strokeWidth="1" />
      <circle cx="17" cy="-1" r="1.2" fill="#241340" />
      <path d="M 4,-8 Q 8,-14 2,-14 Q -2,-11 0,-6 Z" fill="#e0d4ff" opacity="0.9" />
      <g transform={`rotate(${wingAngle})`}>
        <path d="M -3,-2 Q -14,-14 -22,-6 Q -14,-2 -8,4 Q -6,0 -3,-2 Z" fill="#c879ff" stroke="#a68fd6" strokeWidth="1" />
      </g>
      <path d="M -13,3 Q -18,10 -13,14 Q -10,9 -9,4 Z" fill="#f5f0ff" stroke="#c9b896" strokeWidth="1" />
    </g>
  );
}

export default function PegasusFlightPlayer({ gameId, round, challenge, player }) {
  const cfg = challenge?.gameConfig || { lives: 3 };
  const { timeUp } = useCountdown(challenge?.endsAt);
  const stateRef = useRef(freshState());
  const [tick, setTick] = useState(0);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(cfg.lives || 3);
  const [done, setDone] = useState(false);
  const doneRef = useRef(false);
  const reportedRef = useRef(false);

  useEffect(() => {
    if (timeUp || doneRef.current) return;
    let raf;
    const loop = () => {
      const st = stateRef.current;
      if (!st.crashed) {
        st.vy = Math.min(MAX_FALL_V, st.vy + GRAVITY);
        st.birdY += st.vy;

        const gapH = Math.max(96, 132 - Math.floor(score / 6) * 4);
        st.scrollSpeed = Math.min(3.6, 2.1 + score * 0.04);
        st.columns.forEach((c) => { c.x -= st.scrollSpeed; });
        if (st.columns[st.columns.length - 1].x < W - COLUMN_SPACING) {
          st.columns.push(spawnColumn(st.columns[st.columns.length - 1].x, gapH));
        }
        st.columns = st.columns.filter((c) => c.x > -COLUMN_W - 10);

        let crashed = st.birdY - BIRD_R <= 0 || st.birdY + BIRD_R >= GROUND_Y;
        for (const c of st.columns) {
          if (!crashed && c.x < BIRD_X + BIRD_R && c.x + COLUMN_W > BIRD_X - BIRD_R) {
            const gapTop = c.gapY - c.gapH / 2, gapBot = c.gapY + c.gapH / 2;
            if (st.birdY - BIRD_R < gapTop || st.birdY + BIRD_R > gapBot) crashed = true;
          }
          if (!c.passed && c.x + COLUMN_W < BIRD_X - BIRD_R) {
            c.passed = true;
            setScore((s) => s + 1);
          }
          if (c.bolt && Math.hypot(c.x + COLUMN_W / 2 - BIRD_X, c.gapY - st.birdY) < 16) {
            c.bolt = false;
            setScore((s) => s + 5);
          }
        }
        if (crashed) {
          st.crashed = true;
          setLives((l) => {
            const next = l - 1;
            if (next <= 0) { doneRef.current = true; setDone(true); }
            else window.setTimeout(() => { st.birdY = H / 2; st.vy = 0; st.columns = [{ x: W + 60, gapY: H / 2, gapH: 132, passed: false, bolt: false }]; st.crashed = false; }, 700);
            return next;
          });
        }
      }
      setTick((t) => t + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeUp, score]);

  useEffect(() => {
    reportScore(gameId, round.round, player.id, player.name, score, { final: false });
  }, [score]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if ((timeUp || done) && !reportedRef.current) {
      reportedRef.current = true;
      reportScore(gameId, round.round, player.id, player.name, score, { final: true });
    }
  }, [timeUp, done]); // eslint-disable-line react-hooks/exhaustive-deps

  const flap = () => {
    if (doneRef.current || timeUp || stateRef.current.crashed) return;
    stateRef.current.vy = FLAP_V;
  };

  useEffect(() => {
    const onKey = (e) => { if (e.code === "Space") { e.preventDefault(); flap(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (timeUp || done) {
    return <GameResultCard icon="🪽" title="Grounded" valueLabel={`${score} pts`} />;
  }

  const st = stateRef.current;

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🪽 Pegasus's Flight</h3>
        <Badge>{"❤️".repeat(lives)} · {score} pts</Badge>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        onClick={flap}
        onTouchStart={(e) => { e.preventDefault(); flap(); }}
        style={{ width: "100%", maxWidth: W, background: "#0d0618", borderRadius: 10, border: "1px solid #3d1f5c", cursor: "pointer", touchAction: "none" }}
      >
        <defs>
          <linearGradient id="pegasusSky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#241340" />
            <stop offset="55%" stopColor="#4a2a72" />
            <stop offset="100%" stopColor="#b829ff" stopOpacity="0.35" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width={W} height={H} fill="url(#pegasusSky)" />
        <ellipse cx="60" cy="70" rx="30" ry="10" fill="#f5f0ff" opacity="0.08" />
        <ellipse cx="220" cy="130" rx="40" ry="12" fill="#f5f0ff" opacity="0.06" />
        <ellipse cx="150" cy="40" rx="26" ry="9" fill="#f5f0ff" opacity="0.07" />
        <path d={`M 0,${GROUND_Y} L 40,${GROUND_Y - 40} L 90,${GROUND_Y - 15} L 140,${GROUND_Y - 55} L 190,${GROUND_Y - 20} L 240,${GROUND_Y - 48} L ${W},${GROUND_Y - 10} L ${W},${GROUND_Y} Z`} fill="#1a0a2e" opacity="0.7" />

        {st.columns.map((c, i) => (
          <g key={i}>
            <Column x={c.x} top={0} height={c.gapY - c.gapH / 2} flip={false} />
            <Column x={c.x} top={c.gapY + c.gapH / 2} height={GROUND_Y - (c.gapY + c.gapH / 2)} flip={true} />
            {c.bolt && <Bolt x={c.x + COLUMN_W / 2} y={c.gapY} />}
          </g>
        ))}

        <PegasusIcon y={st.birdY} vy={st.vy} />

        <rect x="0" y={GROUND_Y} width={W} height={GROUND_H} fill="#150a28" stroke="#3d1f5c" strokeWidth="1" />
        {Array.from({ length: 10 }).map((_, i) => (
          <rect key={i} x={i * 32} y={GROUND_Y + 6} width="20" height="4" fill="#3d1f5c" opacity="0.5" />
        ))}
      </svg>
      <p style={{ color: "#6b4f99", fontSize: 11, marginTop: 8, fontStyle: "italic" }}>
        Tap, click, or press Space to flap. Grab Zeus's bolts for +5.
      </p>
    </Card>
  );
}
