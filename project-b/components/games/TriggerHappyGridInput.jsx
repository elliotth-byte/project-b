import { useState } from "react";
import { RELICS } from "../../lib/games/hermesGraspData";

// ─── Trigger Happy — shared tap-to-place grid ───
// Used by both the regular mode's replication grid
// (components/games/TriggerHappyPlayer.jsx) and the Big Screen duel's
// replication grid (components/games/TriggerHappyTvPlayer.jsx) — pulled
// out once since the interaction is identical in both: tap a relic in
// the palette to select it, then tap an empty grid cell to place it
// there; tapping an already-filled cell clears it back to empty
// (whether or not a relic is currently selected) rather than requiring
// a separate "clear" mode, which keeps a misplaced guess a single tap
// to fix.
export default function TriggerHappyGridInput({ grid, onChange, cols, disabled = false, cellSize = 52 }) {
  const [selected, setSelected] = useState(null);

  const tapCell = (i) => {
    if (disabled) return;
    if (grid[i]) {
      const next = [...grid];
      next[i] = null;
      onChange(next);
      return;
    }
    if (!selected) return;
    const next = [...grid];
    next[i] = selected;
    onChange(next);
  };

  return (
    <div>
      <div
        style={{
          display: "grid", gridTemplateColumns: `repeat(${cols}, ${cellSize}px)`, gap: 5,
          margin: "0 auto 14px", width: "fit-content", background: "#05010f",
          border: "2px solid #3d1f5c", borderRadius: 8, padding: 6,
        }}
      >
        {grid.map((relicId, i) => {
          const relic = relicId ? RELICS.find((r) => r.id === relicId) : null;
          return (
            <button
              key={i}
              onClick={() => tapCell(i)}
              disabled={disabled}
              style={{
                width: cellSize, height: cellSize, fontSize: cellSize * 0.42, borderRadius: 6,
                cursor: disabled ? "default" : "pointer",
                background: relic ? "rgba(0,255,157,0.12)" : "linear-gradient(160deg, #1a1330, #0d0618)",
                border: `2px solid ${relic ? "#00ff9d" : "#3d1f5c"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              {relic ? relic.emoji : ""}
            </button>
          );
        })}
      </div>

      <p style={{ color: "#a68fd6", fontSize: 11, margin: "0 0 8px", fontStyle: "italic" }}>
        Tap a relic below, then tap a cell to place it. Tap a filled cell to clear it.
      </p>
      <div style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
        {RELICS.map((r) => (
          <button
            key={r.id}
            onClick={() => !disabled && setSelected(r.id)}
            disabled={disabled}
            style={{
              width: 44, height: 44, fontSize: 20, borderRadius: 8, cursor: disabled ? "default" : "pointer",
              background: selected === r.id ? "rgba(255,45,149,0.2)" : "#0d0618",
              border: `2px solid ${selected === r.id ? "#ff2d95" : "#3d1f5c"}`,
            }}
            title={r.name}
          >
            {r.emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
