// ─── Balloono Icons (Greek reskin) ───
// Same hand-drawn SVG approach as components/games/
// ScavengerHuntIcons.jsx and EyesInTheSystemIcons.jsx. Reskinned from
// the original's monkey-and-water-balloon look to fit Panopticon's own
// Greek theme: a satyr (the classic goat-legged woodland trickster)
// replaces the monkey, and an amphora — a Greek clay water jar —
// replaces the balloon, bursting into the same cross-shaped water
// splash either way. The underlying mechanic is completely unchanged;
// this file is purely the visual layer.
const STROKE = "#241340";

// One tint per player slot (matches lib/games/balloonoData.js's own
// startPositionsFor order) — the satyr shape stays identical across
// every slot, only the fur/skin tint changes, so a player is always
// distinguishing "which satyr is mine" by color, the same way the
// original's differently-colored monkeys worked.
export const SATYR_COLORS = ["#c45c3c", "#3bb273", "#4a90d9", "#e6b800", "#b829ff", "#ff2d95", "#ff8c42", "#26c6da", "#8d6e63", "#7986cb"];

export function SatyrIcon({ size = 32, color = SATYR_COLORS[0], facing = "down", ghost = false }) {
  const flip = facing === "left" ? "scaleX(-1)" : "none";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" style={{ transform: flip, opacity: ghost ? 0.35 : 1 }}>
      <ellipse cx="16" cy="27" rx="7" ry="2.5" fill="#000" opacity="0.2" />
      {/* Goat legs */}
      <path d="M12,22 L10,28 L13,28 L14,23 Z" fill="#5a4632" stroke={STROKE} strokeWidth="0.8" />
      <path d="M20,22 L22,28 L19,28 L18,23 Z" fill="#5a4632" stroke={STROKE} strokeWidth="0.8" />
      {/* Torso */}
      <ellipse cx="16" cy="18" rx="7" ry="7" fill={color} stroke={STROKE} strokeWidth="1.2" />
      {/* Small curled horns */}
      <path d="M11,7 Q9,5 10,3" stroke="#6b4f33" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <path d="M21,7 Q23,5 22,3" stroke="#6b4f33" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      {/* Pointed ears */}
      <path d="M8,10 L5,7 L8,13 Z" fill={color} stroke={STROKE} strokeWidth="0.8" />
      <path d="M24,10 L27,7 L24,13 Z" fill={color} stroke={STROKE} strokeWidth="0.8" />
      {/* Head */}
      <circle cx="16" cy="9" r="6.5" fill="#f0c8a0" stroke={STROKE} strokeWidth="1.2" />
      <circle cx="13" cy="8.5" r="1.3" fill={STROKE} />
      <circle cx="19" cy="8.5" r="1.3" fill={STROKE} />
      <path d="M13.5,12 Q16,13.5 18.5,12" stroke={STROKE} strokeWidth="1" fill="none" strokeLinecap="round" />
      {/* Little beard tuft */}
      <path d="M14,13.5 Q16,16 18,13.5 L16,14.8 Z" fill="#8a6f4a" opacity="0.85" />
    </svg>
  );
}

export function GhostSatyrIcon({ size = 32, color = "#a68fd6" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" style={{ opacity: 0.5 }}>
      <path d="M16,3 C9,3 5,8 5,15 L5,27 L8,24 L11,27 L14,24 L16,27 L18,24 L21,27 L24,24 L27,27 L27,15 C27,8 23,3 16,3 Z" fill={color} stroke="#241340" strokeWidth="1" opacity="0.85" />
      <path d="M9,8 Q7,6 8,4" stroke={color} strokeWidth="1.4" fill="none" strokeLinecap="round" opacity="0.7" />
      <path d="M23,8 Q25,6 24,4" stroke={color} strokeWidth="1.4" fill="none" strokeLinecap="round" opacity="0.7" />
      <circle cx="12" cy="14" r="1.8" fill="#241340" />
      <circle cx="20" cy="14" r="1.8" fill="#241340" />
    </svg>
  );
}

