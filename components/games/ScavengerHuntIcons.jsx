// ─── Scavenger Hunt Icons ───
// Hand-drawn SVG glyphs for each of the 8 offering types (see
// lib/games/scavengerHuntData.js's OFFERING_TYPES) plus a temple and
// an Olympus glyph for the location pickers — same reasoning as
// components/games/RelicIcons.jsx (Hermes' Grasp) and
// components/games/PegasusFlightPlayer.jsx's own hand-built shapes:
// real vector art themes cleanly at any size and scales crisply, where
// a plain text label or a borrowed emoji can't. Each accepts a `size`
// prop (defaults to 28) since these get used at very different scales
// (a small collection-strip checkmark vs. a large item-choice button).

const STROKE = "#241340";

export function GoldenFleeceIcon({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <path d="M9,10 Q6,14 8,18 Q6,22 10,25 Q16,28 22,24 Q26,20 24,15 Q26,10 21,8 Q16,5 9,10 Z" fill="#ffd700" stroke={STROKE} strokeWidth="1" />
      {[[11, 13], [15, 11], [19, 13], [12, 18], [17, 17], [21, 18], [14, 22], [19, 22]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2" fill="#fff3b0" stroke={STROKE} strokeWidth="0.5" />
      ))}
    </svg>
  );
}

export function AmbrosiaIcon({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <path d="M11,10 L21,10 L20,14 Q22,17 21,22 Q20,27 16,27 Q12,27 11,22 Q10,17 12,14 Z" fill="#c879ff" stroke={STROKE} strokeWidth="1" />
      <ellipse cx="16" cy="10" rx="5" ry="2" fill="#e0d4ff" stroke={STROKE} strokeWidth="1" />
      <path d="M13,16 Q16,18 19,16" stroke="#fff3b0" strokeWidth="1" fill="none" opacity="0.7" />
      <circle cx="24" cy="9" r="1.3" fill="#fff3b0" />
      <circle cx="21" cy="6" r="1" fill="#fff3b0" />
    </svg>
  );
}

export function LaurelWreathIcon({ size = 28 }) {
  const leafPair = (cx, cy, angle) => (
    <g transform={`translate(${cx},${cy}) rotate(${angle})`}>
      <ellipse cx="-3" cy="0" rx="3" ry="1.4" fill="#3bb273" stroke={STROKE} strokeWidth="0.5" />
      <ellipse cx="3" cy="0" rx="3" ry="1.4" fill="#3bb273" stroke={STROKE} strokeWidth="0.5" />
    </g>
  );
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * 300 - 150;
    const rad = (a * Math.PI) / 180;
    pts.push({ x: 16 + Math.cos(rad) * 10, y: 16 + Math.sin(rad) * 10, angle: a + 90 });
  }
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      {pts.map((p, i) => <g key={i}>{leafPair(p.x, p.y, p.angle)}</g>)}
      <circle cx="16" cy="16" r="2" fill="#ffd700" stroke={STROKE} strokeWidth="0.6" />
    </svg>
  );
}

export function OliveBranchIcon({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <path d="M6,24 Q16,20 26,8" stroke="#7a5a3a" strokeWidth="2" fill="none" strokeLinecap="round" />
      {[[9, 21], [13, 18], [17, 14], [21, 11]].map(([x, y], i) => (
        <ellipse key={i} cx={x} cy={y - 3} rx="3.2" ry="1.6" fill="#6fae4a" stroke={STROKE} strokeWidth="0.5" transform={`rotate(-35 ${x} ${y - 3})`} />
      ))}
      <circle cx="10" cy="24" r="1.8" fill="#3d3320" />
      <circle cx="14" cy="21" r="1.8" fill="#3d3320" />
    </svg>
  );
}

