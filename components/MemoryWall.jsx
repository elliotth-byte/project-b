import { colorFor } from "../lib/playerColors";

// A grid of big, chunky tiles — one per candidate — used for every "pick
// a player" moment (nominations, exile votes, finale votes). When the
// season has an avatar set for a player (see lib/avatarIdentity.js's
// effectiveAvatarUrl), it fills the WHOLE tile like a trading card, with
// the name overlaid at the bottom — not a small circle, so the actual
// artwork actually reads at this size. Falls back to the original
// centered color-swatch-plus-name layout when there's no avatar.
// candidates: [{ playerId, name }]. players: full roster (for color/
// avatar lookup). hideNameLabels: true when the season's avatar
// collection already has each character's name baked into the image
// itself (the Default Gods set specifically — see the name banner on
// each portrait), so overlaying our own label on top would just be
// showing the same name twice. Only suppresses the label on tiles that
// actually have an avatar photo — the color-swatch fallback (no avatar
// set for that player) always keeps its label regardless, since there's
// nothing else identifying who it is.
export default function MemoryWall({ candidates, players, selectedId, onSelect, disabledIds = [], hideNameLabels = false }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
      {candidates.map((c) => {
        const color = colorFor(players, c.playerId);
        const avatarUrl = (players || []).find((p) => p.id === c.playerId)?.effectiveAvatarUrl;
        const selected = selectedId === c.playerId;
        const disabled = disabledIds.includes(c.playerId);

        if (avatarUrl) {
          return (
            <button
              key={c.playerId}
              disabled={disabled}
              onClick={() => onSelect(c.playerId)}
              style={{
                aspectRatio: "1", borderRadius: 14, cursor: disabled ? "not-allowed" : "pointer",
                border: `4px solid ${selected ? color : "#3d1f5c"}`,
                boxShadow: selected ? `0 0 24px ${color}bb` : "none",
                opacity: disabled ? 0.35 : 1,
                transition: "box-shadow 0.15s",
                position: "relative", overflow: "hidden", padding: 0, background: "#0d0618",
              }}
            >
              <img
                src={avatarUrl} alt=""
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
              />
              {!hideNameLabels && (
                <div style={{
                  position: "absolute", left: 0, right: 0, bottom: 0,
                  background: "linear-gradient(to top, rgba(5,1,15,0.92), rgba(5,1,15,0.55) 60%, transparent)",
                  padding: "18px 8px 8px",
                }}>
                  <span style={{
                    display: "block", fontSize: 15, fontWeight: 900, color: selected ? color : "#f5f0ff",
                    textTransform: "uppercase", letterSpacing: 0.5, textAlign: "center",
                    textShadow: selected ? `0 0 10px ${color}` : "0 1px 3px rgba(0,0,0,0.8)",
                  }}>
                    {c.name}
                  </span>
                </div>
              )}
            </button>
          );
        }

        return (
          <button
            key={c.playerId}
            disabled={disabled}
            onClick={() => onSelect(c.playerId)}
            style={{
              aspectRatio: "1", borderRadius: 14, cursor: disabled ? "not-allowed" : "pointer",
              background: selected ? `linear-gradient(160deg, ${color}44, ${color}22)` : "#0d0618",
              border: `4px solid ${selected ? color : "#3d1f5c"}`,
              boxShadow: selected ? `0 0 24px ${color}bb, inset 0 0 20px ${color}33` : "none",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8,
              opacity: disabled ? 0.35 : 1,
              transition: "transform 0.1s, box-shadow 0.15s",
              padding: 8,
            }}
          >
            <div style={{
              width: 40, height: 40, borderRadius: "50%", background: color,
              boxShadow: `0 0 14px ${color}cc`, border: "2px solid rgba(255,255,255,0.5)",
            }} />
            <span style={{
              fontSize: 15, fontWeight: 900, color: selected ? color : "#f5f0ff",
              textTransform: "uppercase", letterSpacing: 0.5, textAlign: "center",
              textShadow: selected ? `0 0 10px ${color}` : "none",
            }}>
              {c.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
