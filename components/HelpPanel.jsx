import { useState } from "react";
import { Card } from "./ui";
import { setGamePrefs } from "../lib/gamePrefs";

const RULES_URL = "https://docs.google.com/document/d/1F8Hqc8GatMDt7t6qfDTDl0w2oR_Avi1WN_0apSH2PfY/edit?tab=t.0";

// ─── Player help ───
// A link straight to the rules doc, how to get this page onto an
// iPhone/iPad home screen as an app-like icon, and Game Preferences —
// player-level settings (see lib/gamePrefs.js) that every game respects:
// colorblind-safe palettes wherever color is a meaningful signal, and
// swipe controls alongside tap/arrows in anything with directional
// movement. Persisted to the player's own row, not just this device.
export default function HelpPanel({ player, onPrefsChanged, onReplayTour }) {
  const [prefs, setPrefs] = useState(player?.gamePrefs || {});
  const [saving, setSaving] = useState(false);

  const toggle = async (key) => {
    if (!player) return;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    setSaving(true);
    const res = await setGamePrefs(player.id, { [key]: next[key] });
    setSaving(false);
    if (res.ok) onPrefsChanged?.(res.prefs);
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <Card style={{ textAlign: "center" }}>
        <a
          href={RULES_URL} target="_blank" rel="noopener noreferrer"
          style={{
            display: "inline-block", background: "linear-gradient(135deg, #ff2d95, #b829ff)",
            color: "#05010f", borderRadius: 8, padding: "10px 20px", fontSize: 14, fontWeight: 700,
            textDecoration: "none",
          }}
        >
          📖 Read the Rules
        </a>
      </Card>

      {onReplayTour && (
        <Card style={{ textAlign: "center" }}>
          <button
            onClick={onReplayTour}
            style={{
              background: "none", border: "1px solid #3d1f5c", borderRadius: 8, padding: "8px 16px",
              color: "#a68fd6", fontSize: 13, cursor: "pointer",
            }}
          >
            🧭 Replay Navigation Tour
          </button>
        </Card>
      )}

      {player && (
        <Card>
          <div style={{ fontSize: 12, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
            🎮 Game Preferences
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#f5f0ff", cursor: "pointer" }}>
              <input type="checkbox" checked={!!prefs.colorBlindMode} onChange={() => toggle("colorBlindMode")} disabled={saving} />
              Colorblind-friendly colors — swaps to a colorblind-safe palette in every game that uses color as a signal
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#f5f0ff", cursor: "pointer" }}>
              <input type="checkbox" checked={!!prefs.swipeControls} onChange={() => toggle("swipeControls")} disabled={saving} />
              Swipe controls — adds swipe-to-move alongside tap/arrows in any game with directional movement
            </label>
          </div>
          <p style={{ fontSize: 11, color: "#6b4f99", marginTop: 10, marginBottom: 0, fontStyle: "italic" }}>
            Saved to your player, not just this device — applies wherever you're logged in.
          </p>
        </Card>
      )}

      <Card>
        <div style={{ fontSize: 12, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
          📱 Add to Home Screen (iPhone/iPad)
        </div>
        <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: "#f5f0ff", lineHeight: 1.8 }}>
          <li>Open this page in <strong>Safari</strong> (not another app's built-in browser).</li>
          <li>Tap the <strong>Share</strong> icon (square with an arrow pointing up) in the toolbar.</li>
          <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
          <li>Tap <strong>Add</strong> in the top corner.</li>
        </ol>
        <p style={{ fontSize: 12, color: "#6b4f99", marginTop: 10, marginBottom: 0, fontStyle: "italic" }}>
          You'll get an icon that opens straight to the game — no need to keep finding the link.
        </p>
      </Card>
    </div>
  );
}
