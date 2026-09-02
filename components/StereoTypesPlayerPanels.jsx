import { useEffect, useState } from "react";
import { Card } from "./ui";
import Boombox from "./Boombox";
import StereoTypesTitleScreen from "./StereoTypesTitleScreen";
import { subscribeStereoTypesNowPlaying } from "../lib/stereoTypesNowPlaying";

// ─── Stereo Types — player view (Phase 2-4) ───
// By the time this mounts, StereoTypesIdentityPicker.jsx (see
// pages/play.jsx's needsStereoTypesIdentity gate) has already run, so
// player.color is always set here — Phase 2 built the boombox that
// step produces; Phase 3 added the same title-screen art direction
// (cityscape + logo) the host console shows, above it, so a player
// gets the same brand moment, not just the host. Phase 4 subscribes to
// stereo_types:now-playing (written by the host's own
// StereoTypesSpotifyWidget.jsx — no player ever connects to Spotify
// themselves) so this player's cityscape lights up in sync with
// whatever the host is actually playing, same as the host's own copy
// does. No roomCode/playerCount here — this is one player's own
// screen, not the shared room view StereoTypesHostPanels.jsx is. A
// Side/The Remix/On Blast each replace the "still being built" note
// below in later phases.
export default function StereoTypesPlayerPanels({ gameId, player }) {
  const [nowPlaying, setNowPlaying] = useState(null);

  useEffect(() => {
    if (!gameId) return;
    const unsubscribe = subscribeStereoTypesNowPlaying(gameId, setNowPlaying);
    return unsubscribe;
  }, [gameId]);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <StereoTypesTitleScreen fullscreen reactive={!!nowPlaying?.isPlaying} intensity={nowPlaying?.intensity || 0} />

      <Card style={{ borderColor: "#f4c430", textAlign: "center" }}>
        <div style={{ marginBottom: 12 }}>
          <Boombox color={player?.color} stickerId={player?.equippedSticker} label={player?.name} size={160} />
        </div>
        <p style={{ color: "#c9b98a", fontSize: 13, margin: 0, fontStyle: "italic" }}>
          Stereo Types is still being built — A Side, The Remix, and On
          Blast aren't live yet. Sit tight, the host will let you know
          when there's something to actually play.
        </p>
        {nowPlaying?.isPlaying && nowPlaying?.trackName && (
          <p style={{ color: "#f4c430", fontSize: 12, margin: "10px 0 0", fontWeight: 700 }}>
            🎵 Now playing: {nowPlaying.trackName}
            {nowPlaying.artistName ? ` — ${nowPlaying.artistName}` : ""}
          </p>
        )}
      </Card>
    </div>
  );
}
