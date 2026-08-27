import { useState } from "react";
import { Card } from "./ui";
import { supabase } from "../lib/supabaseClient";
import NotificationSettings from "./NotificationSettings";
import GamePreferencesToggles from "./GamePreferencesToggles";

// Reference grid the picker itself renders at — doesn't need to match
// whatever grid size an actual future Torched battle ends up using
// (that varies with participant count — see torchedData.js's
// gridSizeFor), since what's actually saved is a FRACTION of whichever
// grid this preview happens to show, scaled to fit the real battle grid
// at placement time (see torchedData.js's presetToPlacement). This is
// just a reasonable size to pick on, nothing more.
const PRESET_PREVIEW_SIZE = 10;
const PRESET_MARKER_LENGTH = 3; // mirrors torchedData.js's MARKER_LENGTH, just for the picker's own preview

// ─── Player options ───
// Split out of the old HelpPanel.jsx into its own tab — the gear icon
// this used to hide behind (for music specifically) already turned out
// to confuse players once, and burying every actual SETTING inside a
// tab literally labeled "Help" had the same problem at a larger scale.
// Music, Notifications, Game Preferences, the Torched hiding-spot
// preset, and leaving the game all live here now; Rules and the
// install/inactivity info stay on Help, which is purely informational.
// NotificationSettings and GamePreferencesToggles are shared with
// OnboardingPreferences.jsx — same components, same logic, just shown
// at a different point in a player's time with the app.
export default function OptionsPanel({ gameId, player, onPrefsChanged, onQuit, quitBusy, readOnly = false, musicPortalRef }) {
  const [torchedPreset, setTorchedPreset] = useState(player?.torchedPreset || null);
  const [presetRow, setPresetRow] = useState(null);
  const [presetCol, setPresetCol] = useState(null);
  const [presetOrientation, setPresetOrientation] = useState("horizontal");
  const [presetSaving, setPresetSaving] = useState(false);

  const savePreset = async (row, col, orientation) => {
    setPresetSaving(true);
    const preset = { rowFrac: row / (PRESET_PREVIEW_SIZE - 1), colFrac: col / (PRESET_PREVIEW_SIZE - 1), orientation };
    const { error } = await supabase.from("players").update({ torched_preset: preset }).eq("id", player.id);
    setPresetSaving(false);
    if (!error) { setTorchedPreset(preset); setPresetRow(null); setPresetCol(null); }
  };

  const clearPreset = async () => {
    setPresetSaving(true);
    const { error } = await supabase.from("players").update({ torched_preset: null }).eq("id", player.id);
    setPresetSaving(false);
    if (!error) setTorchedPreset(null);
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {/* The music player's actual controls (see MusicPlayer.jsx) get
          portaled into this div — MusicPlayer itself stays mounted
          outside this tab entirely (see pages/play.jsx), so the audio
          engine keeps running even when this isn't the active tab. */}
      <div ref={musicPortalRef} />

      <Card>
        <div style={{ fontSize: 12, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
          🔔 Notifications
        </div>
        <NotificationSettings gameId={gameId} player={player} readOnly={readOnly} />
      </Card>

      {player && (
        <Card>
          <div style={{ fontSize: 12, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
            🎮 Game Preferences
          </div>
          <GamePreferencesToggles player={player} onPrefsChanged={onPrefsChanged} readOnly={readOnly} />
        </Card>
      )}

      {player && !readOnly && (
        <Card>
          <div style={{ fontSize: 12, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
            🔥 Torched — Preset Your Hiding Spot
          </div>
          <p style={{ fontSize: 12, color: "#a68fd6", margin: "0 0 12px" }}>
            Pick where you'd want to hide ahead of time, so the moment a Torched battle starts, you're already placed — no waiting on everyone to show up and place manually. Set this whenever, it applies to the next Torched battle whenever it comes up.
          </p>
          {torchedPreset && presetRow === null ? (
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: 12, color: "#00ff9d", margin: "0 0 10px" }}>✓ Preset saved ({torchedPreset.orientation})</p>
              <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                <button onClick={() => setPresetRow(0)} style={{ background: "none", border: "1px solid #3d1f5c", borderRadius: 6, padding: "6px 14px", color: "#a68fd6", fontSize: 12, cursor: "pointer" }}>
                  Change
                </button>
                <button onClick={clearPreset} disabled={presetSaving} style={{ background: "none", border: "1px solid #ff3860", borderRadius: 6, padding: "6px 14px", color: "#ff3860", fontSize: 12, cursor: presetSaving ? "default" : "pointer" }}>
                  {presetSaving ? "..." : "Clear"}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: "center" }}>
              <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 10 }}>
                <button onClick={() => setPresetOrientation("horizontal")} style={{
                  padding: "6px 14px", borderRadius: 6, cursor: "pointer",
                  background: presetOrientation === "horizontal" ? "rgba(255,45,149,0.2)" : "#0d0618",
                  border: `2px solid ${presetOrientation === "horizontal" ? "#ff2d95" : "#3d1f5c"}`,
                  color: presetOrientation === "horizontal" ? "#ff2d95" : "#a68fd6", fontSize: 12, fontWeight: 700,
                }}>↔ Horizontal</button>
                <button onClick={() => setPresetOrientation("vertical")} style={{
                  padding: "6px 14px", borderRadius: 6, cursor: "pointer",
                  background: presetOrientation === "vertical" ? "rgba(255,45,149,0.2)" : "#0d0618",
                  border: `2px solid ${presetOrientation === "vertical" ? "#ff2d95" : "#3d1f5c"}`,
                  color: presetOrientation === "vertical" ? "#ff2d95" : "#a68fd6", fontSize: 12, fontWeight: 700,
                }}>↕ Vertical</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${PRESET_PREVIEW_SIZE}, 1fr)`, gap: 3, maxWidth: 260, margin: "0 auto 12px" }}>
                {Array.from({ length: PRESET_PREVIEW_SIZE * PRESET_PREVIEW_SIZE }, (_, i) => {
                  const r = Math.floor(i / PRESET_PREVIEW_SIZE), c = i % PRESET_PREVIEW_SIZE;
                  const previewCells = presetRow !== null && presetCol !== null
                    ? (presetOrientation === "horizontal"
                      ? [[presetRow, presetCol], [presetRow, presetCol + 1], [presetRow, presetCol + 2]]
                      : [[presetRow, presetCol], [presetRow + 1, presetCol], [presetRow + 2, presetCol]])
                    : [];
                  const inPreview = previewCells.some(([pr, pc]) => pr === r && pc === c);
                  const previewValid = previewCells.every(([pr, pc]) => pr >= 0 && pr < PRESET_PREVIEW_SIZE && pc >= 0 && pc < PRESET_PREVIEW_SIZE);
                  return (
                    <button
                      key={i}
                      onClick={() => { setPresetRow(r); setPresetCol(c); }}
                      style={{
                        aspectRatio: "1", borderRadius: 3, cursor: "pointer", padding: 0,
                        background: inPreview ? (previewValid ? "rgba(0,255,157,0.35)" : "rgba(255,56,96,0.35)") : "#0d0618",
                        border: `1px solid ${inPreview ? (previewValid ? "#00ff9d" : "#ff3860") : "#3d1f5c"}`,
                      }}
                    />
                  );
                })}
              </div>
              <button
                onClick={() => savePreset(presetRow, presetCol, presetOrientation)}
                disabled={presetRow === null || presetCol + (presetOrientation === "horizontal" ? PRESET_MARKER_LENGTH - 1 : 0) >= PRESET_PREVIEW_SIZE || presetRow + (presetOrientation === "vertical" ? PRESET_MARKER_LENGTH - 1 : 0) >= PRESET_PREVIEW_SIZE || presetSaving}
                style={{
                  padding: "8px 20px", borderRadius: 8, cursor: "pointer",
                  background: presetRow === null ? "#3d1f5c" : "linear-gradient(135deg, #ff2d95, #b829ff)",
                  border: "none", color: presetRow === null ? "#a68fd6" : "#05010f", fontSize: 13, fontWeight: 700,
                }}
              >
                {presetSaving ? "Saving..." : "Save Preset"}
              </button>
              {torchedPreset && (
                <p style={{ marginTop: 8 }}>
                  <button onClick={() => { setPresetRow(null); setPresetCol(null); }} style={{ background: "none", border: "none", color: "#6b4f99", fontSize: 11, cursor: "pointer" }}>
                    ← cancel, keep existing preset
                  </button>
                </p>
              )}
            </div>
          )}
        </Card>
      )}

      {onQuit && !readOnly && (
        <Card style={{ borderColor: "rgba(255,56,96,0.4)", textAlign: "center" }}>
          <div style={{ fontSize: 12, color: "#ff3860", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
            ⚠️ Leave the Game
          </div>
          <p style={{ fontSize: 12, color: "#a68fd6", margin: "0 0 12px" }}>
            This removes you from the season entirely — it can't be undone, and you can't rejoin.
          </p>
          <button
            onClick={onQuit}
            disabled={quitBusy}
            style={{
              background: "none", border: "1px solid #ff3860", borderRadius: 8, padding: "8px 16px",
              color: "#ff3860", fontSize: 13, fontWeight: 700, cursor: quitBusy ? "default" : "pointer",
            }}
          >
            {quitBusy ? "Leaving..." : "🚪 Permanently Quit"}
          </button>
        </Card>
      )}
    </div>
  );
}
