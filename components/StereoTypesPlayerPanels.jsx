import { useEffect, useState } from "react";
import { Card } from "./ui";
import Boombox from "./Boombox";
import StereoTypesTitleScreen from "./StereoTypesTitleScreen";
import StereoTypesASidePlayer from "./StereoTypesASidePlayer";
import { subscribeStereoTypesNowPlaying } from "../lib/stereoTypesNowPlaying";

// ─── Stereo Types — player view (Phase 2-5) ───
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
// does. Phase 5 (StereoTypesASidePlayer below) is Round 1 itself — the
// title screen keeps running unchanged above it, per the original
// spec's own "in-game graphics are the same cityscape" requirement;
// `players` (the full roster, needed so the ranking/guessing UI can
// list every approved player by name) is threaded straight through from
// pages/play.jsx's own `allPlayers`. No roomCode/playerCount here —
// this is one player's own screen, not the shared room view
// StereoTypesHostPanels.jsx is.
export default function StereoTypesPlayerPanels({ gameId, player, players }) {
  const [nowPlaying, setNowPlaying] = useState(null);

  useEffect(() => {
    if (!gameId) return;
    const unsubscribe = subscribeStereoTypesNowPlaying(gameId, setNowPlaying);
    return unsubscribe;
  }, [gameId]);

  return (
    // See StereoTypesHostPanels.jsx's identical fix for why
    // gridTemplateColumns is explicit here — without it, the
    // fullscreen title screen's own 100vw width inflates this grid's
    // implicit column (and therefore every sibling stacked in it,
    // like StereoTypesASidePlayer below) out to near-full window
    // width, regardless of the item-level min-width:0 already set on
    // the title screen wrapper itself (that alone isn't enough for
    // grid track sizing, only for flex rows).
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 16 }}>
      <StereoTypesTitleScreen fullscreen reactive={!!nowPlaying?.isPlaying} intensity={nowPlaying?.intensity || 0} bpm={nowPlaying?.bpm || null} />

      <Card style={{ borderColor: "#f4c430", textAlign: "center" }}>
        <div style={{ marginBottom: 12 }}>
          <Boombox color={player?.color} stickerId={player?.equippedSticker} label={player?.name} size={160} />
        </div>
        {nowPlaying?.isPlaying && nowPlaying?.trackName && (
          <p style={{ color: "#f4c430", fontSize: 12, margin: 0, fontWeight: 700 }}>
            🎵 Now playing: {nowPlaying.trackName}
            {nowPlaying.artistName ? ` — ${nowPlaying.artistName}` : ""}
          </p>
        )}
      </Card>

      <StereoTypesASidePlayer gameId={gameId} player={player} players={players} />
    </div>
  );
}
