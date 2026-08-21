import { useState, useEffect } from "react";
import { Card, Btn } from "./ui";
import { supabase } from "../lib/supabaseClient";
import { subscribeGameState, storageUpdate } from "../lib/gameStorage";
import { KEY_EXILE } from "../lib/gameState";
import { powerFor, computeDionysusSwap } from "../lib/characterPowers";

// ─── Dionysus's character power (see lib/characterPowers.js) ───
// "At the end of each round, swap power cards with any player of your
// choosing." Shown throughout the Exile phase — the last phase of a
// round before the next one begins — rather than trying to detect a
// narrower "round has fully ended" moment; round transitions here are
// driven by polling, not a distinct waiting phase, so a generous window
// is safer than a moment that might get missed. Once per round, tracked
// on the exile state itself (dionysusSwapped), which naturally resets
// every round since that state is keyed by round number.
export default function DionysusSwap({ gameId, round, player, players, settings }) {
  const isExile = round?.phase === "exile";
  const [state, setState] = useState(null);
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isExile) return;
    const unsubscribe = subscribeGameState(gameId, KEY_EXILE, setState);
    return unsubscribe;
  }, [gameId, isExile, round?.round]); // eslint-disable-line react-hooks/exhaustive-deps

  const isDionysus = powerFor(player, settings) === "Dionysus";
  if (!isDionysus || !isExile || !state) return null;
  if (state.dionysusSwapped) {
    return (
      <Card style={{ marginBottom: 20, textAlign: "center", borderColor: "#c026d3" }}>
        <div style={{ fontSize: 22, marginBottom: 4 }}>🍇</div>
        <p style={{ color: "#a68fd6", fontSize: 12, margin: 0 }}>You've already swapped power cards this round.</p>
      </Card>
    );
  }

  const others = (players || []).filter((p) => p.id !== player.id && p.approved);

  const swap = async () => {
    if (!selected) return;
    const targetPlayer = others.find((p) => p.id === selected);
    if (!confirm(`Swap power cards with ${targetPlayer?.display_name || "this player"}? This can't be undone this round.`)) return;
    setSaving(true);
    const { dionysusUpdate, targetUpdate } = computeDionysusSwap(player, targetPlayer, settings);
    await supabase.from("players").update({ power_state: dionysusUpdate.power_state }).eq("id", dionysusUpdate.playerId);
    await supabase.from("players").update({ power_state: targetUpdate.power_state }).eq("id", targetUpdate.playerId);
    // storageUpdate, not a raw write of the closed-over `state` variable
    // — that could be stale by the time this async call actually runs
    // (e.g. if voting closed or another update landed in between),
    // silently clobbering it. storageUpdate re-reads fresh and applies
    // the change atomically instead.
    await storageUpdate(gameId, KEY_EXILE, (fresh) => (fresh && !fresh.dionysusSwapped ? { ...fresh, dionysusSwapped: true } : fresh));
    setSaving(false);
  };

  return (
    <Card style={{ marginBottom: 20, borderColor: "#c026d3" }}>
      <div style={{ textAlign: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 22, marginBottom: 4 }}>🍇</div>
        <h3 style={{ color: "#f5f0ff", margin: "0 0 4px", fontSize: 15 }}>Dionysus's Power</h3>
        <p style={{ color: "#a68fd6", fontSize: 12, margin: 0 }}>
          Swap power cards with any player — if they held a target (Aphrodite or Ares), you inherit it. Once per round.
        </p>
      </div>
      <div style={{ display: "grid", gap: 6, marginBottom: 12, maxHeight: 260, overflowY: "auto" }}>
        {others.map((p) => (
          <button
            key={p.id}
            onClick={() => setSelected(p.id)}
            style={{
              textAlign: "left", padding: "8px 12px", borderRadius: 8, cursor: "pointer",
              background: selected === p.id ? "rgba(192,38,211,0.15)" : "#0d0618",
              border: `1px solid ${selected === p.id ? "#c026d3" : "#3d1f5c"}`,
              color: selected === p.id ? "#c026d3" : "#f5f0ff", fontSize: 13, fontWeight: 600,
            }}
          >
            {p.display_name}
          </button>
        ))}
      </div>
      <div style={{ textAlign: "center" }}>
        <Btn onClick={swap} disabled={!selected || saving}>{saving ? "Swapping..." : "🍇 Swap Power Cards"}</Btn>
      </div>
    </Card>
  );
}
