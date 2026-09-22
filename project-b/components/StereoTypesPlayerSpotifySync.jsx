import { useEffect, useRef, useState } from "react";
import { Card, Btn } from "./ui";
import {
  isSpotifyConfigured,
  isConnected,
  beginAuth,
  disconnect,
  getAccessToken,
} from "../lib/spotify/auth";
import { projectedPositionMs } from "../lib/stereoTypesNowPlaying";

const SDK_SCRIPT_ID = "spotify-web-playback-sdk";
const SDK_SCRIPT_SRC = "https://sdk.scdn.co/spotify-player.js";

// A resync any tighter than this would just be chasing normal network
// jitter and audibly stutter for no real benefit — loose sync (a
// player's own device landing within ~1.5s of the boombox) is the
// whole tradeoff accepted by building this as "connect your own
// account" rather than true shared-stream audio, which Spotify's
// platform doesn't support for third-party apps at all.
const DRIFT_THRESHOLD_MS = 1500;

// ─── Stereo Types — hear the boombox on YOUR OWN device ───
// Opt-in counterpart to StereoTypesSpotifyWidget.jsx (the host's own,
// authoritative boombox) — same PKCE connection (lib/spotify/auth.js),
// same Web Playback SDK, but this one only ever follows, never leads:
// it watches the now-playing broadcast (lib/stereoTypesNowPlaying.js,
// which now carries a track URI + playhead position specifically for
// this) and tells THIS browser's own Spotify.Player to match it —
// same track, same play/pause state, periodically corrected for drift.
//
// Requires Spotify Premium, same restriction the host faces — a
// player without it gets the same account_error the host's own widget
// surfaces, not a silent failure. A player who skips this entirely
// loses nothing else: the reactive cityscape (StereoTypesCityscape.jsx)
// already runs off the same broadcast regardless of whether anyone's
// actually connected their own Spotify to it.
export default function StereoTypesPlayerSpotifySync({ gameId, nowPlaying }) {
  const configured = isSpotifyConfigured();
  const [connected, setConnected] = useState(false);
  const [deviceId, setDeviceId] = useState(null);
  const [activated, setActivated] = useState(false);
  const [myState, setMyState] = useState(null);
  const [error, setError] = useState(null);
  const playerRef = useRef(null);
  const syncingRef = useRef(false);

  useEffect(() => {
    if (configured) setConnected(isConnected());
  }, [configured]);

  // Identical shape to StereoTypesSpotifyWidget.jsx's own player setup
  // — see that file's matching comment for why the script tag is
  // loaded this way and left in place on unmount. This is a genuinely
  // separate Spotify.Player instance from the host's, running in this
  // player's own browser tab against their own account; there's no
  // shared state between the two beyond the now-playing broadcast both
  // sides read/write independently.
  useEffect(() => {
    if (!connected) return;
    let cancelled = false;

    function initPlayer() {
      if (cancelled || playerRef.current) return;
      const player = new window.Spotify.Player({
        name: "Stereo Types Boombox (yours)",
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
        if (!cancelled) setMyState(state);
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
      player.addListener("account_error", () => {
        if (!cancelled) setError("This Spotify account isn't Premium — following along needs Spotify Premium.");
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
      // Same one-listener caveat as the host widget: this only holds if
      // nothing else on the page sets this global too. Both this
      // component and StereoTypesSpotifyWidget.jsx never mount in the
      // same tab (host console vs. player screen), so there's no
      // actual collision in practice.
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

  // Mobile/Safari autoplay policies (and Spotify's own SDK docs) block
  // the very first playback command unless it follows an actual user
  // gesture on THIS page — a track starting because of something the
  // host did on a totally different device doesn't count as one, no
  // matter how legitimate the sync logic is. activateElement() is
  // Spotify's own escape hatch for exactly this: call it once, from a
  // real click, before ever asking this player to play anything.
  const startListeningHere = async () => {
    try {
      await playerRef.current?.activateElement?.();
    } catch {
      // Older SDK builds may not have activateElement at all — safe to
      // just proceed without it; worst case is the first sync silently
      // no-ops and the next drift-correction tick (or track change)
      // tries again.
    }
    setActivated(true);
  };

  // The actual sync: watches the broadcast, reconciles this player
  // against it. Split into "wrong track entirely" (needs a real Web
  // API play call, since the SDK's own player object can only control
  // whatever it's already got loaded, not load something new by URI)
  // versus "right track, just play/pause/drift" (cheaper, handled
  // through the player object directly, no network round trip beyond
  // what the SDK itself does).
  useEffect(() => {
    if (!activated || !deviceId || !nowPlaying?.trackUri) return;
    if (syncingRef.current) return;

    (async () => {
      syncingRef.current = true;
      try {
        const projected = Math.max(0, projectedPositionMs(nowPlaying) ?? 0);
        const myTrackUri = myState?.track_window?.current_track?.uri || null;

        if (myTrackUri !== nowPlaying.trackUri) {
          const token = await getAccessToken();
          if (!token) return;
          await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
            method: "PUT",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ uris: [nowPlaying.trackUri], position_ms: projected }),
          });
          return;
        }

        const myIsPlaying = !!myState && !myState.paused;
        if (nowPlaying.isPlaying && !myIsPlaying) {
          await playerRef.current?.resume();
        } else if (!nowPlaying.isPlaying && myIsPlaying) {
          await playerRef.current?.pause();
        }
        if (nowPlaying.isPlaying) {
          const myPosition = myState?.position ?? 0;
          if (Math.abs(myPosition - projected) > DRIFT_THRESHOLD_MS) {
            await playerRef.current?.seek(projected);
          }
        }
      } catch {
        // Best-effort — the next broadcast (or the host's own 8s
        // heartbeat) gives this another chance rather than surfacing a
        // one-off network hiccup as a hard error.
      } finally {
        syncingRef.current = false;
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    })();
  }, [activated, deviceId, nowPlaying?.trackUri, nowPlaying?.isPlaying, nowPlaying?.positionMs, nowPlaying?.updatedAt]);

  const handleDisconnect = () => {
    playerRef.current?.disconnect();
    playerRef.current = null;
    disconnect();
    setConnected(false);
    setDeviceId(null);
    setActivated(false);
    setMyState(null);
    setError(null);
  };

  if (!configured) return null;

  if (!connected) {
    return (
      <Card style={{ borderColor: "#3d1f5c" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <p style={{ color: "#c9b98a", fontSize: 12.5, margin: 0, flex: 1, minWidth: 200 }}>
            🎧 Want the boombox in your own ears? Connect your own Spotify (Premium required) and this device will follow along — loosely in sync, not sample-perfect.
          </p>
          <Btn small variant="ghost" onClick={() => beginAuth(gameId, "player")}>Connect Spotify</Btn>
        </div>
      </Card>
    );
  }

  return (
    <Card style={{ borderColor: "#3d1f5c" }}>
      {error && <p style={{ color: "#ff5a4d", fontSize: 12, margin: "0 0 8px", fontWeight: 600 }}>{error}</p>}
      {!error && !deviceId && (
        <p style={{ color: "#c9b98a", fontSize: 12, fontStyle: "italic", margin: 0 }}>Connecting to Spotify…</p>
      )}
      {!error && deviceId && !activated && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <p style={{ color: "#c9b98a", fontSize: 12.5, margin: 0, flex: 1, minWidth: 200 }}>
            Ready to follow the boombox — tap to let your browser start playing audio.
          </p>
          <Btn small onClick={startListeningHere}>▶️ Start Listening Here</Btn>
        </div>
      )}
      {!error && deviceId && activated && (
        <p style={{ color: "#f4c430", fontSize: 12, margin: 0, fontWeight: 600 }}>
          🎧 Following the boombox{nowPlaying?.trackName ? ` — ${nowPlaying.trackName}` : ""}
        </p>
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
