import { useState, useEffect, useRef } from "react";
import { Card, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { useCountdown } from "./useCountdown";
import { reportScore } from "../../lib/challengeScores";

// ─── Pan's Panic ───
// A Greek-mythology-skinned "Chicken Scream" clone — Pan is the god
// whose own shout is the literal origin of the word "panic", so the
// reskin here is the shout itself, not just a costume change: scream
// into your mic and your satyr sprints; go dead silent and they stop
// cold. Three obstacle types put different ends of that same control
// to use:
//   - CHASMS need you to be airborne (mid-jump) when they slide under
//     you. A jump triggers off a SPIKE in volume (not just "loud"), and
//     — same as the original game's "bigger scream, bigger jump" —
//     the world only keeps scrolling out from under you while you're
//     still mid-air AND still screaming, so a jump you don't sustain
//     lands short and drops you in.
//   - HERM STATUES sit square in the path and can't be jumped — the
//     only way past is to go essentially silent before you reach one;
//     hit it above a walking pace and it flattens you.
//   - SIRENS lurk in tighter clusters and demand near-total silence,
//     not just a walking pace — the enchantresses only let a nearly
//     motionless satyr slip by; anything above that and their song
//     (rather than the rock itself) stops you cold. They only start
//     appearing once you've put some real distance behind you.
// No separate "duck" input, no variable-height jump math to tune —
// just loud-to-go, silent-to-stop, and a spike to leap, which is the
// entire input vocabulary a screamed sound can actually carry.
//
// Mic access needs a real user gesture (the Start button) and can be
// denied, missing, or simply unavailable (no getUserMedia at all,
// insecure context, no hardware) — same "detect, don't assume" shape
// as MinotaurMazePlayer.jsx's device-motion fallback: on any failure
// this drops to a press-and-hold "🗣️ SCREAM" button that feeds the
// exact same volume signal the mic would have, so the whole game (and
// every obstacle rule above) plays identically either way.
//
// Rendering is real SVG (not canvas): the physics loop below still
// runs on requestAnimationFrame and mutates a plain ref every frame
// for performance, but the actual pixels come from JSX computed off
// that ref each tick, with the sky, parallax mountains and columns,
// and every obstacle drawn as vector shapes rather than canvas fills.
const W = 300, H = 380;
const GROUND_Y = H - 70;
const AVATAR_X = 82;
const AVATAR_R = 13;

const MAX_SPEED_PX_S = 185; // world-scroll speed at full scream
const SPEED_SMOOTH = 0.22; // per-frame lerp toward the target speed — a little inertia so it reads as running, not teleporting
const VOLUME_SMOOTH = 0.35;

const SPIKE_ON = 0.55; // volume level that triggers a jump (edge-triggered)
const SPIKE_OFF = 0.32; // must drop back below this before another jump can arm — stops one long scream from firing a jump every frame
const SAFE_PASS_SPEED = 34; // px/s — a herm statue only lets you through at or under this scroll speed
const SIREN_SAFE_SPEED = 12; // px/s — sirens demand a much closer to dead stop
const SIREN_UNLOCK_PX = 1100; // sirens don't start spawning until you've put this much distance behind you

const JUMP_DURATION_MS = 620;
const JUMP_HEIGHT_PX = 58;

const STUN_MS = 700;
const RESPAWN_CLEAR_PX = 70; // obstacles within this of the avatar get cleared on respawn so a life loss can't chain into another instantly

const SCORE_PER_PX = 0.06; // continuous distance score — only accrues while actually moving
const OBSTACLE_CLEAR_BONUS = 12;

// ── Background: four sky palettes the world eases between every
// THEME_SEGMENT_PX of travel, purely cosmetic (so "more varied
// background" doesn't ever change on which obstacles show up). ──
const SKY_THEMES = [
  { top: "#2a1750", mid: "#4a2a72", bottom: "#b829ff", ground: "#150a28" }, // dusk
  { top: "#0d1b3a", mid: "#1c2f5c", bottom: "#3a8fd6", ground: "#0a1428" }, // day
  { top: "#3a1030", mid: "#a8355a", bottom: "#ff8a4d", ground: "#200a18" }, // sunset
  { top: "#05061a", mid: "#141238", bottom: "#241d55", ground: "#05040f" }, // night
];
const THEME_SEGMENT_PX = 2600;
const STARS = Array.from({ length: 22 }, (_, i) => ({
  x: (i * 37 + (i % 5) * 11) % W,
  y: 6 + ((i * 53) % 90),
  r: 0.6 + (i % 3) * 0.4,
}));
const MOUNTAIN_TILE_W = 220;
const COLUMN_TILE_W = 130;
const CELESTIAL_TILE_W = W + 160;

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp01(v) { return Math.max(0, Math.min(1, v)); }

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function lerpColor(hexA, hexB, t) {
  const a = hexToRgb(hexA), b = hexToRgb(hexB);
  const [r, g, bch] = a.map((v, i) => Math.round(lerp(v, b[i], t)));
  return `rgb(${r},${g},${bch})`;
}

// Returns the x offsets (all <= 0, then stepping up by tileW) needed to
// tile a repeating background layer seamlessly across the viewport,
// given how far that layer has scrolled. Shared by the mountains,
// columns, and sun/moon layers — each just moves at its own fraction
// of the real scroll distance for a cheap parallax effect.
function tileOffsets(scrolledPx, tileW, viewW) {
  const base = -(scrolledPx % tileW);
  const count = Math.ceil((viewW - base) / tileW) + 1;
  return Array.from({ length: count }, (_, i) => base + i * tileW);
}

function mountainPoints(localX) {
  const y = GROUND_Y - 6; // sits just behind the ground line
  return [
    [localX, y], [localX + 18, y - 42], [localX + 45, y - 18], [localX + 75, y - 58],
    [localX + 108, y - 24], [localX + 140, y - 62], [localX + 172, y - 28],
    [localX + 202, y - 46], [localX + MOUNTAIN_TILE_W, y],
  ].map((p) => p.join(",")).join(" ");
}

function rockPoints(x, width) {
  const peaks = 4;
  const step = width / peaks;
  const pts = [`${x},${GROUND_Y}`];
  for (let i = 0; i <= peaks; i++) {
    pts.push(`${x + i * step},${i % 2 === 0 ? GROUND_Y - 30 : GROUND_Y - 14}`);
  }
  pts.push(`${x + width},${GROUND_Y}`);
  return pts.join(" ");
}

function freshState() {
  return {
    obstacles: [{ x: W + 90, type: "gap", width: 62, passed: false, failed: false }],
    scrollSpeed: 0,
    volumeSmoothed: 0,
    spikeArmed: true,
    jumping: false,
    jumpElapsed: 0,
    jumpTraveledPx: 0,
    stunUntil: 0,
    distancePx: 0,
    alive: true,
  };
}

function spawnObstacle(prevX, distancePx) {
  const difficulty = clamp01(distancePx / 6000); // ramps up over the first ~6000px of running
  const spacing = 210 - difficulty * 60 + Math.random() * 90;
  const sirenUnlocked = distancePx > SIREN_UNLOCK_PX;
  const roll = Math.random();
  const type = sirenUnlocked && roll < 0.18 ? "siren" : roll < 0.5 ? "wall" : "gap";
  if (type === "wall") return { x: prevX + spacing, type: "wall", width: 26, passed: false, failed: false };
  if (type === "siren") return { x: prevX + spacing, type: "siren", width: 92 + difficulty * 40 + Math.random() * 20, passed: false, failed: false };
  return { x: prevX + spacing, type: "gap", width: 58 + difficulty * 46 + Math.random() * 14, passed: false, failed: false };
}

export default function PansPanicPlayer({ gameId, round, challenge, player }) {
  const cfg = challenge?.gameConfig || { lives: 3 };
  const { timeUp } = useCountdown(challenge?.endsAt);

  const stRef = useRef(freshState());
  const nowRef = useRef(0);
  const rafRef = useRef(null);
  const lastFrameRef = useRef(null);
  const scoreRef = useRef(0);
  const lastReportRef = useRef(0);
  const doneRef = useRef(false);
  const reportedRef = useRef(false);

  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);
  const streamRef = useRef(null);
  const noiseFloorRef = useRef(0.01);
  const peakRef = useRef(0.08);
  const manualHeldRef = useRef(false);

  const [started, setStarted] = useState(false);
  const [micMode, setMicMode] = useState("pending"); // "pending" | "listening" | "manual"
  const [lives, setLives] = useState(cfg.lives || 3);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const [result, setResult] = useState(null); // { fellPx: number } — just for the closing card's flavor
  const [, forceTick] = useState(0);

  function stopMic() {
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    if (audioCtxRef.current) { audioCtxRef.current.close().catch(() => {}); audioCtxRef.current = null; }
    analyserRef.current = null;
  }
  useEffect(() => () => stopMic(), []);

  async function beginListening() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      streamRef.current = stream;
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new Ctx();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.15;
      source.connect(analyser);
      analyserRef.current = analyser;
      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
      setMicMode("listening");
    } catch {
      setMicMode("manual");
    }
  }

  const handleStart = () => {
    if (started) return;
    setStarted(true);
    lastFrameRef.current = null;
    if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
      beginListening();
    } else {
      setMicMode("manual");
    }
  };

  // Raw (un-normalized) 0..1 volume reading for this frame, from whichever
  // source is active. Manual mode reports a hard 0/1 — a press is its own
  // spike and a release is instant silence, which is exactly what the
  // button is for.
  function readRawVolume() {
    if (micMode === "manual") return manualHeldRef.current ? 1 : 0;
    const analyser = analyserRef.current, data = dataArrayRef.current;
    if (!analyser || !data) return 0;
    analyser.getByteTimeDomainData(data);
    let sumSq = 0;
    for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sumSq += v * v; }
    const rms = Math.sqrt(sumSq / data.length);

    // Auto-gain against ambient noise and whatever this mic/device's own
    // sensitivity happens to be: the noise floor drifts slowly toward
    // whatever's typical, the peak snaps up instantly on a loud moment and
    // decays slowly otherwise, so the same code plays fairly on a phone
    // held close or across the room.
    noiseFloorRef.current = lerp(noiseFloorRef.current, rms, 0.003);
    if (rms > peakRef.current) peakRef.current = rms;
    else peakRef.current = Math.max(0.06, peakRef.current * 0.997);

    const span = Math.max(0.02, peakRef.current - noiseFloorRef.current);
    return clamp01((rms - noiseFloorRef.current) / span);
  }

  useEffect(() => {
    if (!started || timeUp || doneRef.current) return;

    const loop = (now) => {
      if (lastFrameRef.current == null) lastFrameRef.current = now;
      const dt = Math.min(1 / 20, (now - lastFrameRef.current) / 1000);
      lastFrameRef.current = now;
      nowRef.current = now;

      const st = stRef.current;
      const stunned = now < st.stunUntil;

      if (!stunned && st.alive) {
        const rawVol = readRawVolume();
        st.volumeSmoothed = lerp(st.volumeSmoothed, rawVol, VOLUME_SMOOTH);

        // Edge-triggered jump: crossing SPIKE_ON while grounded and armed.
        if (!st.jumping && st.spikeArmed && st.volumeSmoothed >= SPIKE_ON) {
          st.jumping = true;
          st.jumpElapsed = 0;
          st.jumpTraveledPx = 0;
          st.spikeArmed = false;
        }
        if (!st.spikeArmed && st.volumeSmoothed <= SPIKE_OFF) st.spikeArmed = true;

        const targetSpeed = st.volumeSmoothed * MAX_SPEED_PX_S;
        st.scrollSpeed = lerp(st.scrollSpeed, targetSpeed, SPEED_SMOOTH);
        const dx = st.scrollSpeed * dt;
        st.distancePx += dx;
        if (st.jumping) st.jumpTraveledPx += dx;

        if (st.jumping) {
          st.jumpElapsed += dt * 1000;
          if (st.jumpElapsed >= JUMP_DURATION_MS) st.jumping = false;
        }

        // Advance the world and resolve every obstacle currently near the avatar.
        for (const ob of st.obstacles) {
          if (ob.failed || ob.passed) { ob.x -= dx; continue; }
          const wasOverlapping = ob.x <= AVATAR_X && ob.x + ob.width >= AVATAR_X;
          ob.x -= dx;
          const overlapping = ob.x <= AVATAR_X && ob.x + ob.width >= AVATAR_X;

          if (ob.type === "wall") {
            if (overlapping && st.scrollSpeed > SAFE_PASS_SPEED) ob.failed = true;
          } else if (ob.type === "siren") {
            if (overlapping && st.scrollSpeed > SIREN_SAFE_SPEED) ob.failed = true;
          } else if (ob.type === "gap" && !st.jumping && overlapping) {
            // Standing (or landed) on open air — either never jumped, or
            // the jump ran out mid-gap because the scream didn't hold.
            ob.failed = true;
          }
          if (wasOverlapping && !overlapping && ob.x + ob.width < AVATAR_X - AVATAR_R && !ob.failed && !ob.passed) {
            ob.passed = true;
            scoreRef.current += OBSTACLE_CLEAR_BONUS;
          }
        }
        scoreRef.current += dx * SCORE_PER_PX;

        const last = st.obstacles[st.obstacles.length - 1];
        if (last.x < W + 40) st.obstacles.push(spawnObstacle(last.x, st.distancePx));
        st.obstacles = st.obstacles.filter((o) => o.x > -140);

        const failedNow = st.obstacles.find((o) => o.failed && !o._counted);
        if (failedNow) {
          failedNow._counted = true;
          st.alive = false;
          setLives((l) => {
            const next = l - 1;
            if (next <= 0) {
              doneRef.current = true;
              setResult({ finalDistance: Math.round(st.distancePx) });
              setDone(true);
            } else {
              st.stunUntil = now + STUN_MS;
              window.setTimeout(() => {
                st.obstacles = st.obstacles.filter((o) => Math.abs(o.x - AVATAR_X) > RESPAWN_CLEAR_PX);
                st.jumping = false;
                st.scrollSpeed = 0;
                st.volumeSmoothed = 0;
                st.spikeArmed = true;
                st.alive = true;
              }, STUN_MS);
            }
            return next;
          });
        }

        if (now - lastReportRef.current > 400) {
          lastReportRef.current = now;
          reportScore(gameId, round.round, player.id, player.name, Math.round(scoreRef.current), { final: false });
          setScore(Math.round(scoreRef.current));
        }
      }

      if (!doneRef.current) {
        forceTick((t) => (t + 1) % 100000);
        rafRef.current = requestAnimationFrame(loop);
      }
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, timeUp, micMode]);

  useEffect(() => {
    if (timeUp && !doneRef.current) {
      doneRef.current = true;
      setResult({ finalDistance: Math.round(stRef.current.distancePx) });
      setDone(true);
    }
  }, [timeUp]);

  useEffect(() => {
    if (!done || reportedRef.current) return;
    reportedRef.current = true;
    stopMic();
    reportScore(gameId, round.round, player.id, player.name, Math.round(scoreRef.current), { final: true });
  }, [done]); // eslint-disable-line react-hooks/exhaustive-deps

  if (done) {
    return <GameResultCard icon="😱" title="Panic Subsided" valueLabel={`${score} pts`} />;
  }

  // ── Everything below is pure render derived from stRef/nowRef; the
  // physics loop above is the only thing that ever mutates them. ──
  const st = stRef.current;
  const now = nowRef.current;

  const segF = (st.distancePx / THEME_SEGMENT_PX) % SKY_THEMES.length;
  const themeIdx = Math.floor(segF);
  const nextThemeIdx = (themeIdx + 1) % SKY_THEMES.length;
  const themeFrac = segF - themeIdx;
  const theme = {
    top: lerpColor(SKY_THEMES[themeIdx].top, SKY_THEMES[nextThemeIdx].top, themeFrac),
    mid: lerpColor(SKY_THEMES[themeIdx].mid, SKY_THEMES[nextThemeIdx].mid, themeFrac),
    bottom: lerpColor(SKY_THEMES[themeIdx].bottom, SKY_THEMES[nextThemeIdx].bottom, themeFrac),
    ground: lerpColor(SKY_THEMES[themeIdx].ground, SKY_THEMES[nextThemeIdx].ground, themeFrac),
  };
  const nightFactor = themeIdx === 3 ? 1 - themeFrac : nextThemeIdx === 3 ? themeFrac : 0;

  const mountainOffsets = tileOffsets(st.distancePx * 0.15, MOUNTAIN_TILE_W, W);
  const columnOffsets = tileOffsets(st.distancePx * 0.4, COLUMN_TILE_W, W);
  const celestialOffsets = tileOffsets(st.distancePx * 0.05, CELESTIAL_TILE_W, W);

  const bob = st.jumping ? 0 : Math.sin(now / 90) * 2.5;
  const jumpArc = st.jumping ? Math.sin(Math.PI * Math.min(1, st.jumpElapsed / JUMP_DURATION_MS)) * JUMP_HEIGHT_PX : 0;
  const avatarY = GROUND_Y - AVATAR_R - jumpArc - (st.alive ? Math.max(0, bob) : 0);
  const flash = !st.alive && now < st.stunUntil;
  const flashOpacity = flash ? 0.5 + 0.5 * Math.sin(now / 60) : 1;
  const avatarGlyph = st.alive ? (st.jumping ? "🙀" : st.volumeSmoothed > 0.3 ? "😱" : "🐐") : "💫";

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>😱 Pan's Panic</h3>
        <Badge>{"❤️".repeat(Math.max(0, lives))} · {score} pts</Badge>
      </div>

      {!started ? (
        <>
          <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 14px", fontStyle: "italic" }}>
            Pan's own cry is what gave "panic" its name — channel it. Scream into your mic to run, a sudden louder
            burst to leap a chasm (keep screaming mid-air or you'll land short), go dead quiet to slip past a herm
            statue without knocking it flat, and go nearly silent — quieter still — to creep past a siren's rocks.
            No mic, denied permission, or a quiet room — a press-and-hold Scream button takes over automatically.
          </p>
          <button
            onClick={handleStart}
            style={{
              padding: "12px 22px", borderRadius: 10, fontSize: 13, fontWeight: 800, textTransform: "uppercase",
              letterSpacing: 0.8, cursor: "pointer", fontFamily: "'Orbitron', 'Segoe UI', sans-serif",
              background: "linear-gradient(135deg, #ff2d95, #b829ff)", color: "#05010f", border: "2px solid #ff8ac2",
            }}
          >
            😱 Raise the Alarm
          </button>
        </>
      ) : (
        <>
          <p style={{ color: "#6b4f99", fontSize: 11, margin: "0 0 10px", fontStyle: "italic" }}>
            {micMode === "listening" && "Listening for your scream — louder runs faster, silence stops you cold."}
            {micMode === "manual" && "No mic available — hold the button below to scream, release to go silent."}
            {micMode === "pending" && "Asking for mic access..."}
          </p>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            style={{ width: "100%", maxWidth: W, height: "auto", borderRadius: 10, border: "1px solid #3d1f5c", display: "block", margin: "0 auto", background: theme.ground }}
          >
            <defs>
              <linearGradient id="pansSky" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={theme.top} />
                <stop offset="60%" stopColor={theme.mid} />
                <stop offset="100%" stopColor={theme.bottom} stopOpacity={0.4} />
              </linearGradient>
            </defs>

            <rect x={0} y={0} width={W} height={H} fill="url(#pansSky)" />

            {/* stars fade in as the night theme takes over */}
            {nightFactor > 0.02 && STARS.map((s, i) => (
              <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#f5f0ff" opacity={nightFactor * 0.85} />
            ))}

            {/* sun / moon — drifts slowly opposite the run direction, wraps around */}
            {celestialOffsets.map((ox, i) => (
              <circle key={i} cx={ox + 50} cy={44} r={16} fill={nightFactor > 0.5 ? "#e8e3f5" : "#ffd27a"} opacity={0.9} />
            ))}

            {/* distant mountains — slowest parallax layer */}
            {mountainOffsets.map((ox, i) => (
              <polygon key={i} transform={`translate(${ox},0)`} points={mountainPoints(0)} fill={theme.mid} opacity={0.55} />
            ))}

            {/* greek columns — mid parallax layer */}
            {columnOffsets.map((ox, i) => (
              <g key={i} transform={`translate(${ox},0)`} opacity={0.4}>
                <rect x={40} y={GROUND_Y - 96} width={12} height={96} fill={theme.top} />
                <rect x={36} y={GROUND_Y - 100} width={20} height={8} fill={theme.top} />
                <rect x={36} y={GROUND_Y - 4} width={20} height={6} fill={theme.top} />
              </g>
            ))}

            {/* ground */}
            <rect x={0} y={GROUND_Y} width={W} height={H - GROUND_Y} fill={theme.ground} />
            <line x1={0} y1={GROUND_Y} x2={W} y2={GROUND_Y} stroke="#3d1f5c" strokeWidth={2} />

            {/* obstacles */}
            {st.obstacles.map((ob, i) => {
              if (ob.type === "gap") {
                return (
                  <polygon
                    key={i}
                    points={`${ob.x},${GROUND_Y} ${ob.x + 6},${GROUND_Y + 22} ${ob.x + ob.width - 6},${GROUND_Y + 22} ${ob.x + ob.width},${GROUND_Y}`}
                    fill={ob.failed ? "#ff3850" : "#05010f"}
                    opacity={ob.failed ? 0.55 : 1}
                  />
                );
              }
              if (ob.type === "siren") {
                return (
                  <g key={i}>
                    <polygon points={rockPoints(ob.x, ob.width)} fill={ob.failed ? "#ff3850" : "#5a3a7a"} stroke="#a68fd6" strokeWidth={1} opacity={ob.failed ? 0.7 : 1} />
                    <text x={ob.x + ob.width / 2} y={GROUND_Y - 34} fontSize={18} textAnchor="middle">🧜</text>
                  </g>
                );
              }
              // herm statue
              const ww = ob.width, wh = 46;
              return (
                <g key={i}>
                  <rect x={ob.x} y={GROUND_Y - wh} width={ww} height={wh} fill={ob.failed ? "#ff3850" : "#e8dcc8"} stroke="#a68fd6" strokeWidth={1.5} />
                  <circle cx={ob.x + ww / 2} cy={GROUND_Y - wh - 8} r={ww / 2 - 1} fill="#c9b896" />
                  <circle cx={ob.x + ww / 2 - 3} cy={GROUND_Y - wh - 10} r={1.1} fill="#241340" />
                  <circle cx={ob.x + ww / 2 + 3} cy={GROUND_Y - wh - 10} r={1.1} fill="#241340" />
                </g>
              );
            })}

            {/* avatar */}
            <text x={AVATAR_X} y={avatarY} fontSize={26} textAnchor="middle" dominantBaseline="middle" opacity={flashOpacity}>
              {avatarGlyph}
            </text>
          </svg>
          {micMode === "manual" && (
            <button
              onPointerDown={(e) => { e.preventDefault(); manualHeldRef.current = true; }}
              onPointerUp={() => { manualHeldRef.current = false; }}
              onPointerLeave={() => { manualHeldRef.current = false; }}
              onPointerCancel={() => { manualHeldRef.current = false; }}
              style={{
                marginTop: 14, padding: "16px 30px", borderRadius: 14, fontSize: 15, fontWeight: 900,
                textTransform: "uppercase", letterSpacing: 1, cursor: "pointer", touchAction: "none", userSelect: "none",
                fontFamily: "'Orbitron', 'Segoe UI', sans-serif", background: "linear-gradient(160deg, #ff2d95, #b829ff)",
                color: "#05010f", border: "2px solid #ff8ac2", width: "100%", maxWidth: W,
              }}
            >
              🗣️ Hold to Scream
            </button>
          )}
        </>
      )}
    </Card>
  );
}
