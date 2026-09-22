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
// so there's nothing left to broadcast or coordinate. Host and player
// get the identical phase-driven experience by default.
//
// One host-only exception: a preview control letting the host jump to
// and hear any of the 5 tracks on demand, regardless of the game's
// actual current phase — purely a "what does the finale track sound
// like" convenience. This never reaches players in any way, since
// music is generated locally per-browser (via Tone.js) and never
// broadcast — previewing only changes what plays in the host's own
// browser tab.
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
  // Host-only override: null means "follow the current phase" (the
  // normal behavior for everyone). A track id here means the host has
  // deliberately chosen to preview that track regardless of what phase
  // the game is actually in — this never affects any player, since
  // music is generated locally per-browser and never broadcast; it's
  // purely a "let the host hear what X sounds like right now" tool.
  const [previewTrack, setPreviewTrack] = useState(null);
  const engineRef = useRef(null);

  useEffect(() => {
    if (!gameId) return;
    const unsubscribe = subscribeRound(gameId, (round) => setPhase(round?.phase || null));
    return unsubscribe;
  }, [gameId]);

  const track = PHASE_TRACKS[phase] || "lobby";
  const isPreviewing = isHost && previewTrack != null;
  const effectiveTrack = isPreviewing ? previewTrack : track;

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
      engineRef.current = buildEngine(selectedTrack || effectiveTrack);
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

  // Host-only: jump straight to a specific track and start playing it
  // immediately — previewing is about hearing it right now, not just
  // selecting it and having to separately hit play.
  const previewSpecificTrack = (trackId) => {
    setPreviewTrack(trackId);
    startMusic(trackId);
  };

  // Returns to normal phase-following behavior. If already playing,
  // switches immediately to whatever the CURRENT phase's track
  // actually is, rather than leaving the just-previewed track running
  // under a now-misleading "follows the phase" label.
  const returnToAutoFollow = () => {
    setPreviewTrack(null);
    if (playing) startMusic(track);
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
  // playing into the next phase. Skipped entirely while a host is
  // previewing a specific track on purpose — a phase change shouldn't
  // yank them out of the track they deliberately chose to listen to.
  const prevTrackRef = useRef(effectiveTrack);
  useEffect(() => {
    if (isPreviewing) { prevTrackRef.current = effectiveTrack; return; }
    if (effectiveTrack !== prevTrackRef.current && playing) {
      startMusic(effectiveTrack);
    }
    prevTrackRef.current = effectiveTrack;
  }, [effectiveTrack, isPreviewing]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!portalTarget) return null;

  const currentTrack = TRACKS.find((t) => t.id === effectiveTrack) || TRACKS[0];

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

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <Badge>{currentTrack.icon} {currentTrack.label}</Badge>
        <span style={{ fontSize: 11, color: isPreviewing ? "#ff2d95" : "#6b4f99", fontStyle: "italic" }}>
          {isPreviewing ? "previewing — not the live phase, players hear their own phase's track as normal" : "follows the current phase automatically"}
        </span>
      </div>

      {isHost && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
            Preview any track (host only — nothing this changes is visible to players)
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {TRACKS.map((t) => {
              const active = isPreviewing && previewTrack === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => previewSpecificTrack(t.id)}
                  style={{
                    padding: "5px 10px", borderRadius: 16, cursor: "pointer", fontSize: 11, fontWeight: 700,
                    background: active ? "rgba(255,45,149,0.2)" : "#0d0618",
                    border: `1px solid ${active ? "#ff2d95" : "#3d1f5c"}`,
                    color: active ? "#ff2d95" : "#a68fd6",
                  }}
                >
                  {t.icon} {t.label}
                </button>
              );
            })}
            {isPreviewing && (
              <button
                onClick={returnToAutoFollow}
                style={{ padding: "5px 10px", borderRadius: 16, cursor: "pointer", fontSize: 11, fontWeight: 700, background: "none", border: "1px solid #3d1f5c", color: "#6b4f99" }}
              >
                ↩ Back to Auto
              </button>
            )}
          </div>
        </div>
      )}

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
