import { colorFor } from "../lib/playerColors";

// A grid of big, chunky tiles — one per candidate — used for every "pick
// a player" moment (nominations, exile votes, finale votes). Shows an
// avatar image when the season has one set for that player (see
// lib/avatarIdentity.js's effectiveAvatarUrl), falling back to their
// color swatch otherwise — the original, always-available default.
// candidates: [{ playerId, name }]. players: full roster (for color/
// avatar lookup).
export default function MemoryWall({ candidates, players, selectedId, onSelect, disabledIds = [] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
      {candidates.map((c) => {
        const color = colorFor(players, c.playerId);
        const avatarUrl = (players || []).find((p) => p.id === c.playerId)?.effectiveAvatarUrl;
        const selected = selectedId === c.playerId;
        const disabled = disabledIds.includes(c.playerId);
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
            {avatarUrl ? (
              <img
                src={avatarUrl} alt=""
                style={{
                  width: 64, height: 64, borderRadius: "50%", objectFit: "cover",
                  boxShadow: `0 0 14px ${color}cc`, border: "2px solid rgba(255,255,255,0.5)",
                }}
              />
            ) : (
              <div style={{
                width: 40, height: 40, borderRadius: "50%", background: color,
                boxShadow: `0 0 14px ${color}cc`, border: "2px solid rgba(255,255,255,0.5)",
              }} />
            )}
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
