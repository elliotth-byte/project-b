import { useState } from "react";
import { setGamePrefs } from "../../lib/gamePrefs";

// ─── Swipe Controls Callout ───
// Shown on any game with swipe-to-move support, for as long as the
// player doesn't have it turned on yet — calls out that the option
// exists (and that it's also available permanently from Options),
// while letting them turn it on immediately, right here, without
// leaving this challenge to go find the setting. onEnabled fires the
// instant the preference is actually saved, so the calling game can
// flip its own local swipeEnabled on right away, in this same
// session — without it, a player who just turned this on wouldn't see
// swipe actually work until a refresh picked up the newly-saved
// gamePrefs from the player prop.
export default function SwipeControlsCallout({ player, onEnabled }) {
  const [dismissed, setDismissed] = useState(false);
  const [enabling, setEnabling] = useState(false);

  if (dismissed) return null;

  const enable = async () => {
    setEnabling(true);
    const res = await setGamePrefs(player.id, { swipeControls: true });
    setEnabling(false);
    if (res.ok) onEnabled();
  };

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
      background: "rgba(0,217,255,0.1)", border: "1px solid #00d9ff", borderRadius: 8,
      padding: "8px 12px", marginBottom: 12, fontSize: 11.5,
    }}>
      <span style={{ color: "#00d9ff", flex: 1, minWidth: 180, textAlign: "left" }}>
        👆 Swipe controls are available for this game — turn them on here, or anytime from Options.
      </span>
      <button
        onClick={enable} disabled={enabling}
        style={{ background: "#00d9ff", border: "none", borderRadius: 6, color: "#05010f", fontSize: 11, fontWeight: 700, padding: "5px 10px", cursor: enabling ? "default" : "pointer" }}
      >
        {enabling ? "..." : "Turn On"}
      </button>
      <button onClick={() => setDismissed(true)} style={{ background: "none", border: "none", color: "#6b4f99", fontSize: 11, cursor: "pointer" }}>
        Dismiss
      </button>
    </div>
  );
}
