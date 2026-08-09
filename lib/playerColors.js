// Player color assignment — pure data + a couple of small helpers.
// Colors are stored directly on players.color (see sql/add-player-color.sql).
export const PLAYER_COLORS = [
  { name: "Hot Pink", hex: "#ff2d95" },
  { name: "Cyan", hex: "#00f0ff" },
  { name: "Electric Purple", hex: "#b829ff" },
  { name: "Neon Yellow", hex: "#f9f002" },
  { name: "Laser Green", hex: "#39ff14" },
  { name: "Neon Orange", hex: "#ff6a13" },
  { name: "Electric Blue", hex: "#00b3ff" },
  { name: "Magenta", hex: "#ff00c8" },
  { name: "Neon Red", hex: "#ff2b4d" },
  { name: "Lime", hex: "#d4ff00" },
  { name: "Aqua", hex: "#00ffc8" },
  { name: "Violet", hex: "#8a4fff" },
  { name: "Bubblegum", hex: "#ff6ec7" },
  { name: "Amber", hex: "#ffb800" },
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
