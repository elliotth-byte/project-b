import { useEffect, useRef, useState } from "react";
import { Card, Btn } from "./ui";
import {
  isSpotifyConfigured,
  isConnected,
  beginAuth,
  disconnect,
  getAccessToken,
} from "../lib/spotify/auth";
import { publishNowPlaying } from "../lib/stereoTypesNowPlaying";

const SDK_SCRIPT_ID = "spotify-web-playback-sdk";
const SDK_SCRIPT_SRC = "https://sdk.scdn.co/spotify-player.js";

// ─── Stereo Types — the host's own Spotify boombox ───
// Host-only, on purpose: the Web Playback SDK creates exactly one
// "device" per browser tab that's authenticated into it, and Spotify
// Connect then treats that device as one of the account's real
// playback targets — there's no supported way for multiple browser
// tabs (i.e. multiple players) to all drive the SAME device, and
// letting every player run their own independent player would just
// mean N different accounts playing N different things, not one
// shared soundtrack. So: one connection, the host's, same as one
// person's speakers are the actual boombox at a real party — everyone
// else just hears it and watches the room react (StereoTypesCityscape's
// reactive mode, driven by the now-playing broadcast at the bottom of
// this file). This pass intentionally has no search/queue UI — the
// host picks what plays from their own Spotify app or another device;
// this widget only shows what's already playing and offers
// play/pause/skip-next on top of it.
export default function StereoTypesSpotifyWidget({ gameId, onStateChange }) {
  const configured = isSpotifyConfigured();
  const [connected, setConnected] = useState(false);
  const [deviceId, setDeviceId] = useState(null);
  const [playbackState, setPlaybackState] = useState(null);
  const [error, setError] = useState(null);
  const [bpm, setBpm] = useState(null);
  const playerRef = useRef(null);

  useEffect(() => {
    if (configured) setConnected(isConnected());
  }, [configured]);

  // Load the SDK script (once, shared with anything else that might
  // ever need it) and spin up a Spotify.Player as soon as we have a
  // connected host to authenticate it with. Cleans up its own player
  // on unmount/disconnect, but deliberately leaves the <script> tag in
  // place — Spotify's own SDK doesn't support being torn down and
  // re-injected cleanly, and leaving one cached copy of an external,
  // globally-shared SDK script around is harmless.
  useEffect(() => {
    if (!connected) return;
    let cancelled = false;

    function initPlayer() {
      if (cancelled || playerRef.current) return;
      const player = new window.Spotify.Player({
        name: "Stereo Types Boombox",
        getOAuthToken: (cb) => {
          getAccessToken().then((token) => {
            if (token) cb(token);
          });
        },
        volume: 0.8,
      });

      player.addListener("ready", ({ device_id }) => {
        if (!cancelled) setDeviceId(device_id);
      });
      player.addListener("not_ready", () => {
        if (!cancelled) setDeviceId(null);
      });
      player.addListener("player_state_changed", (state) => {
        if (!cancelled) setPlaybackState(state);
      });
      player.addListener("initialization_error", ({ message }) => {
        if (!cancelled) setError(`Spotify couldn't initialize: ${message}`);
      });
      player.addListener("authentication_error", () => {
        if (!cancelled) {
          setError("Spotify sign-in expired — reconnecting.");
          disconnect();
          setConnected(false);
        }
      });
      // Premium-only, by Spotify's own restriction on the Web Playback
      // SDK — a free account gets this event instead of ever reaching
      // "ready". Surfacing it plainly rather than leaving the widget
      // stuck on a silent "Connecting…" forever is the whole point of
      // graceful degradation here.
      player.addListener("account_error", () => {
        if (!cancelled) setError("This Spotify account isn't Premium — in-browser playback control needs Spotify Premium.");
      });
      player.addListener("playback_error", ({ message }) => {
        if (!cancelled) setError(`Spotify playback error: ${message}`);
      });

      player.connect();
      playerRef.current = player;
    }

    if (window.Spotify) {
      initPlayer();
    } else {
      if (!document.getElementById(SDK_SCRIPT_ID)) {
        const script = document.createElement("script");
        script.id = SDK_SCRIPT_ID;
        script.src = SDK_SCRIPT_SRC;
        script.async = true;
        document.body.appendChild(script);
      }
      // The SDK script calls this global exactly once, whenever it
      // finishes loading — if something else on the page also sets it,
      // this would clobber that, but nothing else here does.
      window.onSpotifyWebPlaybackSDKReady = initPlayer;
    }

    return () => {
      cancelled = true;
      if (playerRef.current) {
        playerRef.current.disconnect();
        playerRef.current = null;
      }
    };
  }, [connected]);

  const track = playbackState?.track_window?.current_track || null;
  const trackId = track?.id || null;
  const isPlaying = !!playbackState && !playbackState.paused;

  // Real tempo, attempted best-effort: Spotify's Audio Features
  // endpoint returns the track's actual BPM, which is exactly what
  // "make the scroll speed match the bpm" needs — but that endpoint
  // was locked behind Extended Quota Mode for apps without
  // pre-existing access starting Nov 2024 (the same restriction this
  // widget already flagged for the intensity signal below). Rather
  // than assume this app has that access, this just tries the call and
  // quietly falls back to null on any failure (403 included) — the
  // cityscape already has an intensity-only fallback for exactly that
  // case, so a 403 here degrades gracefully instead of surfacing an
  // error the host can't do anything about. One fetch per distinct
  // track id, not per player_state_changed tick (that event can fire
  // far more often than the track actually changes, e.g. on a seek).
  useEffect(() => {
    if (!trackId) {
      setBpm(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessToken();
        if (!token) return;
        const res = await fetch(`https://api.spotify.com/v1/audio-features/${trackId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          if (!cancelled) setBpm(null);
          return;
        }
        const data = await res.json();
        if (!cancelled) setBpm(typeof data?.tempo === "number" && data.tempo > 0 ? data.tempo : null);
      } catch {
        if (!cancelled) setBpm(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [trackId]);

  const trackName = track?.name || null;
  const artistName = track?.artists?.map((a) => a.name).join(", ") || null;
  const albumArt = track?.album?.images?.[0]?.url || null;

  // isPlaying-only fallback signal for everything BPM doesn't cover
  // (pulse depth/scale always use this; scroll speed only falls back
  // to it when the audio-features fetch above came back null — see
  // that effect's own comment for why it might). Bumped up from the
  // original 0.55 — at that level the (also since-strengthened) pulse
  // in StereoTypesCityscape.jsx still read as too subtle to clearly
  // register as "reacting to music" rather than just ambient drift.
  const intensity = isPlaying ? 0.75 : 0;

  // Broadcast + bubble up to the host's own title screen. The
  // dependency list is the actual fields, not playbackState itself —
  // player_state_changed can fire more often than trackName/isPlaying
  // genuinely change (e.g. a seek within the same track), and this
  // keeps the game_state write (and the parent's re-render) tied to
  // things that actually look different on screen, not every SDK tick.
  useEffect(() => {
    const payload = { isPlaying, intensity, bpm, trackName, artistName, albumArt, updatedAt: Date.now() };
    onStateChange?.(payload);
    if (gameId) publishNowPlaying(gameId, payload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, isPlaying, intensity, bpm, trackName, artistName, albumArt]);

  const togglePlay = () => playerRef.current?.togglePlay();
  const skipNext = () => playerRef.current?.nextTrack();

  const handleDisconnect = () => {
    playerRef.current?.disconnect();
    playerRef.current = null;
    disconnect();
    setConnected(false);
    setDeviceId(null);
    setPlaybackState(null);
    setError(null);
  };

  if (!configured) {
    return (
      <Card style={{ borderColor: "#2a3040" }}>
        <p style={{ color: "#6b6558", fontSize: 12, fontStyle: "italic", margin: 0 }}>
          Spotify isn't set up for this app yet (missing NEXT_PUBLIC_SPOTIFY_CLIENT_ID) — the cityscape will just run its ambient loop without it.
        </p>
      </Card>
    );
  }

  if (!connected) {
    return (
      <Card style={{ borderColor: "#f4c430" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <p style={{ color: "#c9b98a", fontSize: 13, margin: 0, flex: 1, minWidth: 200 }}>
            Connect Spotify to play music through your own account and light up the skyline. Needs Spotify Premium — only you, the host, ever connect; players just see the room react.
          </p>
          <Btn small onClick={() => beginAuth(gameId)}>Connect Spotify</Btn>
        </div>
      </Card>
    );
  }

  return (
    <Card style={{ borderColor: "#f4c430" }}>
      {error && (
        <p style={{ color: "#ff5a4d", fontSize: 12, margin: "0 0 8px", fontWeight: 600 }}>{error}</p>
      )}
      {!deviceId && !error && (
        <p style={{ color: "#c9b98a", fontSize: 12, fontStyle: "italic", margin: 0 }}>
          Connecting to Spotify… open the Spotify app on any device and pick "Stereo Types Boombox" as the playback target if it doesn't pick it up automatically.
        </p>
      )}
      {deviceId && (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {albumArt ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={albumArt} alt="" width={44} height={44} style={{ borderRadius: 6, flexShrink: 0 }} />
          ) : (
            <div style={{ width: 44, height: 44, borderRadius: 6, background: "#0a0e18", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🎵</div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: "#f5eddc", fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {trackName || "Nothing playing yet"}
            </div>
            {artistName && (
              <div style={{ color: "#c9b98a", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{artistName}</div>
            )}
            {/* Only shown when the audio-features fetch actually
                succeeded — its absence (rather than showing "—" or a
                placeholder) is itself the signal that this Spotify app
                doesn't have the Extended Quota Mode access that
                endpoint needs, and the cityscape has silently fallen
                back to the isPlaying-only scroll speed instead. */}
            {bpm && (
              <div style={{ color: "#f4c430", fontSize: 10, fontWeight: 700, marginTop: 2 }}>♪ {Math.round(bpm)} BPM</div>
            )}
          </div>
          <Btn small variant="ghost" onClick={togglePlay}>{isPlaying ? "⏸" : "▶️"}</Btn>
          <Btn small variant="ghost" onClick={skipNext}>⏭</Btn>
        </div>
      )}
      <button
        onClick={handleDisconnect}
        style={{ background: "none", border: "none", color: "#6b6558", fontSize: 11, marginTop: 10, cursor: "pointer", padding: 0, textDecoration: "underline" }}
      >
        Disconnect Spotify
      </button>
    </Card>
  );
}
