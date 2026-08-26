// ─── Hue ───
// Solo, client-only game (see components/games/SpotDiffPlayer.jsx's own
// established pattern, which this follows exactly) — the target color
// is fully visible from the start, nothing gets progressively revealed
// through play the way Deal or No Deal's case values were, so there's
// no equivalent exploit a reload could enable. The only thing worth
// protecting is the speed-bonus clock, handled the same lightweight way
// SpotDiff/Match3/etc. already do it — see usePersistedStart.

// A modest curated palette, not exhaustive — enough variety that the
// displayed name feels specific ("Vivid Cerulean") without needing a
// full color-naming database. The target's OWN random RGB is what
// actually gets scored against; this only picks the nearest name for
// flavor text.
export const NAMED_COLORS = [
  { name: "Vivid Cerulean", r: 46, g: 96, b: 220 },
  { name: "Coral Blush", r: 255, g: 127, b: 110 },
  { name: "Meadow Green", r: 74, g: 173, b: 92 },
  { name: "Golden Amber", r: 235, g: 168, b: 43 },
  { name: "Royal Violet", r: 122, g: 58, b: 201 },
  { name: "Crimson Ember", r: 200, g: 40, b: 55 },
  { name: "Tidal Teal", r: 32, g: 156, b: 154 },
  { name: "Sunset Tangerine", r: 244, g: 122, b: 44 },
  { name: "Blush Rose", r: 224, g: 121, b: 156 },
  { name: "Deep Indigo", r: 55, g: 42, b: 138 },
  { name: "Sage Mist", r: 143, g: 168, b: 141 },
  { name: "Mustard Field", r: 201, g: 168, b: 44 },
  { name: "Slate Storm", r: 84, g: 96, b: 112 },
  { name: "Lavender Dusk", r: 168, g: 143, b: 214 },
  { name: "Forest Canopy", r: 41, g: 92, b: 58 },
  { name: "Terracotta", r: 195, g: 100, b: 70 },
  { name: "Powder Sky", r: 148, g: 197, b: 226 },
  { name: "Ruby Wine", r: 130, g: 24, b: 58 },
  { name: "Lemon Zest", r: 238, g: 214, b: 60 },
  { name: "Midnight Navy", r: 22, g: 33, b: 68 },
  { name: "Peach Sorbet", r: 250, g: 190, b: 150 },
  { name: "Olive Grove", r: 110, g: 118, b: 56 },
  { name: "Fuchsia Bloom", r: 208, g: 46, b: 158 },
  { name: "Steel Blue", r: 68, g: 108, b: 148 },
  { name: "Cinnamon Spice", r: 155, g: 88, b: 48 },
  { name: "Mint Frost", r: 132, g: 220, b: 186 },
  { name: "Plum Shadow", r: 88, g: 44, b: 82 },
  { name: "Marigold", r: 240, g: 150, b: 30 },
  { name: "Charcoal Smoke", r: 58, g: 58, b: 62 },
  { name: "Aqua Current", r: 40, g: 180, b: 200 },
];

function seededRandom(seed) {
  let s = seed || 1;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

export function rgbToHex(r, g, b) {
  const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
  return "#" + [clamp(r), clamp(g), clamp(b)].map((n) => n.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function nearestColorName(r, g, b) {
  let best = NAMED_COLORS[0];
  let bestDist = Infinity;
  for (const c of NAMED_COLORS) {
    const d = Math.hypot(c.r - r, c.g - g, c.b - b);
    if (d < bestDist) { bestDist = d; best = c; }
  }
  return best.name;
}

// Fully random target — deliberately NOT snapped to one of the named
// palette entries (that would make the game trivially guessable once a
// player learns the palette). The nearest name is just a flavor label.
export function generateTargetColor(seed) {
  const rand = seededRandom(seed);
  const r = Math.floor(rand() * 256);
  const g = Math.floor(rand() * 256);
  const b = Math.floor(rand() * 256);
  return { r, g, b, name: nearestColorName(r, g, b) };
}

const MAX_RGB_DISTANCE = Math.sqrt(255 * 255 * 3); // black vs white — the largest distance two RGB colors can ever be apart
const MAX_SPEED_BONUS = 10; // deliberately small relative to the 0-100 closeness scale, matching "a small speed bonus"

// closeness: 0-100, 100 = exact match. speedBonus: 0-MAX_SPEED_BONUS,
// scaled down linearly as more of the challenge's own time gets used —
// submitting instantly earns the full bonus, using the whole window
// earns none. totalDurationMs defaults sanely if the challenge has no
// configured duration for some reason (shouldn't happen in practice,
// but a missing denominator would otherwise produce NaN, not just a
// wrong number).
export function computeHueScore(target, mix, elapsedMs, totalDurationMs) {
  const distance = Math.hypot(target.r - mix.r, target.g - mix.g, target.b - mix.b);
  const closeness = Math.max(0, 100 - (distance / MAX_RGB_DISTANCE) * 100);
  const safeDuration = totalDurationMs > 0 ? totalDurationMs : 300000;
  const usedFraction = Math.max(0, Math.min(1, elapsedMs / safeDuration));
  const speedBonus = MAX_SPEED_BONUS * (1 - usedFraction);
  return { closeness, speedBonus, value: closeness + speedBonus };
}
