import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import * as Tone from "tone";
import { MOODS, buildEngine, STORAGE_KEY_MUSIC_MOOD } from "../lib/musicEngine";
import { storageSet, subscribeGameState } from "../lib/gameStorage";
import { Card } from "./ui";

// ─── The Radio ───
// Each person's browser generates and plays its own audio locally (nothing
// is streamed) — only the *choice of station* is synced, so everyone's
// radio matches. Uses a realtime subscription for station changes instead
// of polling.
//
// For the HOST specifically, the picker/controls live in the Admin tab
// instead of a floating widget — but this component still mounts once,
// persistently, at the top of pages/host.jsx (not inside the Admin tab's
// own conditionally-rendered tree), so the actual audio engine keeps
// running when the host switches to a different tab. `portalTarget` is a
// DOM node inside the Admin tab's content (see components/AdminHost.jsx)
// that the controls get teleported into via a React portal while it
// exists; with no portalTarget (any other tab), nothing renders at all —
// the radio just keeps playing quietly in the background. Players (not
// the host) are unaffected — they keep the original floating widget,
// since they don't have an Admin tab to put it in.
export default function MusicPlayer({ gameId, isHost = false, portalTarget = null }) {
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(0.4);
  const [mood, setMood] = useState("dark");
  const [showControls, setShowControls] = useState(false);
  const [audioError, setAudioError] = useState(null);
  const engineRef = useRef(null);

  // Players (not the host) follow whatever mood the host has broadcast
  useEffect(() => {
    if (isHost || !gameId) return;
    const unsubscribe = subscribeGameState(gameId, STORAGE_KEY_MUSIC_MOOD, (value) => {
      if (value && value !== mood) setMood(value);
    });
    return unsubscribe;
  }, [isHost, gameId, mood]);

  const disposeEngine = () => {
    Tone.getTransport().stop();
    Tone.getTransport().cancel();
    if (engineRef.current) {
      engineRef.current.loops.forEach((l) => { try { l.dispose(); } catch {} });
      engineRef.current.nodes.forEach((n) => { try { n.dispose(); } catch {} });
      engineRef.current = null;
    }
  };

  // Errors here used to be silent — the ▶ button would flip to "playing"
  // regardless of whether the browser's AudioContext actually unlocked,
  // so a failure looked identical to "it's playing, just quiet." Now any
  // failure to actually start is surfaced instead of assumed away.
  const startMusic = async (selectedMood) => {
    try {
      setAudioError(null);
      await Tone.start();
      if (Tone.getContext().state !== "running") {
        throw new Error("Your browser blocked audio from starting — try the ▶ button again.");
      }
      disposeEngine();
      engineRef.current = buildEngine(selectedMood || mood);
      engineRef.current.masterVol.volume.value = -30 + volume * 30;
      Tone.getTransport().start();
      setPlaying(true);
    } catch (err) {
      disposeEngine();
      setPlaying(false);
      setAudioError(err?.message || "Couldn't start audio — try the ▶ button again.");
    }
  };

  const stopMusic = () => {
    Tone.getTransport().pause();
    setPlaying(false);
  };

  const changeMood = async (newMood) => {
    setMood(newMood);
    if (isHost && gameId) {
      await storageSet(gameId, STORAGE_KEY_MUSIC_MOOD, newMood);
    }
    if (playing) startMusic(newMood);
  };

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.masterVol.volume.value = -30 + volume * 30;
    }
  }, [volume]);

  useEffect(() => () => disposeEngine(), []);

  // If a player's mood changed via the realtime subscription above, restart
  // playback with the new mood (only matters if they're already playing).
  const prevMoodRef = useRef(mood);
  useEffect(() => {
    if (!isHost && mood !== prevMoodRef.current && playing) {
      startMusic(mood);
    }
    prevMoodRef.current = mood;
  }, [mood]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentMood = MOODS.find((m) => m.id === mood) || MOODS[0];

  const playButton = (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => { if (!playing) startMusic(); else stopMusic(); }}
        style={{
          width: 44, height: 44, borderRadius: "50%",
          background: playing ? "linear-gradient(135deg, #ff2d95, #b829ff)" : "linear-gradient(135deg, #1a0a2e, #1a0a2e)",
          border: `1px solid ${playing ? "#ff2d95" : "#3d1f5c"}`,
          color: playing ? "#05010f" : "#6b4f99", fontSize: 18, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: playing ? "0 0 20px rgba(255,45,149,0.3)" : "0 4px 16px rgba(0,0,0,0.4)",
          transition: "all 0.3s", flexShrink: 0,
        }}
        title={audioError || "Play/pause radio"}
      >
        {playing ? "♫" : "♪"}
      </button>
      {audioError && !showControls && (
        <span
          onClick={() => setShowControls(true)}
          title={audioError}
          style={{
            position: "absolute", top: -2, right: -2, width: 14, height: 14, borderRadius: "50%",
            background: "#ff3860", border: "2px solid #05010f", cursor: "pointer",
          }}
        />
      )}
    </div>
  );

  const volumeSlider = (
    <>
      <input
        type="range" min="0" max="1" step="0.05" value={volume}
        onChange={(e) => setVolume(parseFloat(e.target.value))}
        style={{ width: "100%", accentColor: "#ff2d95" }}
      />
      <div style={{ fontSize: 10, color: "#6b4f99", textAlign: "center", marginTop: 4 }}>
        {Math.round(volume * 100)}%
      </div>
      {audioError && (
        <div style={{ fontSize: 11, color: "#ff3860", marginTop: 8, textAlign: "center" }}>⚠ {audioError}</div>
      )}
    </>
  );

  const stationPicker = isHost ? (
    <div style={{ display: "grid", gap: 4, marginBottom: 10 }}>
      {MOODS.map((m) => (
        <button
          key={m.id}
          onClick={() => changeMood(m.id)}
          style={{
            background: mood === m.id ? "rgba(255,45,149,0.15)" : "#0d0618",
            border: `1px solid ${mood === m.id ? "#ff2d95" : "#3d1f5c"}`,
            borderRadius: 8, padding: "6px 10px", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 8, transition: "all 0.15s",
          }}
        >
          <span style={{ fontSize: 14 }}>{m.icon}</span>
          <span style={{ fontSize: 11, color: mood === m.id ? "#ff2d95" : "#a68fd6", fontWeight: mood === m.id ? 700 : 400 }}>
            {m.label}
          </span>
        </button>
      ))}
    </div>
  ) : (
    <div style={{ fontSize: 12, color: "#a68fd6", marginBottom: 10 }}>
      {currentMood.icon} {currentMood.label}
    </div>
  );

  // ─── Host: portal the controls into the Admin tab, nothing floating ───
  if (isHost) {
    if (!portalTarget) return null;
    return createPortal(
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>📻 Radio</h3>
          {playButton}
        </div>
        <p style={{ fontSize: 11, color: "#6b4f99", margin: "0 0 10px", fontStyle: "italic" }}>
          Everyone's browser generates this locally — picking a station here just broadcasts the choice, nothing is streamed.
          Keeps playing on your end if you switch to another tab.
        </p>
        {stationPicker}
        {volumeSlider}
      </Card>,
      portalTarget
    );
  }

  // ─── Player: original floating widget, unchanged ───
  return (
    <div style={{ position: "fixed", bottom: 20, right: 20, zIndex: 1000 }}>
      {showControls && (
        <div style={{
          background: "#1a0a2e", border: "1px solid #3d1f5c", borderRadius: 12,
          padding: "14px 16px", marginBottom: 8, minWidth: 200,
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        }}>
          <div style={{ fontSize: 11, color: "#ff2d95", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
            📻 Radio
          </div>
          {stationPicker}
          {volumeSlider}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
        {showControls && (
          <button onClick={() => setShowControls(false)} style={{ background: "none", border: "none", color: "#6b4f99", fontSize: 11, cursor: "pointer" }}>✕</button>
        )}
        {playButton}
        {!showControls && (
          <button
            onClick={() => setShowControls(true)}
            style={{
              width: 28, height: 28, borderRadius: "50%", background: "#1a0a2e", border: "1px solid #3d1f5c",
              color: "#6b4f99", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            }}
            title="Music settings"
          >⚙</button>
        )}
      </div>
    </div>
  );
}
