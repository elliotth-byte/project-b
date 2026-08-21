import { useState, useEffect } from "react";
import { Card, Btn } from "./ui";
import { subscribeGameState, storageUpdate } from "../lib/gameStorage";
import { KEY_EXILE, KEY_FINALE } from "../lib/gameState";
import { powerFor } from "../lib/characterPowers";

// ─── Artemis's character power (see lib/characterPowers.js) ───
// "You may cancel the vote of another player of your choice at each
// elimination. You must announce you are choosing to do so before the
// deliberation period ends." Public and permanent once set (not secret
// like the Power of Chaos holder's pick, and not changeable afterward —
// "announce... before the deliberation period ends" reads as a one-time
// decision, not something to freely flip-flop on) — every place that
// tallies votes (lib/characterPowers.js's filterCancelledVote, wired
// into roundEngine.js and every relevant Host component) reads this
// same field.
export default function ArtemisTrigger({ gameId, round, player, players, settings }) {
  const isExile = round?.phase === "exile";
  const isFinale = round?.phase === "finale";
  const key = isExile ? KEY_EXILE : isFinale ? KEY_FINALE : null;
  const [state, setState] = useState(null);
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!key) return;
    const unsubscribe = subscribeGameState(gameId, key, setState);
    return unsubscribe;
  }, [gameId, key, round?.round]); // eslint-disable-line react-hooks/exhaustive-deps

  const isArtemis = powerFor(player, settings) === "Artemis";
  if (!isArtemis || !key || !state) return null;
  if (!state.votingOpen) return null; // must announce before deliberation ends — once voting closes, this power's window has passed

  if (state.artemisCancelledVoterId) {
    const cancelledName = (players || []).find((p) => p.id === state.artemisCancelledVoterId)?.display_name || "?";
    return (
      <Card style={{ marginBottom: 20, textAlign: "center", borderColor: "#22c55e" }}>
        <div style={{ fontSize: 22, marginBottom: 4 }}>🏕</div>
        <p style={{ color: "#a68fd6", fontSize: 12, margin: 0 }}>
          You cancelled <strong style={{ color: "#f5f0ff" }}>{cancelledName}</strong>'s vote this round.
        </p>
      </Card>
    );
  }

  // Voters this round are alive players for Exile, exiled players for
  // Finale — same pool the vote itself draws from, minus Artemis
  // herself (cancelling her own vote would be pointless).
  const voters = (players || []).filter((p) => p.id !== player.id && p.approved && (isExile ? p.alive : p.alive === false));

  const cancel = async () => {
    if (!selected) return;
    if (!confirm(`Cancel ${voters.find((p) => p.id === selected)?.display_name || "this player"}'s vote? This is permanent for this elimination and will be visible to everyone.`)) return;
    setSaving(true);
    await storageUpdate(gameId, key, (fresh) => (fresh && !fresh.artemisCancelledVoterId ? { ...fresh, artemisCancelledVoterId: selected } : fresh));
    setSaving(false);
  };

  return (
    <Card style={{ marginBottom: 20, borderColor: "#22c55e" }}>
      <div style={{ textAlign: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 22, marginBottom: 4 }}>🏕</div>
        <h3 style={{ color: "#f5f0ff", margin: "0 0 4px", fontSize: 15 }}>Artemis's Power</h3>
        <p style={{ color: "#a68fd6", fontSize: 12, margin: 0 }}>
          Cancel one player's vote this elimination — announced publicly, permanent once confirmed, and only usable while voting is still open.
        </p>
      </div>
      <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
        {voters.map((p) => (
          <button
            key={p.id}
            onClick={() => setSelected(p.id)}
            style={{
              textAlign: "left", padding: "8px 12px", borderRadius: 8, cursor: "pointer",
              background: selected === p.id ? "rgba(34,197,94,0.15)" : "#0d0618",
              border: `1px solid ${selected === p.id ? "#22c55e" : "#3d1f5c"}`,
              color: selected === p.id ? "#22c55e" : "#f5f0ff", fontSize: 13, fontWeight: 600,
            }}
          >
            {p.display_name}
          </button>
        ))}
      </div>
      <div style={{ textAlign: "center" }}>
        <Btn onClick={cancel} disabled={!selected || saving}>{saving ? "Cancelling..." : "🏕 Cancel Their Vote"}</Btn>
      </div>
    </Card>
  );
}
