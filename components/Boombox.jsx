import StereoTypesSticker from "./StereoTypesSticker";

// ─── Stereo Types — the boombox graphic ───
// "Players should be represented by large boom boxes at the bottom of
// the screen" — this is that graphic. Real inline SVG (rounded body,
// two speakers with an inner cone highlight, a cassette-deck window
// between them, a curved carry handle across the top, a short antenna),
// not an abstract rounded rectangle. Body fill is the player's own
// color; speaker/deck/handle/antenna details stay a fixed dark tone
// (matching lib/uiTheme.js's stereo_types.inputBg) regardless of body
// color, for contrast against every color in lib/playerColors.js's
// list, including the pale ones. A player with no color chosen yet
// still gets a real-looking boombox, just in the theme's own yellow
// rather than a broken/blank state.
const DETAIL_COLOR = "#0a0e18";

export default function Boombox({ color, stickerId, label, size = 120 }) {
  const bodyColor = color || "#f4c430";
  const height = size * (90 / 120);

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <svg width={size} height={height} viewBox="0 0 120 90">
        {/* Carry handle */}
        <path d="M30,20 C30,2 90,2 90,20" fill="none" stroke={DETAIL_COLOR} strokeWidth="5" strokeLinecap="round" />
        {/* Antenna */}
        <line x1="100" y1="20" x2="112" y2="4" stroke={DETAIL_COLOR} strokeWidth="3" strokeLinecap="round" />
        {/* Body */}
        <rect x="10" y="18" width="100" height="58" rx="10" fill={bodyColor} stroke={DETAIL_COLOR} strokeWidth="2" />
        {/* Left speaker */}
        <circle cx="32" cy="50" r="20" fill={DETAIL_COLOR} />
        <circle cx="32" cy="50" r="12" fill={bodyColor} />
        {/* Right speaker */}
        <circle cx="88" cy="50" r="20" fill={DETAIL_COLOR} />
        <circle cx="88" cy="50" r="12" fill={bodyColor} />
        {/* Cassette deck window */}
        <rect x="52" y="38" width="16" height="24" rx="2" fill={DETAIL_COLOR} />
        {/* Control buttons */}
        <circle cx="55" cy="68" r="2.5" fill={DETAIL_COLOR} />
        <circle cx="60" cy="68" r="2.5" fill={DETAIL_COLOR} />
        <circle cx="65" cy="68" r="2.5" fill={DETAIL_COLOR} />
        {/* Sticker, badged onto the left speaker's inner cone */}
        {stickerId && (
          <g transform="translate(22, 40)">
            <StereoTypesSticker stickerId={stickerId} size={20} color={DETAIL_COLOR} />
          </g>
        )}
      </svg>
      {label && (
        <div style={{ color: "#f5eddc", fontSize: 12, fontWeight: 700, fontFamily: "'Anton', 'Arial Narrow', sans-serif", letterSpacing: 0.5 }}>
          {label}
        </div>
      )}
    </div>
  );
}
