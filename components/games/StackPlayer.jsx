import { useState, useEffect, useRef } from "react";
import { Card, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { useCountdown } from "./useCountdown";
import { reportScore } from "../../lib/challengeScores";

// ─── Stack ───
// Clone of the tower-stacking game (Ketchapp's "Stack" and its many
// clones). A block slides back and forth above the tower; tap to drop
// it. Land it flush and it snaps to the same width as the layer below
// (a "perfect" — builds a combo); land it offset and only the
// overlapping part survives, the rest falls away and the tower gets
// narrower for the next drop. Miss entirely (zero overlap) and it's
// over. One mistake ends it — no lives system here, unlike
// components/games/BasketballPlayer.jsx; "how far can you get on one
// life" IS the game.
//
// Rendered in true isometric projection (see project() below) rather
// than flat-front bars, to match the reference screenshot this was
// built from. The actual GAME LOGIC — trim math, perfect detection,
// speed ramp, scoring — is the exact same 1D "x-range overlap" model
// underneath either way; only how it's drawn changed. One real
// gameplay-adjacent change this DID require: the sliding block's
// bounce range is now defined RELATIVE to the tower's current center,
// not fixed to absolute canvas coordinates. A drifted tower still
// needs to render fully inside a small camera-relative canvas — fixed
// absolute bounds would routinely push the slider off-screen the
// moment the tower drifted away from center, which the flat version
// never had to worry about since it drew everything at absolute
// screen coordinates with no camera at all.
const W = 300, H = 380;
const LAYER_H = 22;
const DEPTH = 60; // constant world-Z thickness of every block — this is what gives the tower visual depth
const ISO_COS = Math.cos(Math.PI / 6);
const ISO_SIN = Math.sin(Math.PI / 6);
const ACTIVE_SCREEN_Y = H - 100; // fixed on-screen anchor for the CURRENT top layer's top face — the camera scrolls to keep it here, same role components/games/StackPlayer.jsx's earlier flat version had ACTIVE_Y play
const INITIAL_WIDTH = 150;
const MIN_WIDTH = 10;
const PERFECT_TOLERANCE = 6;
const BASE_SPEED = 2.1;
const SPEED_PER_LAYER = 0.045;
const MAX_SPEED = 6.5;
const COMBO_BONUS_AT = 3;
const SLIDE_HALF_RANGE = 130; // world units each direction from the tower's current center — fixed regardless of tower width, same escalating-difficulty property the flat version had (same absolute slide distance, shrinking target = harder)
const DEBRIS_GRAVITY = 0.5;
const BASE_HUE = 205;

function hueForLayer(i) {
  return (BASE_HUE + i * 4.5) % 360;
}

function freshMoving(width, hue, fromRight, centerX) {
  const boundLeft = centerX - SLIDE_HALF_RANGE;
  const boundRight = centerX + SLIDE_HALF_RANGE;
  return fromRight
    ? { x0: boundRight - width, x1: boundRight, dir: -1, hue, boundLeft, boundRight }
    : { x0: boundLeft, x1: boundLeft + width, dir: 1, hue, boundLeft, boundRight };
}

function freshState() {
  const base = { x0: (W - INITIAL_WIDTH) / 2, x1: (W + INITIAL_WIDTH) / 2, hue: BASE_HUE };
  return {
    layers: [base],
    moving: freshMoving(INITIAL_WIDTH, hueForLayer(1), false, W / 2),
    speed: BASE_SPEED,
    combo: 0,
    debris: [], // { x0, x1, y (world), z0, z1, vy, hue, life }
  };
}

// World (x, y, z) -> canvas (x, y). camX recenters horizontally on the
// tower's current position; originY is recomputed every frame (see
// computeOriginY) to keep the current top layer anchored at
// ACTIVE_SCREEN_Y regardless of tower height — together these are the
// whole "camera."
function project(x, y, z, camX, originY) {
  const adjX = x + camX;
  return {
    cx: W / 2 + (adjX - z) * ISO_COS,
    cy: originY + (adjX + z) * ISO_SIN - y,
  };
}

function computeOriginY(topWorldY) {
  const refZ = DEPTH / 2; // an arbitrary but fixed reference point (tower-center-x, mid-depth) used purely to anchor the camera
  return ACTIVE_SCREEN_Y - refZ * ISO_SIN + topWorldY;
}

// Draws one block as three visible faces (top, left, right) — the
// standard isometric-cube look. Lighter on top, darker on the two
// sides, same "light from above" shading convention as
// components/games/BreakoutPlayer.jsx's gradient ball uses elsewhere
// in this app, just applied per-face instead of as one gradient.
function drawBlock(ctx, x0, x1, yBot, yTop, hue, camX, originY, alpha = 1) {
  const p = (x, y, z) => project(x, y, z, camX, originY);
  const top = [p(x0, yTop, 0), p(x1, yTop, 0), p(x1, yTop, DEPTH), p(x0, yTop, DEPTH)];
  const left = [p(x0, yBot, 0), p(x1, yBot, 0), p(x1, yTop, 0), p(x0, yTop, 0)];
  const right = [p(x1, yBot, 0), p(x1, yBot, DEPTH), p(x1, yTop, DEPTH), p(x1, yTop, 0)];

  const fillFace = (pts, lightness) => {
    ctx.beginPath();
    ctx.moveTo(pts[0].cx, pts[0].cy);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].cx, pts[i].cy);
    ctx.closePath();
    ctx.fillStyle = `hsla(${hue}, 70%, ${lightness}%, ${alpha})`;
    ctx.fill();
    ctx.strokeStyle = `hsla(${hue}, 70%, ${Math.max(10, lightness - 15)}%, ${alpha})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  };

  fillFace(left, 40);
  fillFace(right, 30);
  fillFace(top, 62);
}

function drawScene(ctx, st, camX, originY, flash) {
  ctx.clearRect(0, 0, W, H);
  const topIndex = st.layers.length - 1;

  for (let i = 0; i <= topIndex; i++) {
    const layer = st.layers[i];
    const yBot = i * LAYER_H, yTop = yBot + LAYER_H;
    // Skip anything that's scrolled fully off the bottom of the canvas
    // — cheap to check via the layer's own top-face reference corner.
    const topCorner = project((layer.x0 + layer.x1) / 2, yTop, DEPTH / 2, camX, originY);
    if (topCorner.cy > H + LAYER_H * 2) continue;
    drawBlock(ctx, layer.x0, layer.x1, yBot, yTop, layer.hue, camX, originY);
  }

  st.debris.forEach((d) => {
    drawBlock(ctx, d.x0, d.x1, d.y, d.y + LAYER_H, d.hue, camX, originY, Math.max(0, d.life));
  });

  const m = st.moving;
  const movingWorldY = (topIndex + 1) * LAYER_H + LAYER_H;
  drawBlock(ctx, m.x0, m.x1, movingWorldY - LAYER_H, movingWorldY, m.hue, camX, originY);

  if (flash) {
    const anchor = project((st.layers[topIndex].x0 + st.layers[topIndex].x1) / 2, movingWorldY + LAYER_H, DEPTH / 2, camX, originY);
    ctx.save();
    ctx.font = "900 20px 'Orbitron', 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = flash.color;
    ctx.shadowColor = flash.color;
    ctx.shadowBlur = 10;
    ctx.fillText(flash.text, anchor.cx, Math.max(24, anchor.cy));
    ctx.restore();
  }
}

export default function StackPlayer({ gameId, round, challenge, player }) {
  const { timeUp } = useCountdown(challenge?.endsAt);
  const canvasRef = useRef(null);
  const stateRef = useRef(freshState());
  const doneRef = useRef(false);
  // Guards against the exact bug this was written to fix: on a touch
  // device, onTouchStart firing drop() doesn't reliably stop the
  // browser's own synthesized mousedown from ALSO firing moments later
  // for the same physical tap — calling preventDefault() in
  // onTouchStart helps but isn't consistent enough across browsers to
  // rely on alone. Recording when the last touch happened and skipping
  // onMouseDown if one just did (rather than dropping onMouseDown
  // entirely) keeps real desktop mouse clicks working exactly as
  // before, while a single tap on mobile only ever drops once instead
  // of stacking twice per tap.
  const lastTouchAtRef = useRef(0);
  const [height, setHeight] = useState(0);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [flash, setFlash] = useState(null);
  const [done, setDone] = useState(false);
  const reportedRef = useRef(false);

  useEffect(() => {
    if (timeUp || doneRef.current) return;
    let raf;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");

    const loop = () => {
      const st = stateRef.current;
      const m = st.moving;
      const width = m.x1 - m.x0;
      m.x0 += m.dir * st.speed;
      m.x1 += m.dir * st.speed;
      if (m.x1 > m.boundRight) { m.x1 = m.boundRight; m.x0 = m.boundRight - width; m.dir = -1; }
      if (m.x0 < m.boundLeft) { m.x0 = m.boundLeft; m.x1 = m.boundLeft + width; m.dir = 1; }

      st.debris = st.debris
        .map((d) => ({ ...d, y: d.y - d.vy, vy: d.vy + DEBRIS_GRAVITY, life: d.life - 0.03 }))
        .filter((d) => d.life > 0);

      if (ctx) {
        const topLayer = st.layers[st.layers.length - 1];
        const topWorldY = st.layers.length * LAYER_H;
        const camX = -(topLayer.x0 + topLayer.x1) / 2;
        const originY = computeOriginY(topWorldY);
        drawScene(ctx, st, camX, originY, flash);
      }
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

  const drop = () => {
    if (doneRef.current) return;
    const st = stateRef.current;
    const top = st.layers[st.layers.length - 1];
    const m = st.moving;
    const topWorldY = st.layers.length * LAYER_H;

    const overlapX0 = Math.max(m.x0, top.x0);
    const overlapX1 = Math.min(m.x1, top.x1);

    if (overlapX1 <= overlapX0) {
      st.debris.push({ x0: m.x0, x1: m.x1, y: topWorldY + LAYER_H, vy: 0.5, hue: m.hue, life: 1 });
      doneRef.current = true;
      setDone(true);
      setFlash(null);
      return;
    }

    const perfect = Math.abs(m.x0 - top.x0) <= PERFECT_TOLERANCE && Math.abs(m.x1 - top.x1) <= PERFECT_TOLERANCE;
    const placedX0 = perfect ? top.x0 : overlapX0;
    const placedX1 = perfect ? top.x1 : overlapX1;

    if (!perfect) {
      if (m.x0 < placedX0) st.debris.push({ x0: m.x0, x1: placedX0, y: topWorldY + LAYER_H, vy: 0.5, hue: m.hue, life: 1 });
      if (m.x1 > placedX1) st.debris.push({ x0: placedX1, x1: m.x1, y: topWorldY + LAYER_H, vy: 0.5, hue: m.hue, life: 1 });
    }

    const newLayerIndex = st.layers.length;
    st.layers.push({ x0: placedX0, x1: placedX1, hue: hueForLayer(newLayerIndex) });
    st.combo = perfect ? st.combo + 1 : 0;
    st.speed = Math.min(MAX_SPEED, BASE_SPEED + newLayerIndex * SPEED_PER_LAYER);

    const placedWidth = placedX1 - placedX0;
    setHeight(newLayerIndex);
    setCombo(st.combo);
    setScore((s) => s + 1 + (st.combo >= COMBO_BONUS_AT ? 1 : 0));
    setFlash({
      text: perfect ? (st.combo >= COMBO_BONUS_AT ? `PERFECT x${st.combo}!` : "PERFECT!") : "+1",
      color: perfect ? "#00ff9d" : "#ffd93d",
    });
    window.setTimeout(() => setFlash(null), 400);

    if (placedWidth < MIN_WIDTH) {
      doneRef.current = true;
      setDone(true);
      return;
    }

    st.moving = freshMoving(placedWidth, hueForLayer(newLayerIndex + 1), m.dir > 0, (placedX0 + placedX1) / 2);
  };

  if (timeUp || done) {
    return <GameResultCard icon="🏗️" title="Tower Fell" valueLabel={`${height} high · ${score} pts`} />;
  }

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🏗️ Stack</h3>
        <Badge>{height} high{combo >= 2 ? ` · combo ${combo}` : ""}</Badge>
      </div>
      <div
        style={{ position: "relative", width: "100%", maxWidth: W, margin: "0 auto", cursor: "pointer" }}
        onMouseDown={() => { if (Date.now() - lastTouchAtRef.current < 700) return; drop(); }}
        onTouchStart={(e) => { e.preventDefault(); lastTouchAtRef.current = Date.now(); drop(); }}
      >
        <canvas
          ref={canvasRef} width={W} height={H}
          style={{ width: "100%", maxWidth: W, height: "auto", background: "radial-gradient(circle at 50% 30%, #1a2f6b, #0a0f28 70%)", borderRadius: 10, border: "1px solid #3d1f5c", touchAction: "none", display: "block" }}
        />
      </div>
      <p style={{ color: "#6b4f99", fontSize: 11, marginTop: 8, fontStyle: "italic" }}>Tap anywhere to drop the block. Land it flush for a perfect stack — one miss ends the tower.</p>
    </Card>
  );
}
