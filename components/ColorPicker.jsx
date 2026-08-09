import { useState } from "react";
import { Card, Btn } from "./ui";
import { supabase } from "../lib/supabaseClient";
import { PLAYER_COLORS, takenColors } from "../lib/playerColors";
import { ALIASES, takenAliases } from "../lib/aliases";

// ─── Onboarding: color (+ alias, if the season has it on) ───
// Alias mode adds a step and a confirmation screen, since getting your
// alias wrong isn't as harmless as picking a different color would be —
// see components/AdminHost.jsx for the toggle. Without alias mode, this
// behaves exactly like it always has: pick a color, done immediately.
export default function ColorPicker({ player, allPlayers, aliasEnabled, onPicked }) {
  const [step, setStep] = useState("color"); // "color" | "alias" | "confirm"
  const [color, setColor] = useState(null);
  const [alias, setAlias] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const others = (allPlayers || []).filter((p) => p.id !== player.id);
  const takenColorSet = takenColors(others);
  const takenAliasSet = takenAliases(others);

  const pickColor = (hex) => {
    if (takenColorSet.has(hex)) return;
    setColor(hex);
    setStep(aliasEnabled ? "alias" : "confirm");
    if (!aliasEnabled) confirmPick(hex, null);
  };

  const pickAlias = (name) => {
    if (takenAliasSet.has(name)) return;
    setAlias(name);
    setStep("confirm");
  };

  const confirmPick = async (colorOverride, aliasOverride) => {
    const finalColor = colorOverride !== undefined ? colorOverride : color;
    const finalAlias = aliasOverride !== undefined ? aliasOverride : alias;
    setSaving(true);
    setError(null);
    const patch = { color: finalColor };
    if (aliasEnabled) patch.alias = finalAlias;
    const { data, error: dbError } = await supabase.from("players").update(patch).eq("id", player.id).select().maybeSingle();
    setSaving(false);
    if (dbError) { setError("Couldn't save: " + dbError.message); return; }
    if (!data) { setError("Couldn't save — the update didn't apply. This is likely a permissions issue on the host's end rather than something you did wrong."); return; }
    onPicked?.(data);
  };

  const chosenColorMeta = PLAYER_COLORS.find((c) => c.hex === color);
  const chosenAliasMeta = ALIASES.find((a) => a.name === alias);

  if (step === "alias") {
    return (
      <Card style={{ marginBottom: 20, textAlign: "center", borderColor: "#ff2d95" }}>
        <div style={{ fontSize: 28, marginBottom: 6 }}>🏛</div>
        <h3 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 900 }}>Choose Your Alias</h3>
        <p style={{ fontSize: 12, opacity: 0.7, margin: "0 0 16px" }}>
          This is who everyone sees you as — your real name stays hidden until the game's over.
        </p>
        <div style={{ display: "grid", gap: 8, textAlign: "left" }}>
          {ALIASES.map((a) => {
            const isTaken = takenAliasSet.has(a.name);
            return (
              <button
                key={a.name}
                disabled={isTaken}
                onClick={() => pickAlias(a.name)}
                style={{
                  display: "flex", flexDirection: "column", gap: 2, padding: "10px 14px", borderRadius: 10,
                  cursor: isTaken ? "not-allowed" : "pointer", textAlign: "left",
                  background: isTaken ? "#1a1025" : "#0d0618",
                  border: `1px solid ${isTaken ? "#3d1f5c" : "#ff2d9555"}`,
                  opacity: isTaken ? 0.4 : 1,
                }}
              >
                <span style={{ color: "#f5f0ff", fontSize: 14, fontWeight: 700 }}>
                  {a.name}{isTaken && " — taken"}
                </span>
                <span style={{ color: "#a68fd6", fontSize: 11 }}>{a.blurb}</span>
              </button>
            );
          })}
        </div>
        <div style={{ marginTop: 14 }}>
          <Btn small variant="ghost" onClick={() => setStep("color")}>‹ Back to color</Btn>
        </div>
      </Card>
    );
  }

  if (step === "confirm" && aliasEnabled) {
    return (
      <Card style={{ marginBottom: 20, textAlign: "center", borderColor: "#ff2d95" }}>
        <div style={{ fontSize: 28, marginBottom: 10 }}>✅</div>
        <h3 style={{ margin: "0 0 12px", fontSize: 17, fontWeight: 900 }}>Confirm Your Identity</h3>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 6 }}>
          <span style={{ width: 32, height: 32, borderRadius: 8, background: color, border: `2px solid ${color}`, boxShadow: `0 0 14px ${color}aa`, display: "inline-block" }} />
          <span style={{ color: "#f5f0ff", fontSize: 16, fontWeight: 800 }}>{alias}</span>
        </div>
        <p style={{ fontSize: 11, color: "#a68fd6", margin: "0 0 4px" }}>{chosenColorMeta?.name}</p>
        <p style={{ fontSize: 12, color: "#6b4f99", fontStyle: "italic", margin: "0 0 18px" }}>{chosenAliasMeta?.blurb}</p>
        <p style={{ fontSize: 11.5, color: "#ff3860", margin: "0 0 16px" }}>
          Once confirmed, this is who you are for the whole season — your real name won't be shown to other players until the game ends.
        </p>
        {error && <p style={{ fontSize: 11.5, color: "#ff3860", margin: "0 0 10px" }}>{error}</p>}
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <Btn variant="ghost" onClick={() => setStep("alias")} disabled={saving}>‹ Back</Btn>
          <Btn onClick={() => confirmPick()} disabled={saving}>{saving ? "Saving..." : "Confirm"}</Btn>
        </div>
      </Card>
    );
  }

  return (
    <Card style={{ marginBottom: 20, textAlign: "center", borderColor: "#ff2d95" }}>
      <div style={{ fontSize: 28, marginBottom: 6 }}>🎨</div>
      <h3 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 900 }}>Pick Your Color</h3>
      <p style={{ fontSize: 12, opacity: 0.7, margin: "0 0 16px" }}>This is how everyone will spot you on the vote wall.</p>
      {error && <p style={{ fontSize: 11.5, color: "#ff3860", margin: "0 0 10px" }}>{error}</p>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
        {PLAYER_COLORS.map((c) => {
          const isTaken = takenColorSet.has(c.hex);
          return (
            <button
              key={c.hex}
              disabled={isTaken || saving}
              onClick={() => pickColor(c.hex)}
              title={isTaken ? `${c.name} — taken` : c.name}
              style={{
                aspectRatio: "1", borderRadius: 10, cursor: isTaken ? "not-allowed" : "pointer",
                background: isTaken ? "#1a1025" : c.hex,
                border: isTaken ? "2px solid #3d1f5c" : `2px solid ${c.hex}`,
                boxShadow: isTaken ? "none" : `0 0 14px ${c.hex}aa`,
                opacity: isTaken ? 0.35 : saving ? 0.6 : 1,
                position: "relative",
              }}
            >
              {isTaken && <span style={{ fontSize: 18 }}>✕</span>}
            </button>
          );
        })}
      </div>
    </Card>
  );
}
