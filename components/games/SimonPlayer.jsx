import { useState, useEffect, useRef, useCallback } from "react";
import { Card, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { reportScore } from "../../lib/challengeScores";

// 4 quadrants, each a distinct color + distinct pitch — the pitch means
// the sequence is genuinely learnable by ear too, not just by color,
// which matters for anyone playing with colorblind mode on (see
// lib/gamePrefs.js) since the color differences alone wouldn't be enough.
const PADS = [
  { color: "#ff2d95", freq: 329.63 }, // top-left, E4
  { color: "#00d9ff", freq: 392.00 }, // top-right, G4
  { color: "#ffd700", freq: 261.63 }, // bottom-left, C4
  { color: "#00ff9d", freq: 440.00 }, // bottom-right, A4
];
const FLASH_MS = 400;
const GAP_MS = 200;
const FLASH_RATIO = FLASH_MS / (FLASH_MS + GAP_MS); // kept constant as the pace speeds up, so flash duration always stays a fixed fraction of the step — see the note in playbackSequence for why that matters
const MIN_STEP_MS = 220; // playback never gets faster than this, however long the sequence gets — stays comfortably tappable even at its fastest

// One shared AudioContext, created once at Start (a genuine tap
// gesture — see startGame) and reused for every tone, rather than a
// fresh `new AudioContext()` per tone the way this used to work. That
// was the actual cause of a real "no sound at all" report: iOS Safari
// requires an AudioContext to be created (or explicitly resumed)
// within a direct user gesture to ever actually produce sound — a
// context created later from inside a setTimeout callback (which is
// exactly how playbackSequence fires its tones) isn't one, so Safari
// silently left it suspended. The JS never threw, the game looked and
// ran completely normally, it just never made a sound. One context,
// unlocked once by the real tap on Start, sidesteps this: resuming an
// already-unlocked context from a timer callback works fine — it's
// only creating a brand new one outside a gesture that Safari blocks.
function playTone(audioCtxRef, freq, durationMs) {
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
  } catch (e) {
    // Audio isn't critical to the game — a browser blocking autoplay
    // audio (common before any user gesture) should never break the
    // visual gameplay, just silently play without sound this round.
  }
}

