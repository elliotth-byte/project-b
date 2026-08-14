import { useState, useEffect, useRef, useCallback } from "react";
import { Card, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { reportScore } from "../../lib/challengeScores";
import { generateRhythm, scoreRhythmAttempt } from "../../lib/games/metronomeData";

const PLAYBACKS = 3;
const BEAT_TONE_MS = 120;
const PAUSE_BETWEEN_PLAYS_MS = 900;
const INPUT_BUFFER_MS = 2500; // extra time given beyond the rhythm's own length, to actually finish tapping

function playBeep() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 440;
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + BEAT_TONE_MS / 1000);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + BEAT_TONE_MS / 1000);
    osc.onended = () => ctx.close();
  } catch (e) {
    // Audio isn't critical — a browser blocking autoplay audio before any
    // user gesture should never break the visual/timing gameplay, just
    // play silently this round.
  }
}

export default function MetronomePlayer({ gameId, round, challenge, player }) {
  const seed = challenge?.startedAt || 1; // same rhythm for every player — see lib/games/metronomeData.js for why
  const [rhythm] = useState(() => generateRhythm(seed, 7));
  const rhythmDuration = rhythm[rhythm.length - 1];

  const [phase, setPhase] = useState("ready"); // "ready" | "playback" | "input" | "done"
  const [playbackNum, setPlaybackNum] = useState(0); // 1, 2, 3 during playback
  const [pulse, setPulse] = useState(false);
  const [taps, setTaps] = useState([]);
  const [result, setResult] = useState(null);
  const inputStartRef = useRef(null);
  const timeoutsRef = useRef([]);
  const reportedRef = useRef(false);

  const clearTimeouts = () => { timeoutsRef.current.forEach((t) => window.clearTimeout(t)); timeoutsRef.current = []; };
  useEffect(() => () => clearTimeouts(), []);

  const schedulePlayback = useCallback((playNum) => {
    setPlaybackNum(playNum);
    rhythm.forEach((offset) => {
      const t1 = window.setTimeout(() => { setPulse(true); playBeep(); }, offset);
      const t2 = window.setTimeout(() => setPulse(false), offset + BEAT_TONE_MS);
      timeoutsRef.current.push(t1, t2);
    });
    const nextT = window.setTimeout(() => {
      if (playNum < PLAYBACKS) {
        schedulePlayback(playNum + 1);
      } else {
        setPhase("input");
      }
    }, rhythmDuration + BEAT_TONE_MS + PAUSE_BETWEEN_PLAYS_MS);
    timeoutsRef.current.push(nextT);
  }, [rhythm, rhythmDuration]);

  const start = () => {
    clearTimeouts();
    setTaps([]);
    setPhase("playback");
    schedulePlayback(1);
  };

  useEffect(() => {
    if (phase !== "input") return;
    inputStartRef.current = Date.now();
    clearTimeouts();
    const endT = window.setTimeout(() => finishInput(), rhythmDuration + INPUT_BUFFER_MS);
    timeoutsRef.current.push(endT);
    return () => window.clearTimeout(endT);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const tap = () => {
    if (phase !== "input" || !inputStartRef.current) return;
    setTaps((prev) => [...prev, Date.now() - inputStartRef.current]);
  };

  const finishInput = useCallback(() => {
    setPhase((current) => {
      if (current !== "input") return current;
      return "done";
    });
  }, []);

  useEffect(() => {
    if (phase === "done" && !result) {
      setTaps((currentTaps) => {
        const scored = scoreRhythmAttempt(rhythm, currentTaps);
        setResult(scored);
        return currentTaps;
      });
    }
  }, [phase, result, rhythm]);

  useEffect(() => {
    if (result && !reportedRef.current) {
      reportedRef.current = true;
      reportScore(gameId, round.round, player.id, player.name, result.score, { final: true });
    }
  }, [result]); // eslint-disable-line react-hooks/exhaustive-deps

  if (phase === "done" && result) {
    return <GameResultCard icon="🥁" title="Rhythm Scored" valueLabel={`${result.score} pts — avg off by ${result.avgDeviationMs}ms`} />;
  }

  if (phase === "ready") {
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <h3 style={{ color: "#ff2d95", margin: "0 0 8px", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🥁 Metronome</h3>
        <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 14px" }}>
          You'll hear an odd little rhythm 3 times. Then you tap it back — closer to on-rhythm wins.
        </p>
        <button onClick={start} style={{
          padding: "10px 24px", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 700,
          background: "linear-gradient(135deg, #ff2d95, #b829ff)", border: "none", color: "#05010f",
          fontFamily: "'Orbitron', 'Segoe UI', sans-serif",
        }}>Start</button>
      </Card>
    );
  }

  if (phase === "playback") {
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <h3 style={{ color: "#ff2d95", margin: "0 0 6px", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🥁 Listen...</h3>
        <Badge>Play {playbackNum} of {PLAYBACKS}</Badge>
        <div style={{ margin: "24px auto", width: 100, height: 100, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{
            width: pulse ? 90 : 60, height: pulse ? 90 : 60, borderRadius: "50%",
            background: pulse ? "#ff2d95" : "#3d1f5c", boxShadow: pulse ? "0 0 30px #ff2d95" : "none",
            transition: "all 0.08s ease-out",
          }} />
        </div>
        <p style={{ color: "#6b4f99", fontSize: 11, fontStyle: "italic" }}>Memorize the pattern...</p>
      </Card>
    );
  }

  // phase === "input"
  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <h3 style={{ color: "#ff2d95", margin: "0 0 6px", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🥁 Your Turn</h3>
      <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 14px" }}>Tap the rhythm back — {taps.length} tap{taps.length === 1 ? "" : "s"} so far.</p>
      <button
        onClick={tap}
        style={{
          width: 140, height: 140, borderRadius: "50%", margin: "0 auto 16px", display: "block",
          background: "linear-gradient(135deg, #ff2d95, #b829ff)", border: "none", cursor: "pointer",
          fontSize: 16, fontWeight: 900, color: "#05010f", fontFamily: "'Orbitron', 'Segoe UI', sans-serif",
        }}
      >
        TAP
      </button>
      <button onClick={finishInput} style={{
        padding: "8px 20px", borderRadius: 8, background: "#0d0618", border: "1px solid #3d1f5c",
        color: "#a68fd6", fontSize: 13, cursor: "pointer",
      }}>Done — Submit</button>
    </Card>
  );
}
