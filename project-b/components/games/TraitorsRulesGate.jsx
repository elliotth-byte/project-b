import { useState, useEffect } from "react";
import { Btn, Card } from "../traitorsUi";

// ─── Traitors' own "Go" rules gate ───
// Parity counterpart to ChallengePlayer.jsx's own rules screen (see its
// comment right above `if (!readyToPlay)`): a player should get a chance
// to read how a mini-game works before it drops them straight into a
// moving game, and a fresh page load shouldn't silently skip that just
// because the game was already running when they arrived.
//
// Lifted into one shared component (rather than re-implemented per
// mini-game) since all 11 of Traitors' Player components need the exact
// same behavior — see TraitorsPlayerPanels.jsx's own comment on why
// these are host-toggled panels, not a single shared engine, which is
// exactly why this couldn't just live in one shared parent instead.
//
// `resetKey` should be something that changes every time the host starts
// a genuinely NEW run of this mini-game — each Host component's own
// `createdAt` (set fresh every time it (re)starts; confirmed uniform
// across all 11) is the natural choice, mirroring how ChallengePlayer.jsx
// resets on `challenge?.startedAt`. A remount from navigating away and
// back (same createdAt) does NOT re-show this — only an actual new start
// does.
export default function TraitorsRulesGate({ icon, label, blurb, resetKey, children }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(false);
  }, [resetKey]);

  if (ready) return children;

  return (
    <Card style={{ marginBottom: 20, borderColor: "rgba(201,168,76,0.3)", textAlign: "center" }}>
      <div style={{ fontSize: 12, letterSpacing: 4, textTransform: "uppercase", color: "#c9a84c", marginBottom: 6 }}>
        {icon} {label}
      </div>
      <h3 style={{ color: "#f0e6d3", margin: "0 0 8px", fontSize: 16, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>How to play</h3>
      <p style={{ color: "#a09080", fontSize: 13, margin: "0 0 18px", lineHeight: 1.5 }}>{blurb}</p>
      <Btn onClick={() => setReady(true)}>Go ➜</Btn>
    </Card>
  );
}
