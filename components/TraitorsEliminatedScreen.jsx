import { Card } from "./traitorsUi";
import ConfessionalPlayer from "./TraitorsConfessionalPlayer";

const ELIMINATION_BANNERS = {
  quit: { icon: "🚪", text: "You have chosen to walk away." },
  walked: { icon: "🚪", text: "You have chosen to walk away." },
  banished: { icon: "⚖️", text: "You have been banished." },
  murdered: { icon: "🗡️", text: "By order of the Traitors, you have been murdered." },
  masquerade: { icon: "🎭", text: "Unmasked at the Masquerade — you have been eliminated." },
};

// ─── Traitors: Eliminated Player Screen ───
// Once a player is out, the oath they signed to get in (see
// components/TraitorsOathGate.jsx — "when eliminated, I fall silent")
// only means anything if the app actually backs it up: no Mission tab,
// no Roundtable, no roster, no memory wall — nothing that could feed
// them, or let them feed anyone else, information about a game they're
// no longer part of. The one deliberate exception is their own
// Confessional, which stays open so the host can still hear from them
// after the fact.
export default function TraitorsEliminatedScreen({ gameId, player }) {
  const banner = ELIMINATION_BANNERS[player.eliminationType] || { icon: "🕯️", text: "You are no longer in the game." };
  return (
    <>
      <Card style={{ marginBottom: 20, textAlign: "center", borderColor: "rgba(196,92,60,0.4)" }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>{banner.icon}</div>
        <h2 style={{ color: "#f0e6d3", margin: 0, fontSize: 18, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>
          {banner.text}
        </h2>
        <p style={{ color: "#706050", fontSize: 12, margin: "10px 0 0", fontStyle: "italic" }}>
          Your silence begins now — no mission, no roundtable, no roster. The confessional below is still yours.
        </p>
      </Card>
      <ConfessionalPlayer gameId={gameId} player={player} round={null} />
    </>
  );
}
