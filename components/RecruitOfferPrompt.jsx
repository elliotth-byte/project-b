import { useState, useEffect } from "react";
import { Btn, Card } from "./traitorsUi";
import { subscribeRecruitOffers, respondToRecruitOffer } from "../lib/recruitOffers";

// ─── Secret recruitment offer: target player's view ───
// Only ever shows on the one player the host made the offer to — the
// database won't return anyone else's offers (sql/add-recruit-offers.sql).
// Renders nothing at all when there's no pending offer for this player.
export default function RecruitOfferPrompt({ gameId, player }) {
  const [offers, setOffers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [justAccepted, setJustAccepted] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!gameId || !player?.id) return;
    return subscribeRecruitOffers(gameId, setOffers, player.id);
  }, [gameId, player?.id]);

  const pending = offers.find((o) => o.status === "pending");

  const respond = async (accept) => {
    if (!pending || busy) return;
    const sure = accept
      ? confirm("Join the Traitors? Once you accept, there's no going back.")
      : confirm("Decline the Traitors' offer? It won't be made again.");
    if (!sure) return;
    setBusy(true);
    setError("");
    const res = await respondToRecruitOffer(pending.id, accept);
    setBusy(false);
    if (!res.ok) { setError("Something went wrong — try again."); return; }
    if (accept) setJustAccepted(true);
  };

  const cardStyle = {
    marginBottom: 20, textAlign: "center", padding: "24px 20px",
    background: "linear-gradient(160deg, #1a0e0e 0%, #0e1830 100%)",
    border: "2px solid #c45c3c", boxShadow: "0 0 24px rgba(196,92,60,0.25)",
  };
  const title = { color: "#c45c3c", margin: "0 0 6px", fontFamily: "'Palatino Linotype', Palatino, Georgia, serif", fontSize: 20 };

  if (justAccepted) {
    return (
      <Card style={cardStyle}>
        <div style={{ fontSize: 32, marginBottom: 6 }}>🗡️</div>
        <h2 style={title}>Welcome to the Traitors</h2>
        <p style={{ color: "#a09080", fontSize: 13, margin: "0 0 14px", fontStyle: "italic" }}>
          Your new role is now live. Tell no one.
        </p>
        <Btn small variant="ghost" onClick={() => setJustAccepted(false)}>Close</Btn>
      </Card>
    );
  }

  if (!pending) return null;

  return (
    <Card style={cardStyle}>
      <div style={{ fontSize: 32, marginBottom: 6 }}>✉️</div>
      <h2 style={title}>A Sealed Invitation</h2>
      <p style={{ color: "#f0e6d3", fontSize: 14, margin: "0 0 8px" }}>
        The Traitors have chosen you. They are offering you a place among them.
      </p>
      {pending.message && (
        <p style={{ color: "#c9a84c", fontSize: 13, margin: "0 0 10px", fontStyle: "italic" }}>"{pending.message}"</p>
      )}
      <p style={{ color: "#706050", fontSize: 11, margin: "0 0 16px", fontStyle: "italic" }}>
        🤫 No one else can see this offer. Whatever you choose, keep it to yourself.
      </p>
      <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
        <Btn variant="danger" onClick={() => respond(true)} disabled={busy}>Accept</Btn>
        <Btn variant="ghost" onClick={() => respond(false)} disabled={busy}>Decline</Btn>
      </div>
      {error && <p style={{ color: "#c45c3c", fontSize: 12, margin: "10px 0 0" }}>{error}</p>}
    </Card>
  );
}
