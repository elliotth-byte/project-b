// ─── Eyes in the System — Eye Icons ───
// Same reasoning as components/games/ScavengerHuntIcons.jsx: hand-
// drawn SVG rather than emoji, so it themes cleanly and scales
// crisply on a shared TV as well as a phone-sized button. Four
// distinct iris colors are the whole visual language this game runs
// on — the almond shape, pupil, and highlight are identical across
// all four, so a player is always distinguishing by COLOR alone,
// never shape, matching the original "Bugs in the System" format's
// own reliance on color as the primary distinguishing feature.
const STROKE = "#0a0410";

export const EYE_COLORS = {
  red: "#ff3860",
  green: "#00ff9d",
  gold: "#ffd700",
  violet: "#c879ff",
};

// rotation lets the same eye read as "scattered, facing different
// directions" across a zone, the same visual variety the original
// bugs had from being drawn at different angles — purely decorative,
// never affects counting.
export function EyeIcon({ size = 28, color = "red", rotation = 0 }) {
  const iris = EYE_COLORS[color] || color;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" style={{ transform: `rotate(${rotation}deg)` }}>
      <path d="M2,16 Q16,2 30,16 Q16,30 2,16 Z" fill="#f5f0ff" stroke={STROKE} strokeWidth="1.5" />
      <circle cx="16" cy="16" r="8" fill={iris} stroke={STROKE} strokeWidth="1" />
      <circle cx="16" cy="16" r="3.5" fill={STROKE} />
      <circle cx="13.5" cy="13.5" r="1.6" fill="#ffffff" opacity="0.85" />
    </svg>
  );
}

// One shared zone-rendering component — used by the normal mode
// player, the Big Screen TV display, and the Big Screen phone
// controller (see that file's own comment for why the puzzle shows on
// both screens there), so the actual visual — the circuit backdrop,
// the eye scatter, the zone letter — never has three independently-
// maintained copies that could quietly drift out of sync with each
// other.
export function EyesZone({ zone, size = 260, highlight, onClick, disabled }) {
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      onClick={onClick} disabled={disabled}
      style={{
        position: "relative", width: size, height: size, borderRadius: 12, padding: 0, overflow: "hidden",
        background: "#150a28", border: `2px solid ${highlight ? "#00ff9d" : "#3d1f5c"}`,
        cursor: onClick && !disabled ? "pointer" : "default", display: "block",
      }}
    >
      <svg width="100%" height="100%" viewBox="0 0 100 100" style={{ position: "absolute", inset: 0 }}>
        <path d="M0,20 H100 M0,50 H100 M0,80 H100 M20,0 V100 M50,0 V100 M80,0 V100" stroke="#3d1f5c" strokeWidth="0.5" opacity="0.5" />
      </svg>
      {zone.eyes.map((eye, i) => (
        <div key={i} style={{ position: "absolute", left: `${eye.x}%`, top: `${eye.y}%`, transform: "translate(-50%, -50%)" }}>
          <EyeIcon size={size / 11} color={eye.color} rotation={eye.rotation} />
        </div>
      ))}
      <div style={{
        position: "absolute", bottom: 6, right: 8, fontSize: Math.max(16, size / 12), fontWeight: 800, color: "#f5f0ff",
        fontFamily: "'Orbitron', 'Segoe UI', sans-serif", textShadow: "0 0 6px #000",
      }}>
        {zone.zone}
      </div>
    </Wrapper>
  );
}
