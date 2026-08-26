import { colorFor } from "../lib/playerColors";

// ─── Player Memory Wall ───
// The classic reality-show "wall of houseguest photos, turned black-and-
// white once someone's out" — same tile size/style as the interactive
// MemoryWall.jsx used for actual votes (deliberately, so it visually
// reads as the same wall, just non-interactive and showing EVERYONE, not
// just this moment's candidates), but this one is a pure gallery: no
// selection, no click handlers, alive and eliminated players alike.
// players: full roster, already alias/avatar-resolved same as everywhere
// else (see lib/avatarIdentity.js / lib/playerIdentity.js).
// hideNameLabels: see MemoryWall.jsx's matching prop — suppresses the
// overlaid name only on avatar tiles (the Default Gods collection has
// each name baked into the portrait itself), never on the color-swatch
// fallback, and never the "OUT" badge, which is separate information
// the photo doesn't carry.
export default function PlayerMemoryWall({ players, hideNameLabels = false, winnerIds, nomineeIds }) {
  const roster = [...(players || [])].sort((a, b) => {
    if (a.alive !== b.alive) return a.alive ? -1 : 1; // alive players first
    return (a.display_name || "").localeCompare(b.display_name || "");
  });

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
      {roster.map((p) => {
        const color = colorFor(players, p.id);
        const avatarUrl = p.effectiveAvatarUrl;
        const eliminated = !p.alive;
        const grayscale = eliminated ? "grayscale(1) brightness(0.6)" : "none";

        // Gold: has won at least one battle this season (cumulative —
        // see lib/memoryWallGlow.js for why this has to be cumulative
        // rather than "most recent" for the combined case below to ever
        // actually happen). Red: named in the CURRENT round's exile.
        // Orange: both at once — a past winner who's now nominated,
        // since immunity from an earlier win doesn't protect them later.
        // Applied regardless of eliminated status — a past win is still
        // meaningful history even for someone who's since been voted
        // out, just layered under the existing grayscale/dimmed look
        // rather than replacing it.
        //
        // Rendered as an INTERIOR glow, deliberately never touching the
        // border — the border's own color is a player's identity (their
        // own chosen or assigned color, same as everywhere else in the
        // app), and swapping it out for gold/red/orange was overwriting
        // that identity rather than layering on top of it. This is a
        // separate overlay div, placed AFTER the avatar image in the
        // DOM (not just a box-shadow on the outer tile) specifically so
        // it reliably paints ON TOP of the image rather than risking
        // being visually covered by it — an inset box-shadow on the
        // outer container alone isn't guaranteed to show through an
        // absolutely-positioned child that covers the whole tile.
        const isWinner = winnerIds?.has(p.id);
        const isNominee = nomineeIds?.has(p.id);
        const glowColor = isWinner && isNominee ? "#ff9f4d" : isWinner ? "#ffd700" : isNominee ? "#ff3860" : null;
        const borderColor = eliminated ? "#3d1f5c" : color;
        const glowOverlay = glowColor
          ? <div style={{ position: "absolute", inset: 0, borderRadius: "inherit", boxShadow: `inset 0 0 20px 6px ${glowColor}`, pointerEvents: "none" }} />
          : null;

        if (avatarUrl) {
          return (
            <div
              key={p.id}
              style={{
                aspectRatio: "1", borderRadius: 14,
                border: `4px solid ${borderColor}`,
                opacity: eliminated ? 0.75 : 1,
                position: "relative", overflow: "hidden", background: "#0d0618",
              }}
            >
              <img
                src={avatarUrl} alt=""
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: grayscale }}
              />
              {!hideNameLabels && (
                <div style={{
                  position: "absolute", left: 0, right: 0, bottom: 0,
                  background: "linear-gradient(to top, rgba(5,1,15,0.92), rgba(5,1,15,0.55) 60%, transparent)",
                  padding: "18px 8px 8px",
                }}>
                  <span style={{
                    display: "block", fontSize: 15, fontWeight: 900, color: eliminated ? "#6b4f99" : "#f5f0ff",
                    textTransform: "uppercase", letterSpacing: 0.5, textAlign: "center",
                    textDecoration: eliminated ? "line-through" : "none",
                    textShadow: "0 1px 3px rgba(0,0,0,0.8)",
                  }}>
                    {p.display_name}
                  </span>
                </div>
              )}
              {eliminated && (
                <div style={{
                  position: "absolute", top: 6, right: 6, background: "rgba(5,1,15,0.85)",
                  borderRadius: 6, padding: "2px 6px", fontSize: 9, color: "#a68fd6", fontWeight: 700,
                }}>
                  {p.elimination_type === "removed_inactivity" ? "INACTIVE" : "OUT"}
                </div>
              )}
              {glowOverlay}
            </div>
          );
        }

        return (
          <div
            key={p.id}
            style={{
              aspectRatio: "1", borderRadius: 14,
              background: "#0d0618",
              border: `4px solid ${borderColor}`,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8,
              opacity: eliminated ? 0.55 : 1,
              padding: 8,
              position: "relative",
            }}
          >
            <div style={{
              width: 40, height: 40, borderRadius: "50%", background: color,
              boxShadow: eliminated ? "none" : `0 0 14px ${color}cc`, border: "2px solid rgba(255,255,255,0.5)",
              filter: grayscale,
            }} />
            <span style={{
              fontSize: 15, fontWeight: 900, color: eliminated ? "#6b4f99" : "#f5f0ff",
              textTransform: "uppercase", letterSpacing: 0.5, textAlign: "center",
              textDecoration: eliminated ? "line-through" : "none",
            }}>
              {p.display_name}
            </span>
            {glowOverlay}
          </div>
        );
      })}
    </div>
  );
}
