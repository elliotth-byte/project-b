import { useState, useEffect } from "react";
import { Card, Btn } from "./ui";
import { subscribeGameState, storageUpdate } from "../lib/gameStorage";
import { KEY_EXILE, KEY_FINALE } from "../lib/gameState";
import { powerFor } from "../lib/characterPowers";

// ─── Hera's character power (see lib/characterPowers.js) ───
// "At the start of each voting deliberation period, you may exile one
// player from the main chat" — usable any time voting's open (there's
// no clean way to enforce "only at the very start" specifically), once
// per round, locked in once set — same shape as Artemis's vote
// cancellation. Auto-reinstatement falls out of being scoped to this
// round's own state key: a new round starts with a clean slate.
export default function HeraTrigger({ round, player, players, gameId, settings }) {
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

  const isHera = powerFor(player, settings) === "Hera";
  if (!isHera || !key || !state) return null;
  if (!state.votingOpen) return null;

  if (state.heraExiledPlayerId) {
    const exiledName = (players || []).find((p) => p.id === state.heraExiledPlayerId)?.display_name || "?";
    return (
      <Card style={{ marginBottom: 20, textAlign: "center", borderColor: "#a855f7" }}>
        <div style={{ fontSize: 22, marginBottom: 4 }}>👑</div>
        <p style={{ color: "#a68fd6", fontSize: 12, margin: 0 }}>
          You exiled <strong style={{ color: "#f5f0ff" }}>{exiledName}</strong> from the main chat for this deliberation.
        </p>
      </Card>
    );
  }

  // Same pool the deliberation itself involves — alive players for
  // Exile, exiled players for Finale — minus Hera herself.
  const targets = (players || []).filter((p) => p.id !== player.id && p.approved && (isExile ? p.alive : p.alive === false));

  const exileFromChat = async () => {
    if (!selected) return;
    if (!confirm(`Exile ${targets.find((p) => p.id === selected)?.display_name || "this player"} from the main chat for this deliberation? They'll be back once it ends.`)) return;
    setSaving(true);
    await storageUpdate(gameId, key, (fresh) => (fresh && !fresh.heraExiledPlayerId ? { ...fresh, heraExiledPlayerId: selected } : fresh));
    setSaving(false);
  };

  return (
    <Card style={{ marginBottom: 20, borderColor: "#a855f7" }}>
      <div style={{ textAlign: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 22, marginBottom: 4 }}>👑</div>
        <h3 style={{ color: "#f5f0ff", margin: "0 0 4px", fontSize: 15 }}>Hera's Power</h3>
        <p style={{ color: "#a68fd6", fontSize: 12, margin: 0 }}>
          Exile one player from the main chat for this deliberation — they're automatically back once it ends.
        </p>
      </div>
      <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
        {targets.map((p) => (
          <button
            key={p.id}
            onClick={() => setSelected(p.id)}
            style={{
              textAlign: "left", padding: "8px 12px", borderRadius: 8, cursor: "pointer",
              background: selected === p.id ? "rgba(168,85,247,0.15)" : "#0d0618",
              border: `1px solid ${selected === p.id ? "#a855f7" : "#3d1f5c"}`,
              color: selected === p.id ? "#a855f7" : "#f5f0ff", fontSize: 13, fontWeight: 600,
            }}
          >
            {p.display_name}
          </button>
        ))}
      </div>
      <div style={{ textAlign: "center" }}>
        <Btn onClick={exileFromChat} disabled={!selected || saving}>{saving ? "Exiling..." : "👑 Exile From Chat"}</Btn>
      </div>
    </Card>
  );
}
