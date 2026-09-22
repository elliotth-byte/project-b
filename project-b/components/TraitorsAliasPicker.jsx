import { useState } from "react";
import { Btn, Card } from "./traitorsUi";
import { supabase } from "../lib/supabaseClient";

// ─── Traitors' own alias onboarding ───
// The lightweight Traitors counterpart to components/ColorPicker.jsx —
// see lib/playerIdentity.js's traitorsIdentityComplete for why this is
// its own thing rather than reusing ColorPicker directly: no color step
// (Traitors has no color concept at all), and a free-text alias instead
// of Project B's fixed list of 14 Greek mythological codenames, which
// doesn't fit Traitors' own gothic aesthetic. Same persistence path
// ColorPicker itself uses — a direct update on this player's own row.
export default function TraitorsAliasPicker({ player, onPicked }) {
  const [alias, setAlias] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const submit = async () => {
    const trimmed = alias.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    const { error: dbError } = await supabase.from("players").update({ alias: trimmed }).eq("id", player.id);
    setSaving(false);
    if (dbError) { setError(dbError.message); return; }
    onPicked?.(trimmed);
  };

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ fontSize: 28, marginBottom: 8 }}>🎭</div>
      <h3 style={{ color: "#f0e6d3", margin: "0 0 8px", fontSize: 16, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>
        Pick an alias
      </h3>
      <p style={{ color: "#a09080", fontSize: 13, margin: "0 0 16px", lineHeight: 1.5 }}>
        The host has turned on Alias mode for this season. Whatever you type here replaces your real name for
        everyone else until the finale — the host will always see both.
      </p>
      <input
        value={alias}
        onChange={(e) => setAlias(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        placeholder="Your alias..."
        maxLength={40}
        style={{
          width: "100%", maxWidth: 260, boxSizing: "border-box", background: "#0a1020", border: "1px solid #253550",
          borderRadius: 8, padding: "10px 12px", color: "#f0e6d3", fontSize: 14, textAlign: "center", marginBottom: 12,
        }}
      />
      <div>
        <Btn onClick={submit} disabled={!alias.trim() || saving}>{saving ? "Saving..." : "Confirm alias"}</Btn>
      </div>
      {error && <p style={{ color: "#c45c3c", fontSize: 12, marginTop: 10 }}>{error}</p>}
    </Card>
  );
}