export function SacredChaliceIcon({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <path d="M10,7 L22,7 L20,15 Q18,18 16,18 Q14,18 12,15 Z" fill="#ffd700" stroke={STROKE} strokeWidth="1" />
      <rect x="15" y="18" width="2" height="6" fill="#ffd700" stroke={STROKE} strokeWidth="0.8" />
      <path d="M10,26 Q16,23 22,26 L22,27 Q16,25 10,27 Z" fill="#e8c700" stroke={STROKE} strokeWidth="0.8" />
      <ellipse cx="16" cy="9" rx="4" ry="1.2" fill="#fff3b0" opacity="0.8" />
    </svg>
  );
}

export function BronzeTripodIcon({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <circle cx="16" cy="12" r="7" fill="none" stroke="#c87f3a" strokeWidth="2.4" />
      <path d="M16,12 L8,27" stroke="#c87f3a" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M16,12 L16,28" stroke="#c87f3a" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M16,12 L24,27" stroke="#c87f3a" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M11,8 Q16,5 21,8" stroke="#e8ad6b" strokeWidth="1.2" fill="none" opacity="0.7" />
    </svg>
  );
}

export function MyrrhIncenseIcon({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <path d="M11,26 L21,26 L19,20 L13,20 Z" fill="#7a4a2a" stroke={STROKE} strokeWidth="1" />
      <rect x="14" y="17" width="4" height="3" fill="#c87f3a" />
      <path d="M16,17 Q13,12 16,9 Q19,6 16,2" stroke="#c9b896" strokeWidth="1.4" fill="none" opacity="0.75" strokeLinecap="round" />
      <path d="M16,17 Q19,11 15,7" stroke="#c9b896" strokeWidth="1" fill="none" opacity="0.5" strokeLinecap="round" />
    </svg>
  );
}

export function HoneycombIcon({ size = 28 }) {
  const hex = (cx, cy, r = 4.2) => {
    const pts = Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 3) * i - Math.PI / 6;
      return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
    }).join(" ");
    return <polygon points={pts} fill="#ffb703" stroke={STROKE} strokeWidth="0.7" />;
  };
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      {hex(11, 12)}{hex(19, 12)}{hex(15, 18.5)}{hex(23, 18.5)}{hex(7, 18.5)}
      <path d="M15,23 Q15,27 16.5,29" stroke="#e8ad00" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      <circle cx="16.7" cy="29.4" r="1" fill="#ffb703" stroke={STROKE} strokeWidth="0.4" />
    </svg>
  );
}

export const OFFERING_ICON_BY_TYPE = {
  "Golden Fleece": GoldenFleeceIcon,
  "Ambrosia": AmbrosiaIcon,
  "Laurel Wreath": LaurelWreathIcon,
  "Olive Branch": OliveBranchIcon,
  "Sacred Chalice": SacredChaliceIcon,
  "Bronze Tripod": BronzeTripodIcon,
  "Myrrh Incense": MyrrhIncenseIcon,
  "Honeycomb": HoneycombIcon,
};

export function TempleIcon({ size = 28, color = "#e8dcc8" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <path d="M6,12 L16,5 L26,12 Z" fill={color} stroke={STROKE} strokeWidth="1" />
      <rect x="6" y="12" width="20" height="2" fill={color} stroke={STROKE} strokeWidth="0.6" />
      {[8, 12, 16, 20, 24].map((x) => <rect key={x} x={x - 1} y="15" width="2" height="10" fill={color} stroke={STROKE} strokeWidth="0.5" />)}
      <rect x="5" y="25" width="22" height="2.5" fill={color} stroke={STROKE} strokeWidth="0.6" />
    </svg>
  );
}

export function OlympusIcon({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <path d="M16,4 L28,26 L4,26 Z" fill="#8b6fc9" stroke={STROKE} strokeWidth="1" />
      <path d="M16,4 L11,15 L21,15 Z" fill="#f5f0ff" opacity="0.85" />
      <path d="M6,26 L14,12 L18,18 L22,10 L26,26 Z" fill="#6b4f99" opacity="0.6" />
    </svg>
  );
}
