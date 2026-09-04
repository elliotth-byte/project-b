import { useState, useEffect } from "react";
import { Btn, Card } from "./ui";
import { supabase } from "../lib/supabaseClient";
import { PLAYER_COLORS, takenColors } from "../lib/playerColors";
import { STICKER_CATALOG, fetchUnlockedStickerIds } from "../lib/stereoTypesStickers";
import { THEMES } from "../lib/uiTheme";
import Boombox from "./Boombox";
import StereoTypesSticker from "./StereoTypesSticker";

const theme = THEMES.stereo_types;

// ─── Stereo Types' own identity onboarding ───
// The lightweight Stereo Types counterpart to components/ColorPicker.jsx
// (Project B) and TraitorsAliasPicker.jsx (Traitors) — no alias, no
// avatar collection, just a boombox color (reusing players.color as-is)
// plus, if this account has ever won a Stereo Types game before, a
// choice of which unlocked sticker (if any) to display this season. See
// sql/add-stereo-types-boombox.sql for why nothing can actually BE
// unlocked yet — this UI already fully supports it once something can.
export default function StereoTypesIdentityPicker({ player, allPlayers, userId, onPicked }) {
  const others = (allPlayers || []).filter((p) => p.id !== player.id);
  const takenColorSet = takenColors(others);
  const availableColors = PLAYER_COLORS.filter((c) => !takenColorSet.has(c.hex));

  const [color, setColor] = useState(player.color || null);
  const [stickerId, setStickerId] = useState(player.equippedSticker || player.equipped_sticker || null);
  const [unlockedIds, setUnlockedIds] = useState(null); // null = still loading
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchUnlockedStickerIds(userId).then(setUnlockedIds);
  }, [userId]);

  const unlockedStickers = STICKER_CATALOG.filter((s) => unlockedIds?.includes(s.id));

  const confirm = async () => {
    if (!color) return;
    setSaving(true);
    setError(null);
    const { data, error: dbError } = await supabase
      .from("players")
      .update({ color, equipped_sticker: stickerId })
      .eq("id", player.id)
      .select()
      .maybeSingle();
    setSaving(false);
    if (dbError) { setError("Couldn't save: " + dbError.message); return; }
    if (!data) { setError("Couldn't save — the update didn't apply."); return; }
    onPicked?.(data);
  };

  return (
    <Card style={{ marginBottom: 20, textAlign: "center", borderColor: theme.accent, background: theme.cardBg }}>
      <h3 style={{ color: theme.accent, margin: "0 0 4px", fontSize: 18, fontFamily: theme.font, letterSpacing: 0.5 }}>
        BUILD YOUR BOOMBOX
      </h3>
      <p style={{ color: theme.textMuted, fontSize: 12, margin: "0 0 16px", fontStyle: "italic" }}>
        This is how everyone spots you on the floor.
      </p>

      <div style={{ marginBottom: 16 }}>
        <Boombox color={color} stickerId={stickerId} label={player.name} size={200} />
      </div>

      {error && <p style={{ color: theme.danger, fontSize: 12, margin: "0 0 10px" }}>{error}</p>}

      <div style={{ color: theme.textMuted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
        Color
      </div>
      {availableColors.length === 0 ? (
        <p style={{ color: theme.danger, fontSize: 12, margin: "0 0 16px" }}>
          Every color's taken in this room right now — ask the host to free one up, or check back once a slot opens.
        </p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
          {PLAYER_COLORS.map((c) => {
            const isTaken = takenColorSet.has(c.hex);
            const isSelected = color === c.hex;
            return (
              <button
                key={c.hex}
                disabled={isTaken || saving}
                onClick={() => setColor(c.hex)}
                title={isTaken ? `${c.name} — taken` : c.name}
                style={{
                  aspectRatio: "1", borderRadius: 10, cursor: isTaken ? "not-allowed" : "pointer",
                  background: isTaken ? theme.inputBg : c.hex,
                  border: isSelected ? `3px solid ${theme.accent}` : isTaken ? `2px solid ${theme.border}` : `2px solid ${c.hex}`,
                  boxShadow: isTaken ? "none" : `0 0 12px ${c.hex}99`,
                  opacity: isTaken ? 0.35 : saving ? 0.6 : 1,
                }}
              >
                {isTaken && <span style={{ fontSize: 16, color: theme.textDim }}>✕</span>}
              </button>
            );
          })}
        </div>
      )}

      <div style={{ color: theme.textMuted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
        Sticker
      </div>
      {unlockedIds === null ? (
        <p style={{ color: theme.textDim, fontSize: 12, fontStyle: "italic", margin: "0 0 20px" }}>Checking what you've unlocked...</p>
      ) : unlockedStickers.length === 0 ? (
        <p style={{ color: theme.textDim, fontSize: 12, fontStyle: "italic", margin: "0 0 20px" }}>
          No stickers unlocked yet — win a game to earn one!
        </p>
      ) : (
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginBottom: 20 }}>
          <button
            onClick={() => setStickerId(null)}
            style={{
              width: 44, height: 44, borderRadius: 10, cursor: "pointer",
              background: theme.inputBg, border: stickerId === null ? `3px solid ${theme.accent}` : `2px solid ${theme.border}`,
              color: theme.textMuted, fontSize: 11,
            }}
          >
            None
          </button>
          {unlockedStickers.map((s) => (
            <button
              key={s.id}
              onClick={() => setStickerId(s.id)}
              title={s.label}
              style={{
                width: 44, height: 44, borderRadius: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                background: theme.inputBg, border: stickerId === s.id ? `3px solid ${theme.accent}` : `2px solid ${theme.border}`,
              }}
            >
              {/* Rendered in the theme's own accent yellow here (sitting
                  on a dark card) rather than Boombox.jsx's fixed dark
                  DETAIL_COLOR it uses once a sticker's actually badged
                  onto a speaker — same component, just a different fill
                  for a different background. */}
              <StereoTypesSticker stickerId={s.id} size={28} color={theme.accent} />
            </button>
          ))}
        </div>
      )}

      <Btn onClick={confirm} disabled={!color || saving}>{saving ? "Saving..." : "Confirm boombox"}</Btn>
    </Card>
  );
}
