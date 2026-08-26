import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import * as Tone from "tone";
import { PHASE_TRACKS, TRACKS, buildEngine } from "../lib/musicEngine";
import { subscribeRound } from "../lib/gameState";
import { Card, Badge } from "./ui";

// ─── Phase Music ───
// Previously "the radio" — four player-chosen stations, broadcast by the
// host and kept in sync across everyone via game_state (see this file's
// prior git history). Now fully automatic: the track is a pure function
// of the current round.phase (lib/musicEngine.js's own PHASE_TRACKS map),
// which is ALREADY synced for every client via subscribeRound — the same
// mechanism the rest of this app already relies on for phase changes —
// so there's nothing left to broadcast or coordinate. Nobody picks
// anything anymore; host and player get the identical experience and
// the identical controls (just play/pause and volume), which is why this
// component no longer branches meaningfully on isHost at all.
//
// Still mounted persistently outside the tab-switching part of the page
// (see pages/play.jsx and pages/host.jsx) so the audio engine keeps
// running when someone navigates to a different tab — the visible
// controls get teleported into wherever `portalTarget` currently points
// (the Help tab for players, the Admin tab for hosts) via a React
// portal; with no portalTarget mounted (any other tab), nothing renders
// but the music keeps playing quietly underneath.
export default function MusicPlayer({ gameId, isHost = false, portalTarget = null }) {
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(0.4);
  const [phase, setPhase] = useState(null);
  const [audioError, setAudioError] = useState(null);
  const engineRef = useRef(null);

  useEffect(() => {
    if (!gameId) return;
    const unsubscribe = subscribeRound(gameId, (round) => setPhase(round?.phase || null));
    return unsubscribe;
  }, [gameId]);

  const track = PHASE_TRACKS[phase] || "lobby";

  const disposeEngine = () => {
    Tone.getTransport().stop();
    Tone.getTransport().cancel();
    if (engineRef.current) {
      engineRef.current.loops.forEach((l) => { try { l.dispose(); } catch {} });
      engineRef.current.nodes.forEach((n) => { try { n.dispose(); } catch {} });
      engineRef.current = null;
    }
  };

  // Errors here are surfaced rather than assumed away — a failed
  // AudioContext unlock used to look identical to "it's playing, just
  // quiet."
  const startMusic = async (selectedTrack) => {
    try {
      setAudioError(null);
      await Tone.start();
      if (Tone.getContext().state !== "running") {
        throw new Error("Your browser blocked audio from starting — try the ▶ button again.");
      }
      disposeEngine();
      engineRef.current = buildEngine(selectedTrack || track);
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

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.masterVol.volume.value = -30 + volume * 30;
    }
  }, [volume]);

  useEffect(() => () => disposeEngine(), []);

  // The phase (and therefore the track) can change out from under a
  // client that's already playing — swap the engine over to the new
  // track automatically rather than leaving the old phase's music
  // playing into the next phase.
  const prevTrackRef = useRef(track);
  useEffect(() => {
    if (track !== prevTrackRef.current && playing) {
      startMusic(track);
    }
    prevTrackRef.current = track;
  }, [track]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!portalTarget) return null;

  const currentTrack = TRACKS.find((t) => t.id === track) || TRACKS[0];

  return createPortal(
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🎵 Music</h3>
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
          title={audioError || "Play/pause music"}
        >
          {playing ? "♫" : "♪"}
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Badge>{currentTrack.icon} {currentTrack.label}</Badge>
        <span style={{ fontSize: 11, color: "#6b4f99", fontStyle: "italic" }}>follows the current phase automatically</span>
      </div>

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
      <p style={{ fontSize: 11, color: "#6b4f99", margin: "10px 0 0", fontStyle: "italic" }}>
        Generated locally in your own browser — nothing is streamed. Keeps playing if you switch to another tab.
      </p>
    </Card>,
    portalTarget
  );
}
