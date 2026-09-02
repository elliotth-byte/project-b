// ─── Stereo Types — sticker art ───
// Real drawn SVG shapes for each entry in lib/stereoTypesStickers.js's
// STICKER_CATALOG — not emoji, not a placeholder box. Every shape is
// built on a 0-100 viewBox so size is just a wrapper concern; fill is
// single-color throughout (peace/note mix a little stroke in for the
// ring/stem, but still one color total, no gradients).
export default function StereoTypesSticker({ stickerId, size = 32, color = "#f4c430" }) {
  if (!stickerId) return null;

  const common = { width: size, height: size, viewBox: "0 0 100 100" };

  switch (stickerId) {
    case "star":
      return (
        <svg {...common}>
          <polygon
            points="50,5 60.6,35.44 92.8,36.1 67.1,55.56 76.45,86.4 50,68 23.55,86.4 32.9,55.56 7.2,36.1 39.4,35.44"
            fill={color}
          />
        </svg>
      );

    case "bolt":
      return (
        <svg {...common}>
          <polygon points="60,2 25,55 48,55 40,98 78,42 52,42 60,2" fill={color} />
        </svg>
      );

    case "flame":
      return (
        <svg {...common}>
          <path
            d="M50,90 C20,90 10,65 20,45 C25,55 35,55 35,40 C35,20 45,10 55,5 C50,25 65,30 70,50 C75,65 70,85 50,90 Z"
            fill={color}
          />
        </svg>
      );

    case "crown":
      return (
        <svg {...common}>
          <polygon
            points="15,85 15,70 30,45 35,70 50,25 65,70 70,45 85,70 85,85"
            fill={color}
          />
        </svg>
      );

    case "peace":
      return (
        <svg {...common}>
          <circle cx="50" cy="50" r="42" fill="none" stroke={color} strokeWidth="8" />
          <line x1="50" y1="50" x2="50" y2="92" stroke={color} strokeWidth="8" strokeLinecap="round" />
          <line x1="50" y1="50" x2="20" y2="80" stroke={color} strokeWidth="8" strokeLinecap="round" />
          <line x1="50" y1="50" x2="80" y2="80" stroke={color} strokeWidth="8" strokeLinecap="round" />
        </svg>
      );

    case "note":
      return (
        <svg {...common}>
          <ellipse cx="35" cy="75" rx="16" ry="11" transform="rotate(-20 35 75)" fill={color} />
          <rect x="48" y="15" width="6" height="62" fill={color} />
          <path d="M54,15 C75,20 75,45 54,42 Z" fill={color} />
        </svg>
      );

    default:
      return null;
  }
}
