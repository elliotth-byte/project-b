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
// cold. Two obstacle types put opposite ends of that same control to
// use:
//   - CHASMS need you to be airborne (mid-jump) when they slide under
//     you. A jump triggers off a SPIKE in volume (not just "loud"), and
//     — same as the original game's "bigger scream, bigger jump" —
//     the world only keeps scrolling out from under you while you're
//     still mid-air AND still screaming, so a jump you don't sustain
//     lands short and drops you in.
//   - HERM STATUES sit square in the path and can't be jumped — the
//     only way past is to go essentially silent before you reach one;
//     hit it above a walking pace and it flattens you.
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
const W = 300, H = 380;
const GROUND_Y = H - 70;
const AVATAR_X = 82;
const AVATAR_R = 13;

const MAX_SPEED_PX_S = 185; // world-scroll speed at full scream
const SPEED_SMOOTH = 0.22; // per-frame lerp toward the target speed — a little inertia so it reads as running, not teleporting
const VOLUME_SMOOTH = 0.35;

const SPIKE_ON = 0.55; // volume level that triggers a jump (edge-triggered)
const SPIKE_OFF = 0.32; // must drop back below this before another jump can arm — stops one long scream from firing a jump every frame
const SAFE_PASS_SPEED = 34; // px/s — a statue only lets you through at or under this scroll speed

const JUMP_DURATION_MS = 620;
const JUMP_HEIGHT_PX = 58;

const STUN_MS = 700;
const RESPAWN_CLEAR_PX = 70; // obstacles within this of the avatar get cleared on respawn so a life loss can't chain into another instantly

const SCORE_PER_PX = 0.06; // continuous distance score — only accrues while actually moving
const OBSTACLE_CLEAR_BONUS = 12;

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp01(v) { return Math.max(0, Math.min(1, v)); }

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
  const isWall = Math.random() < 0.4;
  return isWall
    ? { x: prevX + spacing, type: "wall", width: 26, passed: false, failed: false }
    : { x: prevX + spacing, type: "gap", width: 58 + difficulty * 46 + Math.random() * 14, passed: false, failed: false };
}

export default function PansPanicPlayer({ gameId, round, challenge, player }) {
  const cfg = challenge?.gameConfig || { lives: 3 };
  const { timeUp } = useCountdown(challenge?.endsAt);

  const canvasRef = useRef(null);
  const stRef = useRef(freshState());
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
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");

    const loop = (now) => {
      if (lastFrameRef.current == null) lastFrameRef.current = now;
      const dt = Math.min(1 / 20, (now - lastFrameRef.current) / 1000);
      lastFrameRef.current = now;

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

      // ── draw ──
      if (ctx) {
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, "#241340");
        grad.addColorStop(0.6, "#4a2a72");
        grad.addColorStop(1, "#b829ff33");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        ctx.fillStyle = "#150a28";
        ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
        ctx.strokeStyle = "#3d1f5c";
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, GROUND_Y); ctx.lineTo(W, GROUND_Y); ctx.stroke();

        for (const ob of st.obstacles) {
          if (ob.type === "gap") {
            ctx.fillStyle = ob.failed ? "#ff385088" : "#05010f";
            ctx.beginPath();
            ctx.moveTo(ob.x, GROUND_Y);
            ctx.lineTo(ob.x + 6, GROUND_Y + 22);
            ctx.lineTo(ob.x + ob.width - 6, GROUND_Y + 22);
            ctx.lineTo(ob.x + ob.width, GROUND_Y);
            ctx.closePath();
            ctx.fill();
          } else {
            const wx = ob.x, ww = ob.width, wh = 46;
            ctx.fillStyle = ob.failed ? "#ff3850" : "#e8dcc8";
            ctx.strokeStyle = "#a68fd6";
            ctx.lineWidth = 1.5;
            ctx.fillRect(wx, GROUND_Y - wh, ww, wh);
            ctx.strokeRect(wx, GROUND_Y - wh, ww, wh);
            ctx.fillStyle = "#c9b896";
            ctx.beginPath(); ctx.arc(wx + ww / 2, GROUND_Y - wh - 8, ww / 2 - 1, 0, Math.PI * 2); ctx.fill();
          }
        }

        const bob = st.jumping ? 0 : Math.sin(now / 90) * 2.5;
        const jumpArc = st.jumping ? Math.sin(Math.PI * Math.min(1, st.jumpElapsed / JUMP_DURATION_MS)) * JUMP_HEIGHT_PX : 0;
        const avatarY = GROUND_Y - AVATAR_R - jumpArc - (st.alive ? Math.max(0, bob) : 0);
        const flash = !st.alive && now < st.stunUntil;

        ctx.font = "26px serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.save();
        if (flash) ctx.globalAlpha = 0.5 + 0.5 * Math.sin(now / 60);
        ctx.fillText(st.alive ? (st.jumping ? "🙀" : st.volumeSmoothed > 0.3 ? "😱" : "🐐") : "💫", AVATAR_X, avatarY);
        ctx.restore();
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
            burst to leap a chasm (keep screaming mid-air or you'll land short), and go dead quiet to slip past a
            herm statue without knocking it flat. No mic, denied permission, or a quiet room — a press-and-hold
            Scream button takes over automatically.
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
          <canvas
            ref={canvasRef} width={W} height={H}
            style={{ width: "100%", maxWidth: W, height: "auto", borderRadius: 10, border: "1px solid #3d1f5c", display: "block", margin: "0 auto" }}
          />
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
