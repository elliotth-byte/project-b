// ─── Eyes of the Villa — Mask Icons ───
// Traitors' own reskin of Panopticon's "Eyes in the System" (see
// lib/eyesVillaData.js for the reused round-generation engine): the
// all-seeing panopticon eye becomes a Venetian masquerade half-mask, and
// the three "zones" become three galleries of the villa. Same hand-drawn
// SVG approach as components/games/EyesInTheSystemIcons.jsx's EyeIcon —
// a player is always distinguishing by COLOR alone (the same four colors
// already used elsewhere in this app for house/status accents), never
// shape, which is what the underlying game actually tests.
const STROKE = "#140d24";

// Keys match lib/games/eyesInTheSystemData.js's own EYE_COLOR_KEYS
// exactly ("red", "green", "gold", "violet") — that engine is reused
// as-is (see lib/eyesVillaData.js), so a round's eye.color/targetColor
// values are always one of these four; only the hex each one RENDERS as
// changes here, to Traitors' own gold/navy palette instead of
// Panopticon's neon.
export const MASK_COLORS = {
  red: "#c45c3c",
  green: "#7a9a5c",
  gold: "#c9a84c",
  violet: "#7c3aed",
};

export function MaskIcon({ size = 28, color = "gold", rotation = 0 }) {
  const fill = MASK_COLORS[color] || color;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" style={{ transform: `rotate(${rotation}deg)` }}>
      {/* Half-mask face shape, swept brows, no mouth (classic Venetian silhouette) */}
      <path
        d="M16,4 C7,4 2,10 2,16 C2,21 6,25 10,24 C12,23.5 11,19 13,18 C14.5,17.3 17.5,17.3 19,18 C21,19 20,23.5 22,24 C26,25 30,21 30,16 C30,10 25,4 16,4 Z"
        fill={fill} stroke={STROKE} strokeWidth="1.3"
      />
      <path d="M6,14 Q9,10 13,13" stroke={STROKE} strokeWidth="1.3" fill="none" strokeLinecap="round" />
      <path d="M26,14 Q23,10 19,13" stroke={STROKE} strokeWidth="1.3" fill="none" strokeLinecap="round" />
      <ellipse cx="10.5" cy="15.5" rx="2.6" ry="1.8" fill="#140d24" />
      <ellipse cx="21.5" cy="15.5" rx="2.6" ry="1.8" fill="#140d24" />
      {/* Small filigree accent, purely decorative */}
      <path d="M16,24 L16,28 M13,27 L19,27" stroke={STROKE} strokeWidth="1" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}

// Shared gallery-render component — the Traitors counterpart to
// EyesInTheSystemIcons.jsx's EyesZone, same structure (circuit-grid
// backdrop, scattered icons, corner label) just restyled to the gold/
// navy Traitors palette instead of Panopticon's violet neon.
export function MaskGallery({ zone, size = 240, highlight, onClick, disabled }) {
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      onClick={onClick} disabled={disabled}
      style={{
        position: "relative", width: size, height: size, borderRadius: 10, padding: 0, overflow: "hidden",
        background: "#0a1020", border: `2px solid ${highlight ? "#7a9a5c" : "#253550"}`,
        cursor: onClick && !disabled ? "pointer" : "default", display: "block",
      }}
    >
      <svg width="100%" height="100%" viewBox="0 0 100 100" style={{ position: "absolute", inset: 0 }}>
        <path d="M0,20 H100 M0,50 H100 M0,80 H100 M20,0 V100 M50,0 V100 M80,0 V100" stroke="#253550" strokeWidth="0.5" opacity="0.6" />
      </svg>
      {zone.eyes.map((mask, i) => (
        <div key={i} style={{ position: "absolute", left: `${mask.x}%`, top: `${mask.y}%`, transform: "translate(-50%, -50%)" }}>
          <MaskIcon size={size / 11} color={mask.color} rotation={mask.rotation} />
        </div>
      ))}
      <div style={{
        position: "absolute", bottom: 6, right: 8, fontSize: Math.max(16, size / 12), fontWeight: 700, color: "#f0e6d3",
        fontFamily: "'Palatino Linotype', Palatino, Georgia, serif", textShadow: "0 0 6px #000",
      }}>
        {zone.zone}
      </div>
    </Wrapper>
  );
}
