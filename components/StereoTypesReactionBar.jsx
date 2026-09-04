import { useState } from "react";

// Same quick-pick set components/ChatPanel.jsx's own reactions use —
// no reason for a different default set for the same gesture elsewhere
// in the same app.
const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];

// ─── Reaction bar for one revealed entry ───
// Pairs with lib/stereoTypesReactions.js — this is purely the UI: a row
// of emoji pill buttons (count + highlighted if this player's already
// picked it) plus a "+" picker for anything outside the quick set, same
// shape as components/ChatPanel.jsx's own per-message reaction row, cut
// down to just what a static (non-editable-message) revealed entry
// needs. `reactions` is one scope's worth of { [emoji]: [playerId,...] }
// for a single entryKey — the caller (e.g. StereoTypesASideResults.jsx)
// owns subscribing to the full scope and slicing out the one entry this
// bar is for.
export default function StereoTypesReactionBar({ reactions, myPlayerId, onToggle }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [customEmoji, setCustomEmoji] = useState("");
  const grouped = Object.entries(reactions || {})
    .map(([emoji, playerIds]) => ({ emoji, count: playerIds.length, mine: playerIds.includes(myPlayerId) }))
    .filter((g) => g.count > 0);

  const submitCustom = () => {
    // Same "count actual grapheme clusters, not UTF-16 units" reasoning
    // as ChatPanel.jsx's own custom-emoji input — a single visible emoji
    // can span several UTF-16 code units (skin tone modifiers, ZWJ
    // sequences), so trims to the first actual character rather than
    // the first couple of code units.
    const codePoints = [...customEmoji.trim()].slice(0, 4);
    if (codePoints.length === 0) return;
    onToggle(codePoints.join(""));
    setCustomEmoji("");
    setPickerOpen(false);
  };

  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
      {grouped.map((g) => (
        <button
          key={g.emoji}
          onClick={() => onToggle(g.emoji)}
          style={{
            display: "flex", alignItems: "center", gap: 4, fontSize: 12, padding: "3px 8px", borderRadius: 12,
            background: g.mine ? "rgba(244,196,48,0.18)" : "#0a0e18",
            border: `1px solid ${g.mine ? "#f4c430" : "#3d1f5c"}`, color: "#f5eddc", cursor: "pointer",
          }}
        >
          <span>{g.emoji}</span><span>{g.count}</span>
        </button>
      ))}
      <div style={{ position: "relative" }}>
        <button
          onClick={() => setPickerOpen((v) => !v)}
          title="React"
          style={{ fontSize: 12, padding: "3px 8px", borderRadius: 12, background: "#0a0e18", border: "1px solid #3d1f5c", color: "#6b6558", cursor: "pointer" }}
        >
          + 🙂
        </button>
        {pickerOpen && (
          <div style={{
            position: "absolute", bottom: "calc(100% + 4px)", left: 0, zIndex: 5,
            background: "#150a28", border: "1px solid #3d1f5c", borderRadius: 8, padding: 8,
            display: "flex", flexDirection: "column", gap: 6, minWidth: 160,
          }}>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {QUICK_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => { onToggle(emoji); setPickerOpen(false); }}
                  style={{ fontSize: 16, background: "none", border: "none", cursor: "pointer", padding: 2 }}
                >
                  {emoji}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              <input
                value={customEmoji}
                onChange={(e) => setCustomEmoji(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submitCustom(); }}
                placeholder="Any emoji..."
                style={{ flex: 1, background: "#0a0e18", border: "1px solid #2a3040", borderRadius: 6, color: "#f5eddc", fontSize: 12, padding: "4px 6px", minWidth: 0 }}
              />
              <button onClick={submitCustom} style={{ fontSize: 11, background: "none", border: "1px solid #3d1f5c", borderRadius: 6, color: "#a68fd6", cursor: "pointer", padding: "0 8px" }}>Add</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
