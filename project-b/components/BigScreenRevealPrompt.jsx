import { useState } from "react";
import { Card, Btn } from "./ui";
import { markRevealAcknowledged } from "../lib/revealAck";

// ─── Big Screen Mode: reveal prompt (phone side) ───
// Counterpart to components/bigscreen/ExileRevealTV.jsx (the shared TV
// version of this same reveal) — in Big Screen Mode, a player's own
// phone doesn't step through the vote-by-vote sequence at all (that's
// what the TV is doing, together, for the whole room), it just needs
// to keep the same underlying gate closed (no Game/Ceremony/
// Confessional tabs, no roster) until they've actually watched it play
// out on the shared screen. Still calls the exact same
// markRevealAcknowledged used by the normal per-phone reveal
// (components/RoundRevealGate.jsx) — the data model this dismisses
// doesn't change between the two modes, only the presentation does.
export default function BigScreenRevealPrompt({ gameId, player, entry }) {
  const [acking, setAcking] = useState(false);

  const ack = async () => {
    setAcking(true);
    await markRevealAcknowledged(gameId, entry.round, player.id);
    setAcking(false);
  };

  return (
    <div style={{ minHeight: 320, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center" }}>
      <Card style={{ borderColor: "rgba(255,45,149,0.5)", maxWidth: 320 }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>📺</div>
        <p style={{ color: "#f5f0ff", fontSize: 16, fontWeight: 700, margin: "0 0 8px", fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
          Look at the big screen!
        </p>
        <p style={{ color: "#a68fd6", fontSize: 13, margin: "0 0 18px" }}>
          Round {entry.round}'s Exile Vote is being revealed on the shared display. Your phone stays locked until you tap below.
        </p>
        <Btn onClick={ack} disabled={acking} style={{ width: "100%" }}>{acking ? "..." : "I've seen the reveal"}</Btn>
      </Card>
    </div>
  );
}
