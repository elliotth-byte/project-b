import { useState } from "react";
import { setGamePrefs } from "../lib/gamePrefs";

// ─── Game Preferences ───
// Extracted out of HelpPanel.jsx for the same reason as
// NotificationSettings.jsx — shared between the Options tab and the new
// pre-approval onboarding step (see OnboardingPreferences.jsx).
export default function GamePreferencesToggles({ player, onPrefsChanged, readOnly = false, compact = false }) {
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
    <div>
      <div style={{ display: "grid", gap: 10 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#f5f0ff", cursor: readOnly ? "default" : "pointer" }}>
          <input type="checkbox" checked={!!prefs.colorBlindMode} onChange={() => toggle("colorBlindMode")} disabled={saving || readOnly} />
          Colorblind-friendly colors — swaps to a colorblind-safe palette in every game that uses color as a signal
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#f5f0ff", cursor: readOnly ? "default" : "pointer" }}>
          <input type="checkbox" checked={!!prefs.swipeControls} onChange={() => toggle("swipeControls")} disabled={saving || readOnly} />
          Swipe controls — adds swipe-to-move alongside tap/arrows in any game with directional movement
        </label>
      </div>
      {!compact && (
        <p style={{ fontSize: 11, color: "#6b4f99", marginTop: 10, marginBottom: 0, fontStyle: "italic" }}>
          {readOnly ? "Shown for reference only — not editable from this preview." : "Saved to your player, not just this device — applies wherever you're logged in."}
        </p>
      )}
    </div>
  );
}
