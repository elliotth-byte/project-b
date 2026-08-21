import { useState } from "react";
import { Card, Btn } from "./ui";
import { supabase } from "../lib/supabaseClient";

// ─── Poseidon's character power (see lib/characterPowers.js) ───
// "Once per game, choose a Fates Ceremony and Exile Vote that must
// occur with DMs turned off." Unlike Aphrodite (round 1 only) or
// Demeter (per-challenge), this can be triggered whenever this player
// holds Poseidon's power and hasn't used it yet — "once per game" is
// about the power's own use count, not a specific window in the
// season. Stamps the CURRENT round number, and both that round's Fates
// AND Exile phases get DMs blocked (see ChatPanel.jsx's
// isPoseidonDmBlockActive), regardless of which of the two is actually
// active the moment this gets triggered.
export default function PoseidonTrigger({ player, round }) {
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const alreadyUsed = player?.powerState?.poseidonRound != null;
  if (alreadyUsed) {
    return (
      <Card style={{ marginBottom: 20, textAlign: "center", borderColor: "#0891b2" }}>
        <div style={{ fontSize: 22, marginBottom: 4 }}>🌊</div>
        <p style={{ color: "#a68fd6", fontSize: 12, margin: 0 }}>
          You turned DMs off for Round {player.powerState.poseidonRound}'s Fates Ceremony and Exile Vote — already used for the season.
        </p>
      </Card>
    );
  }

  const activate = async () => {
    setSaving(true);
    setError(null);
    const { error: dbError } = await supabase
      .from("players")
      .update({ power_state: { ...(player.powerState || {}), poseidonRound: round.round } })
      .eq("id", player.id);
    setSaving(false);
    if (dbError) { setError("Couldn't save: " + dbError.message); return; }
    setConfirming(false);
  };

  return (
    <Card style={{ marginBottom: 20, textAlign: "center", borderColor: "#0891b2" }}>
      <div style={{ fontSize: 22, marginBottom: 4 }}>🌊</div>
      <h3 style={{ color: "#f5f0ff", margin: "0 0 4px", fontSize: 15 }}>Poseidon's Power</h3>
      <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 10px" }}>
        Once per game, turn off DMs for a Fates Ceremony and Exile Vote — usable once, ever. Activating now applies it to THIS round's Fates and Exile.
      </p>
      {error && <p style={{ fontSize: 11.5, color: "#ff3860", margin: "0 0 10px" }}>{error}</p>}
      {confirming ? (
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <Btn small variant="ghost" onClick={() => setConfirming(false)} disabled={saving}>Cancel</Btn>
          <Btn small onClick={activate} disabled={saving}>{saving ? "Activating..." : `Confirm — Round ${round.round}`}</Btn>
        </div>
      ) : (
        <Btn small onClick={() => setConfirming(true)}>🌊 Turn Off DMs This Round</Btn>
      )}
    </Card>
  );
}
