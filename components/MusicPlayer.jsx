import { useState, useEffect, useRef } from "react";
import * as Tone from "tone";
import { MOODS, buildEngine, STORAGE_KEY_MUSIC_MOOD } from "../lib/musicEngine";
import { storageSet, subscribeGameState } from "../lib/gameStorage";

// ─── Ambient Music Player ───
// Each person's browser generates and plays its own audio locally (nothing
// is streamed) — only the *choice of mood* is synced, so everyone's ambient
// music matches. The original polled shared storage every 5s for mood
// changes; this uses a realtime subscription instead, same as everything
// else in this project.
export default function MusicPlayer({ gameId, isHost = false }) {
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(0.4);
  const [mood, setMood] = useState("dark");
  const [showControls, setShowControls] = useState(false);
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

  const startMusic = async (selectedMood) => {
    await Tone.start();
    disposeEngine();
    engineRef.current = buildEngine(selectedMood || mood);
    engineRef.current.masterVol.volume.value = -30 + volume * 30;
    Tone.getTransport().start();
    setPlaying(true);
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

  return (
    <div style={{ position: "fixed", bottom: 20, right: 20, zIndex: 1000 }}>
      {showControls && (
        <div style={{
          background: "#132038", border: "1px solid #253550", borderRadius: 12,
          padding: "14px 16px", marginBottom: 8, minWidth: 200,
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        }}>
          <div style={{ fontSize: 11, color: "#c9a84c", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
            Ambience
          </div>
          {isHost ? (
            <div style={{ display: "grid", gap: 4, marginBottom: 10 }}>
              {MOODS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => changeMood(m.id)}
                  style={{
                    background: mood === m.id ? "rgba(201,168,76,0.15)" : "#0a1020",
                    border: `1px solid ${mood === m.id ? "#c9a84c" : "#253550"}`,
                    borderRadius: 8, padding: "6px 10px", cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 8, transition: "all 0.15s",
                  }}
                >
                  <span style={{ fontSize: 14 }}>{m.icon}</span>
                  <span style={{ fontSize: 11, color: mood === m.id ? "#c9a84c" : "#a09080", fontWeight: mood === m.id ? 700 : 400 }}>
                    {m.label}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "#a09080", marginBottom: 10 }}>
              {currentMood.icon} {currentMood.label}
            </div>
          )}
          <input
            type="range" min="0" max="1" step="0.05" value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            style={{ width: "100%", accentColor: "#c9a84c" }}
          />
          <div style={{ fontSize: 10, color: "#706050", textAlign: "center", marginTop: 4 }}>
            {Math.round(volume * 100)}%
          </div>
        </div>
      )}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
        {showControls && (
          <button onClick={() => setShowControls(false)} style={{ background: "none", border: "none", color: "#706050", fontSize: 11, cursor: "pointer" }}>✕</button>
        )}
        <button
          onClick={() => { if (!playing) startMusic(); else stopMusic(); }}
          style={{
            width: 44, height: 44, borderRadius: "50%",
            background: playing ? "linear-gradient(135deg, #c9a84c, #b8943e)" : "linear-gradient(135deg, #132038, #1a2845)",
            border: `1px solid ${playing ? "#c9a84c" : "#253550"}`,
            color: playing ? "#0c1425" : "#706050", fontSize: 18, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: playing ? "0 0 20px rgba(201,168,76,0.3)" : "0 4px 16px rgba(0,0,0,0.4)",
            transition: "all 0.3s",
          }}
          title="Play/pause ambient music"
        >
          {playing ? "♫" : "♪"}
        </button>
        {!showControls && (
          <button
            onClick={() => setShowControls(true)}
            style={{
              width: 28, height: 28, borderRadius: "50%", background: "#132038", border: "1px solid #253550",
              color: "#706050", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            }}
            title="Music settings"
          >⚙</button>
        )}
      </div>
    </div>
  );
}
