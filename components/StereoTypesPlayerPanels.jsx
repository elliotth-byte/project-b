import { Card } from "./ui";

// ─── Stereo Types — player view (Phase 1 placeholder) ───
// Mounted once a player is approved (see pages/play.jsx) — same
// "plumbing before rounds" scope as StereoTypesHostPanels.jsx. Boombox
// identity (color + stickers), the title-screen cityscape, and A
// Side/The Remix/On Blast each replace this in later phases.
export default function StereoTypesPlayerPanels({ gameId, player }) {
  return (
    <Card style={{ borderColor: "#f4c430", textAlign: "center" }}>
      <div style={{ fontSize: 28, marginBottom: 8 }}>📻</div>
      <h3 style={{ color: "#f4c430", margin: "0 0 8px", fontSize: 18, fontFamily: "'Anton', 'Arial Narrow', sans-serif", letterSpacing: 0.5 }}>
        You're in, {player?.name}
      </h3>
      <p style={{ color: "#c9b98a", fontSize: 13, margin: 0, fontStyle: "italic" }}>
        Stereo Types is still being built — A Side, The Remix, and On
        Blast aren't live yet. Sit tight, the host will let you know
        when there's something to actually play.
      </p>
    </Card>
  );
}