export function AmphoraIcon({ size = 24, pulse = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" style={{ animation: pulse ? "balloono-pulse 0.5s ease-in-out infinite" : "none" }}>
      {/* Clay jar body */}
      <path d="M11,6 L21,6 L20,9 Q25,13 24,19 Q23,27 16,28 Q9,27 8,19 Q7,13 12,9 Z" fill="#c45c2e" stroke={STROKE} strokeWidth="1.2" />
      {/* Neck + rim */}
      <rect x="13" y="3" width="6" height="4" rx="1" fill="#a5451f" stroke={STROKE} strokeWidth="1" />
      {/* Handles */}
      <path d="M11,10 Q6,12 8,17" stroke="#a5451f" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M21,10 Q26,12 24,17" stroke="#a5451f" strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* Greek key decoration band */}
      <path d="M9,18 L23,18" stroke="#f0d9b5" strokeWidth="1.4" opacity="0.8" />
      <path d="M9,21 L11,21 L11,23 L13,23 L13,21 L15,21 L15,23 L17,23 L17,21 L19,21 L19,23 L21,23 L21,21 L23,21" stroke="#f0d9b5" strokeWidth="1" fill="none" opacity="0.7" />
      <style>{`@keyframes balloono-pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.12); } }`}</style>
    </svg>
  );
}

export function WaterSplashIcon({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <path d="M16,2 L20,14 L30,16 L20,18 L16,30 L12,18 L2,16 L12,14 Z" fill="#6ec3ff" stroke="#2a6bb0" strokeWidth="1" opacity="0.9" />
      <circle cx="16" cy="16" r="5" fill="#bfe4ff" opacity="0.8" />
    </svg>
  );
}

export function BubbleIcon({ size = 40, children }) {
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      {children}
      <svg width={size} height={size} viewBox="0 0 40 40" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        <circle cx="20" cy="20" r="18" fill="#8cc4f0" fillOpacity="0.28" stroke="#bfe4ff" strokeWidth="1.5" />
        <ellipse cx="14" cy="12" rx="4" ry="2.5" fill="#ffffff" opacity="0.55" />
      </svg>
    </div>
  );
}

export function BlockIcon({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      {/* Carved stone block, matching a Greek ruin theme better than a wooden crate */}
      <rect x="3" y="3" width="26" height="26" rx="2" fill="#c9beb0" stroke={STROKE} strokeWidth="1.2" />
      <rect x="3" y="3" width="26" height="26" rx="2" fill="none" stroke="#9c9082" strokeWidth="1" strokeDasharray="3 2" opacity="0.5" />
      <path d="M8,3 L8,29 M16,3 L16,29 M24,3 L24,29" stroke="#9c9082" strokeWidth="0.8" opacity="0.4" />
    </svg>
  );
}

const POWERUP_META = {
  speed: { color: "#ffd700", icon: "⚡" },
  balloon: { color: "#c45c2e", icon: "🏺" },
  range: { color: "#ff3860", icon: "✚" },
};

export function PowerupIcon({ type, size = 24 }) {
  const meta = POWERUP_META[type] || POWERUP_META.speed;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <circle cx="16" cy="16" r="13" fill={meta.color} fillOpacity="0.25" stroke={meta.color} strokeWidth="1.5" />
      <text x="16" y="21" fontSize="14" textAnchor="middle">{meta.icon}</text>
    </svg>
  );
}

// Backward-compatible aliases — kept so nothing importing the pre-
// reskin names breaks if this file is ever referenced before every
// caller gets updated in the same pass.
export const MonkeyIcon = SatyrIcon;
export const GhostMonkeyIcon = GhostSatyrIcon;
export const WaterBalloonIcon = AmphoraIcon;
export const MONKEY_COLORS = SATYR_COLORS;
