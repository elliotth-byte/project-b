import { useState, useEffect, useRef, useCallback } from "react";
import {
  subscribeSimonTv, beginInputPhase, resolveSimonRound, simonStepMs, simonInputWindowMs,
  SIMON_FLASH_MS, SIMON_GAP_MS,
} from "../../lib/games/simonTvData";

// Exact same 4 pads (color + pitch) as components/games/SimonPlayer.jsx
// — kept in sync on purpose so the TV looks and sounds like the same
// game a player already knows, just shared now.
const PADS = [
  { color: "#ff2d95", freq: 329.63 },
  { color: "#00d9ff", freq: 392.00 },
  { color: "#ffd700", freq: 261.63 },
  { color: "#00ff9d", freq: 440.00 },
];

// ─── Big Screen: Simon ───
// See lib/games/simonTvData.js for the full mechanic. This is the
// shared sequence itself — the only place it ever gets shown, since a
// phone showing it too would let a player just watch their own screen
// instead of the room's shared TV, quietly defeating the "everyone
// watches together" premise the whole variant is built around (see
// components/games/SimonTvPlayer.jsx's own comment for the phone
// side's matching reasoning).
export default function SimonTvDisplay({ gameId, round, players, settings }) {
  const [state, setState] = useState(null);
  const [activePad, setActivePad] = useState(null);
  const audioCtxRef = useRef(null);
  const timeoutsRef = useRef([]);
  const playedForRoundRef = useRef(null); // which roundNum's playback has already been kicked off, so a re-render mid-playback doesn't restart it

  useEffect(() => subscribeSimonTv(gameId, round.round, setState), [gameId, round.round]);

  useEffect(() => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx && !audioCtxRef.current) audioCtxRef.current = new AudioCtx();
    } catch (e) { /* no Web Audio support — playback stays silent, visuals still work */ }
    return () => { audioCtxRef.current?.close?.(); timeoutsRef.current.forEach((t) => window.clearTimeout(t)); };
  }, []);

  const playTone = (freq, durationMs) => {
    try {
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      if (ctx.state === "suspended") ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + durationMs / 1000);
    } catch (e) { /* non-critical */ }
  };

  const runPlayback = useCallback((sequence) => {
    timeoutsRef.current.forEach((t) => window.clearTimeout(t));
    timeoutsRef.current = [];
    const stepMs = simonStepMs(sequence.length);
    const flashMs = Math.round(stepMs * (SIMON_FLASH_MS / (SIMON_FLASH_MS + SIMON_GAP_MS)));
    sequence.forEach((padIdx, i) => {
      const t1 = window.setTimeout(() => { setActivePad(padIdx); playTone(PADS[padIdx].freq, flashMs); }, i * stepMs);
      const t2 = window.setTimeout(() => setActivePad(null), i * stepMs + flashMs);
      timeoutsRef.current.push(t1, t2);
    });
    const doneT = window.setTimeout(() => beginInputPhase(gameId, round.round), sequence.length * stepMs + 300);
    timeoutsRef.current.push(doneT);
  }, [gameId, round.round]);

  useEffect(() => {
    if (state?.phase === "playback" && playedForRoundRef.current !== state.roundNum) {
      playedForRoundRef.current = state.roundNum;
      runPlayback(state.sequence);
    }
  }, [state?.phase, state?.roundNum, state?.sequence, runPlayback]);

  // Drives round resolution from the TV itself, on a 1s poll while
  // input is open — see resolveSimonRound's own comment: this is
  // mirrored server-side too (lib/roundEngine.js's housekeeping), same
  // belt-and-suspenders pattern the rest of this app already uses, so
  // nothing actually depends on the TV page staying open for the game
  // to keep moving — this just makes it feel instant when it is.
  useEffect(() => {
    if (state?.phase !== "input") return;
    const id = setInterval(() => resolveSimonRound(gameId, round.round, settings), 1000);
    return () => clearInterval(id);
  }, [state?.phase, gameId, round.round, settings]);

  if (!state) return <div style={{ textAlign: "center", color: "#6b4f99", padding: 60 }}>Loading...</div>;

  const byId = {};
  (players || []).forEach((p) => (byId[p.id] = p.display_name));
  const alivePlayers = Object.entries(state.playerProgress).filter(([, p]) => p.alive);
  const resolvedCount = alivePlayers.filter(([, p]) => p.thisRoundStatus !== "playing").length;

  return (
    <div style={{ padding: 40, display: "flex", flexDirection: "column", alignItems: "center", minHeight: "70vh" }}>
      <div style={{ fontSize: 14, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 3, marginBottom: 6 }}>
        🔴 Simon — Round {state.roundNum}
      </div>
      <div style={{ fontSize: 13, color: "#a68fd6", marginBottom: 24 }}>
        {state.phase === "playback" ? "Watch the sequence..." : `Repeat it on your phone — ${resolvedCount}/${alivePlayers.length} in`}
      </div>
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(2, 180px)", gridTemplateRows: "repeat(2, 180px)", gap: 12,
        marginBottom: 32,
      }}>
        {PADS.map((pad, i) => {
          const outerRadius = 90;
          const cornerRadius = [i === 0 ? outerRadius : 8, i === 1 ? outerRadius : 8, i === 3 ? outerRadius : 8, i === 2 ? outerRadius : 8].join("px ") + "px";
          return (
            <div key={i} style={{
              width: 180, height: 180, borderRadius: cornerRadius,
              background: activePad === i ? `radial-gradient(circle at 50% 50%, ${pad.color}, ${pad.color}cc)` : `radial-gradient(circle at 50% 50%, ${pad.color}33, ${pad.color}11)`,
              border: `3px solid ${pad.color}`,
              boxShadow: activePad === i ? `0 0 40px ${pad.color}` : "none",
              transition: "background 0.08s, box-shadow 0.08s",
            }} />
          );
        })}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center", maxWidth: 800 }}>
        {Object.entries(state.playerProgress).map(([id, p]) => (
          <div key={id} style={{
            fontSize: 13, padding: "6px 14px", borderRadius: 8,
            background: !p.alive ? "#0d0618" : p.thisRoundStatus === "correct" ? "rgba(0,255,157,0.15)" : p.thisRoundStatus === "wrong" ? "rgba(255,56,96,0.15)" : "#150a28",
            border: `1px solid ${!p.alive ? "#3d1f5c" : p.thisRoundStatus === "correct" ? "#00ff9d" : p.thisRoundStatus === "wrong" ? "#ff3860" : "#ff2d95"}`,
            color: !p.alive ? "#6b4f99" : "#f5f0ff", textDecoration: !p.alive ? "line-through" : "none",
          }}>
            {byId[id] || "?"}
          </div>
        ))}
      </div>
    </div>
  );
}
