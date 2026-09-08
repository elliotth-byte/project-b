// ─── Relic Icons ───
// Hand-drawn SVG silhouettes for lib/games/hermesGraspData.js's five
// relics, each filled entirely in whatever color the caller passes —
// this is what "the card shows a green ghost" etc. actually needed to
// LOOK like: an emoji glyph renders in its own fixed colors no matter
// what background box you put it in, so a card claiming a relic is
// "green" while showing a naturally-white dove emoji was always a bit
// of a disconnect between the text label and what was actually on
// screen. These are plain geometric shapes (circles, polygons,
// rects) rather than intricate paths — reliable at small icon sizes
// and easy to reason about without a design tool to preview in.
// Deliberately basic silhouettes, not detailed illustrations: at
// 40-ish px, recognizable shape reads better than fine detail would.

function IconBase({ size, viewBox = "0 0 100 100", children }) {
  return (
    <svg width={size} height={size} viewBox={viewBox} style={{ display: "block", margin: "0 auto" }}>
      {children}
    </svg>
  );
}

export function DoveIcon({ color, size = 40 }) {
  return (
    <IconBase size={size}>
      <ellipse cx="48" cy="58" rx="24" ry="15" fill={color} />
      <circle cx="72" cy="46" r="10" fill={color} />
      <polygon points="80,43 92,46 80,50" fill={color} />
      <circle cx="76" cy="44" r="1.6" fill="#1a1a2e" />
      <polygon points="34,50 8,32 40,60" fill={color} opacity="0.82" />
      <polygon points="30,64 12,80 42,68" fill={color} opacity="0.6" />
    </IconBase>
  );
}

export function GrapesIcon({ color, size = 40 }) {
  const berries = [
    [42, 46], [58, 46],
    [34, 58], [50, 58], [66, 58],
    [42, 70], [58, 70],
    [50, 82],
  ];
  return (
    <IconBase size={size}>
      <line x1="50" y1="18" x2="50" y2="38" stroke="#6b4a2c" strokeWidth="4" strokeLinecap="round" />
      <ellipse cx="62" cy="24" rx="10" ry="6" fill="#3f7d3f" transform="rotate(35 62 24)" />
      {berries.map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="9.5" fill={color} />
      ))}
    </IconBase>
  );
}

export function OwlIcon({ color, size = 40 }) {
  return (
    <IconBase size={size}>
      <ellipse cx="50" cy="60" rx="27" ry="29" fill={color} />
      <polygon points="28,34 38,20 43,40" fill={color} />
      <polygon points="72,34 62,20 57,40" fill={color} />
      <circle cx="39" cy="54" r="11" fill="#f5f0ff" />
      <circle cx="61" cy="54" r="11" fill="#f5f0ff" />
      <circle cx="39" cy="54" r="4.5" fill="#1a1a2e" />
      <circle cx="61" cy="54" r="4.5" fill="#1a1a2e" />
      <polygon points="46,63 54,63 50,73" fill="#e8a33d" />
    </IconBase>
  );
}

export function TridentIcon({ color, size = 40 }) {
  return (
    <IconBase size={size}>
      <rect x="45" y="42" width="10" height="48" rx="2" fill={color} />
      <rect x="28" y="40" width="44" height="8" rx="2" fill={color} />
      <rect x="30" y="16" width="7" height="28" rx="2" fill={color} />
      <rect x="46.5" y="10" width="7" height="34" rx="2" fill={color} />
      <rect x="63" y="16" width="7" height="28" rx="2" fill={color} />
      <polygon points="30,16 37,16 33.5,6" fill={color} />
      <polygon points="46.5,10 53.5,10 50,0" fill={color} />
      <polygon points="63,16 70,16 66.5,6" fill={color} />
    </IconBase>
  );
}

export function AppleIcon({ color, size = 40 }) {
  return (
    <IconBase size={size}>
      <circle cx="38" cy="58" r="24" fill={color} />
      <circle cx="62" cy="58" r="24" fill={color} />
      <rect x="47" y="20" width="6" height="18" rx="2" fill="#6b4a2c" />
      <ellipse cx="60" cy="24" rx="11" ry="6.5" fill="#3f7d3f" transform="rotate(-25 60 24)" />
    </IconBase>
  );
}

export const RELIC_ICONS = {
  dove: DoveIcon,
  grapes: GrapesIcon,
  owl: OwlIcon,
  trident: TridentIcon,
  apple: AppleIcon,
};

export default function RelicIcon({ type, color, size = 40 }) {
  const Icon = RELIC_ICONS[type];
  if (!Icon) return null;
  return <Icon color={color} size={size} />;
}
