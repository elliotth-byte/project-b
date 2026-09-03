// Player color assignment — pure data + a couple of small helpers.
// Colors are stored directly on players.color (see sql/add-player-color.sql).
//
// `file` maps each color to its real boombox artwork (see
// public/stereo-types/boombox/ and components/Boombox.jsx) — added
// once actual graphic boomboxes replaced the old flat-SVG-with-a-fill
// version, which could tint any hex value at all and never needed this.
// Deliberately did NOT change any `hex` value while adding this: those
// are already stored verbatim on live players.color rows from before
// this asset swap, and changing one here would silently orphan any
// player already holding it (their boombox would stop resolving to any
// image at all). Two names below (Magenta, Bubblegum) no longer quite
// describe their actual artwork, because the 14 sourced boombox files
// don't split cleanly along this list's original 14 names/hues — see
// each one's own comment for what it actually got matched to instead.
export const PLAYER_COLORS = [
  { name: "Hot Pink", hex: "#ff2d95", file: "pink" },
  { name: "Cyan", hex: "#00f0ff", file: "lightblue" },
  { name: "Electric Purple", hex: "#b829ff", file: "purple" },
  { name: "Neon Yellow", hex: "#f9f002", file: "yellow" },
  { name: "Laser Green", hex: "#39ff14", file: "green" },
  { name: "Neon Orange", hex: "#ff6a13", file: "orange" },
  { name: "Electric Blue", hex: "#00b3ff", file: "darkblue" },
  // No sourced file reads as truly "magenta" — closest available hue
  // left over once every other slot claimed its own obvious match was
  // "lightgreen" (a pale mint), so the display name changed to match
  // what the artwork actually looks like rather than keep a name that'd
  // actively mislead the color picker.
  { name: "Mint", hex: "#ff00c8", file: "lightgreen" },
  { name: "Neon Red", hex: "#ff2b4d", file: "red" },
  { name: "Lime", hex: "#d4ff00", file: "limegreen" },
  { name: "Aqua", hex: "#00ffc8", file: "aqua" },
  { name: "Violet", hex: "#8a4fff", file: "violet" },
  // Same situation as Mint above — "white" was the only file left once
  // every true pink/magenta-family name was already claimed by Hot Pink.
  { name: "Frost White", hex: "#ff6ec7", file: "white" },
  { name: "Amber", hex: "#ffb800", file: "lightorange" },
];

export function takenColors(players) {
  return new Set((players || []).map((p) => p.color).filter(Boolean));
}

export function availableColors(players) {
  const taken = takenColors(players);
  return PLAYER_COLORS.filter((c) => !taken.has(c.hex));
}

export function colorFor(players, playerId) {
  return players?.find((p) => p.id === playerId)?.color || "#5c4d80";
}

// Resolves a stored hex value to its boombox artwork filename (see
// components/Boombox.jsx). Falls back to "yellow" for a hex that isn't
// in the list at all — which shouldn't happen for any player who
// actually went through the color picker, but is a real possibility
// for an old/test row predating lib/playerColors.js's own current
// list, or any future manual DB edit — same "never render nothing"
// instinct as everywhere else in this app an optional/unexpected value
// gets a graceful default instead of a broken image.
export function boomboxFileFor(hex) {
  return PLAYER_COLORS.find((c) => c.hex === hex)?.file || "yellow";
}
