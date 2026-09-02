import { Card } from "./ui";
import Boombox from "./Boombox";
import StereoTypesTitleScreen from "./StereoTypesTitleScreen";

// ─── Stereo Types — player view (Phase 2-3) ───
// By the time this mounts, StereoTypesIdentityPicker.jsx (see
// pages/play.jsx's needsStereoTypesIdentity gate) has already run, so
// player.color is always set here — Phase 2 built the boombox that
// step produces; Phase 3 adds the same title-screen art direction
// (cityscape + logo) the host console shows, above it, so a player
// gets the same brand moment, not just the host. No roomCode/
// playerCount here — this is one player's own screen, not the shared
// room view StereoTypesHostPanels.jsx is. A Side/The Remix/On Blast
// each replace the "still being built" note below in later phases.
export default function StereoTypesPlayerPanels({ gameId, player }) {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <StereoTypesTitleScreen fullscreen />

      <Card style={{ borderColor: "#f4c430", textAlign: "center" }}>
        <div style={{ marginBottom: 12 }}>
          <Boombox color={player?.color} stickerId={player?.equippedSticker} label={player?.name} size={160} />
        </div>
        <p style={{ color: "#c9b98a", fontSize: 13, margin: 0, fontStyle: "italic" }}>
          Stereo Types is still being built — A Side, The Remix, and On
          Blast aren't live yet. Sit tight, the host will let you know
          when there's something to actually play.
        </p>
      </Card>
    </div>
  );
}
