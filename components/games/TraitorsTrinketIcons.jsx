// ─── Pickpocket's Grasp — Trinket Icons ───
// Traitors' reskin of Panopticon's RelicIcons.jsx (components/games/
// RelicIcons.jsx) for lib/pickpocketGraspData.js's five stolen trinkets
// — plain geometric silhouettes filled in whatever color the caller
// passes, same reasoning as the original: an emoji renders in its own
// fixed colors regardless of what the card claims, so a card saying a
// trinket is "crimson" needs the shape itself drawn in crimson, not an
// emoji glyph sitting on a crimson background.

function IconBase({ size, children }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ display: "block", margin: "0 auto" }}>
      {children}
    </svg>
  );
}

export function RingIcon({ color, size = 40 }) {
  return (
    <IconBase size={size}>
      <circle cx="50" cy="58" r="26" fill="none" stroke={color} strokeWidth="10" />
      <polygon points="50,14 62,32 38,32" fill={color} />
      <circle cx="50" cy="24" r="5" fill={color} />
    </IconBase>
  );
}

export function DaggerIcon({ color, size = 40 }) {
  return (
    <IconBase size={size}>
      <polygon points="50,6 58,50 42,50" fill={color} />
      <rect x="30" y="50" width="40" height="8" rx="2" fill={color} />
      <rect x="46" y="58" width="8" height="30" rx="2" fill={color} />
      <polygon points="50,88 44,78 56,78" fill={color} />
    </IconBase>
  );
}

export function VeilIcon({ color, size = 40 }) {
  return (
    <IconBase size={size}>
      <path d="M50,14 C30,14 20,34 20,54 C20,70 32,86 50,86 C68,86 80,70 80,54 C80,34 70,14 50,14 Z" fill={color} opacity="0.85" />
      <path d="M50,14 C30,14 20,34 20,54 C32,48 68,48 80,54 C80,34 70,14 50,14 Z" fill={color} />
      <circle cx="38" cy="50" r="3" fill="#1a1a2e" opacity="0.6" />
      <circle cx="62" cy="50" r="3" fill="#1a1a2e" opacity="0.6" />
    </IconBase>
  );
}

export function CoinIcon({ color, size = 40 }) {
  return (
    <IconBase size={size}>
      <circle cx="50" cy="50" r="34" fill={color} />
      <circle cx="50" cy="50" r="34" fill="none" stroke="#1a1a2e" strokeWidth="2" opacity="0.25" />
      <circle cx="50" cy="50" r="24" fill="none" stroke="#1a1a2e" strokeWidth="2" opacity="0.3" strokeDasharray="4 3" />
      <text x="50" y="59" fontSize="26" textAnchor="middle" fill="#1a1a2e" opacity="0.5" fontFamily="'Palatino Linotype', Georgia, serif">D</text>
    </IconBase>
  );
}

export function GobletIcon({ color, size = 40 }) {
  return (
    <IconBase size={size}>
      <path d="M28,14 L72,14 L62,46 Q56,54 50,54 Q44,54 38,46 Z" fill={color} />
      <rect x="46" y="54" width="8" height="22" fill={color} />
      <rect x="32" y="76" width="36" height="8" rx="2" fill={color} />
    </IconBase>
  );
}

export const TRINKET_ICONS = {
  ring: RingIcon,
  dagger: DaggerIcon,
  veil: VeilIcon,
  coin: CoinIcon,
  goblet: GobletIcon,
};

export default function TrinketIcon({ type, color, size = 40 }) {
  const Icon = TRINKET_ICONS[type];
  if (!Icon) return null;
  return <Icon color={color} size={size} />;
}
