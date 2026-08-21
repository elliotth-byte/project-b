import { useState } from "react";
import { Card, Btn } from "./ui";
import { supabase } from "../lib/supabaseClient";
import { sendGroupMessage } from "../lib/chatData";

// ─── Ares's character power (see lib/characterPowers.js) ───
// "Choose and announce one player in round 1. You receive immunity from
// being nominated the round after they are eliminated, and may then
// choose another target." Unlike Aphrodite (round 1 only, permanent),
// Ares's target can be re-picked — the moment his current target is
// exiled (see roundEngine.js's computeAresImmunityUpdates), his
// aresTarget clears automatically and this picker reappears on its own.
export default function AresTarget({ gameId, round, player, players, settings }) {
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const state = player?.powerState || {};
  const currentTarget = state.aresTarget;
  const immuneThisRound = !!(state.aresImmunityRound && round?.round === state.aresImmunityRound);

  if (currentTarget) {
    const targetName = players.find((p) => p.id === currentTarget)?.display_name || "?";
    return (
      <Card style={{ marginBottom: 20, textAlign: "center", borderColor: "#dc2626" }}>
        <div style={{ fontSize: 22, marginBottom: 4 }}>⚔️</div>
        <p style={{ color: "#a68fd6", fontSize: 12, margin: 0 }}>
          Your Ares target: <strong style={{ color: "#f5f0ff" }}>{targetName}</strong>. Once they're exiled, you'll get a round of immunity and a new pick.
        </p>
      </Card>
    );
  }

  const others = (players || []).filter((p) => p.id !== player.id && p.approved && p.alive !== false);

  const confirm = async () => {
    if (!selected) return;
    setSaving(true);
    setError(null);
    const { error: dbError } = await supabase
      .from("players")
      .update({ power_state: { ...state, aresTarget: selected } })
      .eq("id", player.id);
    if (dbError) { setSaving(false); setError("Couldn't save: " + dbError.message); return; }
    if (settings?.chatEnabled) {
      const targetName = others.find((p) => p.id === selected)?.display_name || "?";
      await sendGroupMessage(gameId, player.id, player.name, `⚔️ I've chosen my Ares target: ${targetName}.`, player.name);
    }
    setSaving(false);
  };

  return (
    <Card style={{ marginBottom: 20, borderColor: "#dc2626" }}>
      <div style={{ textAlign: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 22, marginBottom: 4 }}>⚔️</div>
        <h3 style={{ color: "#f5f0ff", margin: "0 0 4px", fontSize: 15 }}>Ares's Power</h3>
        {immuneThisRound && (
          <p style={{ color: "#00ff9d", fontSize: 12, fontWeight: 700, margin: "0 0 6px" }}>🛡 You're immune from nomination this round.</p>
        )}
        <p style={{ color: "#a68fd6", fontSize: 12, margin: 0 }}>
          Choose one player — once they're exiled, you get a round of immunity from nomination, then may choose a new target.
        </p>
      </div>
      <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
        {others.map((p) => (
          <button
            key={p.id}
            onClick={() => setSelected(p.id)}
            style={{
              textAlign: "left", padding: "8px 12px", borderRadius: 8, cursor: "pointer",
              background: selected === p.id ? "rgba(220,38,38,0.15)" : "#0d0618",
              border: `1px solid ${selected === p.id ? "#dc2626" : "#3d1f5c"}`,
              color: selected === p.id ? "#dc2626" : "#f5f0ff", fontSize: 13, fontWeight: 600,
            }}
          >
            {p.display_name}
          </button>
        ))}
      </div>
      {error && <p style={{ fontSize: 11.5, color: "#ff3860", margin: "0 0 10px" }}>{error}</p>}
      <div style={{ textAlign: "center" }}>
        <Btn onClick={confirm} disabled={!selected || saving}>{saving ? "Confirming..." : "Confirm & Announce"}</Btn>
      </div>
    </Card>
  );
}
