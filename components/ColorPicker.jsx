import { useState } from "react";
import { Card } from "./ui";
import { supabase } from "../lib/supabaseClient";
import { PLAYER_COLORS, takenColors } from "../lib/playerColors";

export default function ColorPicker({ player, allPlayers, onPicked }) {
  const [saving, setSaving] = useState(null);
  const taken = takenColors((allPlayers || []).filter((p) => p.id !== player.id));

  const pick = async (hex) => {
    if (taken.has(hex)) return;
    setSaving(hex);
    const { error } = await supabase.from("players").update({ color: hex }).eq("id", player.id);
    setSaving(null);
    if (error) {
      alert("Couldn't claim that color — someone may have just taken it. Try another.");
      return;
    }
    onPicked?.(hex);
  };

  return (
    <Card style={{ marginBottom: 20, textAlign: "center", borderColor: "#ff2d95" }}>
      <div style={{ fontSize: 28, marginBottom: 6 }}>🎨</div>
      <h3 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 900 }}>Pick Your Color</h3>
      <p style={{ fontSize: 12, opacity: 0.7, margin: "0 0 16px" }}>This is how everyone will spot you on the vote wall.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
        {PLAYER_COLORS.map((c) => {
          const isTaken = taken.has(c.hex);
          return (
            <button
              key={c.hex}
              disabled={isTaken || saving}
              onClick={() => pick(c.hex)}
              title={isTaken ? `${c.name} — taken` : c.name}
              style={{
                aspectRatio: "1", borderRadius: 10, cursor: isTaken ? "not-allowed" : "pointer",
                background: isTaken ? "#1a1025" : c.hex,
                border: isTaken ? "2px solid #3d1f5c" : `2px solid ${c.hex}`,
                boxShadow: isTaken ? "none" : `0 0 14px ${c.hex}aa`,
                opacity: isTaken ? 0.35 : saving === c.hex ? 0.6 : 1,
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
