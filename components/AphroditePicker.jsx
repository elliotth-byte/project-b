import { useState } from "react";
import { Card, Btn } from "./ui";
import { supabase } from "../lib/supabaseClient";
import { sendGroupMessage } from "../lib/chatData";

// ─── Aphrodite's character power (see lib/characterPowers.js) ───
// "Choose and announce one player in the first round. That player can
// never nominate or vote for you." Only ever rendered by play.jsx when
// round?.round === 1 AND this player currently holds Aphrodite's power
// — the pick is permanent for the whole season once made (no "choose
// again" language for Aphrodite, unlike Ares), so there's no edit/undo
// UI here on purpose.
//
// The mechanical restriction itself (see lib/characterPowers.js's
// aphroditeBlocksTargeting, wired into Fates nominations and — still to
// come — Exile Vote/Finale voting) applies regardless of whether an
// announcement actually happens; group chat may be off for this season
// entirely (settings.chatEnabled), so this posts one automatically when
// chat IS on, and tells the player to say it out loud themselves either
// way rather than silently relying on a channel that might not exist.
export default function AphroditePicker({ gameId, player, players, settings }) {
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const alreadyPicked = player?.powerState?.aphroditeTarget;

  if (alreadyPicked) {
    const targetName = players.find((p) => p.id === alreadyPicked)?.display_name || "?";
    return (
      <Card style={{ marginBottom: 20, textAlign: "center", borderColor: "#ff2d95" }}>
        <div style={{ fontSize: 22, marginBottom: 4 }}>💘</div>
        <p style={{ color: "#a68fd6", fontSize: 12, margin: 0 }}>
          You chose <strong style={{ color: "#f5f0ff" }}>{targetName}</strong> — they can never nominate or vote for you.
        </p>
      </Card>
    );
  }

  const others = (players || []).filter((p) => p.id !== player.id && p.approved);

  const confirm = async () => {
    if (!selected) return;
    setSaving(true);
    setError(null);
    const { error: dbError } = await supabase
      .from("players")
      .update({ power_state: { ...(player.powerState || {}), aphroditeTarget: selected } })
      .eq("id", player.id);
    if (dbError) { setSaving(false); setError("Couldn't save: " + dbError.message); return; }
    if (settings?.chatEnabled) {
      const targetName = others.find((p) => p.id === selected)?.display_name || "?";
      await sendGroupMessage(gameId, player.id, player.name, `💘 I've chosen my Aphrodite target: ${targetName}. They can never nominate or vote for me.`, player.name);
    }
    setSaving(false);
  };

  return (
    <Card style={{ marginBottom: 20, borderColor: "#ff2d95" }}>
      <div style={{ textAlign: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 22, marginBottom: 4 }}>💘</div>
        <h3 style={{ color: "#f5f0ff", margin: "0 0 4px", fontSize: 15 }}>Aphrodite's Power</h3>
        <p style={{ color: "#a68fd6", fontSize: 12, margin: 0 }}>
          Choose one player now, in round 1 — they can never nominate or vote for you, for the rest of the season. This is permanent once confirmed, so choose carefully.
        </p>
      </div>
      <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
        {others.map((p) => (
          <button
            key={p.id}
            onClick={() => setSelected(p.id)}
            style={{
              textAlign: "left", padding: "8px 12px", borderRadius: 8, cursor: "pointer",
              background: selected === p.id ? "rgba(255,45,149,0.15)" : "#0d0618",
              border: `1px solid ${selected === p.id ? "#ff2d95" : "#3d1f5c"}`,
              color: selected === p.id ? "#ff2d95" : "#f5f0ff", fontSize: 13, fontWeight: 600,
            }}
          >
            {p.display_name}
          </button>
        ))}
      </div>
      {error && <p style={{ fontSize: 11.5, color: "#ff3860", margin: "0 0 10px" }}>{error}</p>}
      <div style={{ textAlign: "center" }}>
        <Btn onClick={confirm} disabled={!selected || saving}>
          {saving ? "Confirming..." : "Confirm & Announce"}
        </Btn>
        {settings?.chatEnabled ? (
          <p style={{ fontSize: 11, color: "#6b4f99", marginTop: 8, fontStyle: "italic" }}>Posts automatically to Group Chat once confirmed.</p>
        ) : (
          <p style={{ fontSize: 11, color: "#6b4f99", marginTop: 8, fontStyle: "italic" }}>Group Chat is off this season — announce your pick out loud or however your group's playing.</p>
        )}
      </div>
    </Card>
  );
}