export default function SimonPlayer({ gameId, round, challenge, player }) {
  const [sequence, setSequence] = useState([]);
  const [playerStep, setPlayerStep] = useState(0); // how far through the sequence the player has correctly repeated
  const [phase, setPhase] = useState("ready"); // "ready" | "playback" | "input" | "over"
  const [activePad, setActivePad] = useState(null); // which pad is lit right now (playback or player feedback)
  const [wrongFlash, setWrongFlash] = useState(false);
  const [round_, setRound] = useState(0); // completed rounds = score
  const reportedRef = useRef(false);
  const timeoutsRef = useRef([]);
  const audioCtxRef = useRef(null);

  const clearTimeouts = () => { timeoutsRef.current.forEach((t) => window.clearTimeout(t)); timeoutsRef.current = []; };
  useEffect(() => () => clearTimeouts(), []);
  // Closes the shared AudioContext when this component unmounts (round
  // ends, player navigates away mid-game) — not left dangling.
  useEffect(() => () => { audioCtxRef.current?.close?.(); }, []);

  const startGame = () => {
    // Created here specifically because this handler runs directly
    // inside a real tap on the Start button — see playTone's own
    // comment on why that's what actually unlocks audio on iOS Safari,
    // where creating it later (inside a setTimeout) would not.
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx && !audioCtxRef.current) audioCtxRef.current = new AudioCtx();
    } catch (e) {
      // no Web Audio support — playTone already no-ops gracefully when audioCtxRef.current is null
    }
    setSequence([Math.floor(Math.random() * 4)]);
    setPlayerStep(0);
    setRound(0);
    setPhase("playback");
  };

  const playbackSequence = useCallback((seq) => {
    clearTimeouts();
    // Speeds up noticeably as the sequence grows — down to 40% of the
    // starting pace by round ~13, then holds there. flashMs is always
    // derived as a fixed FRACTION of stepMs (not shrunk independently),
    // which is what guarantees flashMs < stepMs at every speed: the old
    // version used a fixed 400ms flash even as the step shrank past it,
    // so at higher rounds a pad's "turn off" timer could fire AFTER the
    // next pad had already started lighting up — turning that next
    // flash off early, since it just blanks activePad unconditionally
    // rather than checking which pad it was for.
    const speedFactor = Math.max(0.4, 1 - (seq.length - 1) * 0.045);
    const stepMs = Math.max(MIN_STEP_MS, Math.round((FLASH_MS + GAP_MS) * speedFactor));
    const flashMs = Math.round(stepMs * FLASH_RATIO);
    seq.forEach((padIdx, i) => {
      const t1 = window.setTimeout(() => {
        setActivePad(padIdx);
        playTone(audioCtxRef, PADS[padIdx].freq, flashMs);
      }, i * stepMs);
      const t2 = window.setTimeout(() => setActivePad(null), i * stepMs + flashMs);
      timeoutsRef.current.push(t1, t2);
    });
    const doneT = window.setTimeout(() => setPhase("input"), seq.length * stepMs + 200);
    timeoutsRef.current.push(doneT);
  }, []);

  useEffect(() => {
    if (phase === "playback" && sequence.length > 0) playbackSequence(sequence);
  }, [phase, sequence, playbackSequence]);

  const tapPad = (padIdx) => {
    if (phase !== "input") return;
    setActivePad(padIdx);
    playTone(audioCtxRef, PADS[padIdx].freq, 200);
    window.setTimeout(() => setActivePad(null), 200);

    if (padIdx === sequence[playerStep]) {
      const nextStep = playerStep + 1;
      if (nextStep === sequence.length) {
        // Round complete — grow the sequence and play it back again.
        // phase moves to "betweenRounds" IMMEDIATELY here, not
        // "playback" (that only happens once `sequence` itself has
        // actually been grown, in the timeout below) and not left as
        // "input" for these 500ms either — leaving it as "input" was
        // the actual bug: tapPad's own guard only blocks a tap when
        // phase !== "input", so an eager extra tap landing in this gap
        // (very natural right after successfully finishing a round)
        // got evaluated against the OLD, already-completed sequence
        // with playerStep freshly reset to 0 — almost certain to read
        // as wrong and wrongly end the game, exactly matching a real
        // report of the game ending mid-round for no visible reason.
        const completedRound = sequence.length;
        setRound(completedRound);
        const grown = [...sequence, Math.floor(Math.random() * 4)];
        setPlayerStep(0);
        setPhase("betweenRounds");
        window.setTimeout(() => { setSequence(grown); setPhase("playback"); }, 500);
      } else {
        setPlayerStep(nextStep);
      }
    } else {
      // Wrong pad — game over, score is however many full rounds they
      // actually completed (not counting the one they just broke).
      setWrongFlash(true);
      window.setTimeout(() => setWrongFlash(false), 400);
      setPhase("over");
    }
  };

  useEffect(() => {
    if (phase === "over" && !reportedRef.current) {
      reportedRef.current = true;
      reportScore(gameId, round.round, player.id, player.name, round_, { final: true });
    }
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  if (phase === "over") {
    return <GameResultCard icon="🔴" title="Sequence Broken" valueLabel={`${round_} round${round_ === 1 ? "" : "s"} completed`} />;
  }

  if (phase === "ready") {
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <h3 style={{ color: "#ff2d95", margin: "0 0 8px", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🔴 Simon</h3>
        <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 10px" }}>Watch the sequence, then repeat it. Each round adds one more step — how far can you go?</p>
        <p style={{ color: "#ff3860", fontSize: 12, fontWeight: 700, margin: "0 0 14px" }}>
          🔊 This uses sound — if your phone is in silent mode, you won't hear it.
        </p>
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🔴 Simon</h3>
        <Badge>{phase === "playback" ? "Watch..." : phase === "betweenRounds" ? "Nice!" : "Your turn"} · Round {round_ + 1}</Badge>
      </div>
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(2, 90px)", gridTemplateRows: "repeat(2, 90px)", gap: 6,
        margin: "0 auto", width: "fit-content", border: wrongFlash ? "3px solid #ff3860" : "3px solid transparent", borderRadius: 16, padding: 4,
        transition: "border-color 0.1s",
      }}>
        {PADS.map((pad, i) => {
          // Only the OUTER corner of each quadrant is rounded (the
          // other three stay square) — with the small gap between pads
          // already in the grid, that reads as one circular disc split
          // into 4 quadrants, the classic Simon look, rather than 4
          // independent rounded squares.
          const outerRadius = 45;
          const cornerRadius = [
            i === 0 ? outerRadius : 4, i === 1 ? outerRadius : 4,
            i === 3 ? outerRadius : 4, i === 2 ? outerRadius : 4,
          ].join("px ") + "px";
          return (
            <button
              key={i}
              onClick={() => tapPad(i)}
              disabled={phase !== "input"}
              style={{
                width: 90, height: 90, borderRadius: cornerRadius, cursor: phase === "input" ? "pointer" : "default",
                background: activePad === i
                  ? `radial-gradient(circle at 50% 50%, ${pad.color}, ${pad.color}cc)`
                  : `radial-gradient(circle at 50% 50%, ${pad.color}33, ${pad.color}11)`,
                border: `2px solid ${pad.color}`,
                boxShadow: activePad === i ? `0 0 20px ${pad.color}` : "none",
                transition: "background 0.08s, box-shadow 0.08s",
              }}
            />
          );
        })}
      </div>
      <p style={{ color: "#6b4f99", fontSize: 11, marginTop: 10, fontStyle: "italic" }}>
        {phase === "playback" ? "Memorize the sequence..." : phase === "betweenRounds" ? "Get ready for the next round..." : `Tap ${sequence.length - playerStep} more to finish this round.`}
      </p>
    </Card>
  );
}
