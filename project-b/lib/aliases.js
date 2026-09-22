// Player aliases — pure data. Stored directly on players.alias (see
// sql/add-player-alias.sql). Same "claim one from a shared pool, no
// duplicates" pattern as lib/playerColors.js.
export const ALIASES = [
  { name: "Zeus", blurb: "King of the gods and ruler of the sky, weather, and law." },
  { name: "Hera", blurb: "Queen of the gods and goddess of marriage, family, and women." },
  { name: "Poseidon", blurb: "Lord of the seas, earthquakes, and horses." },
  { name: "Demeter", blurb: "Goddess of agriculture, grain, and the harvest." },
  { name: "Athena", blurb: "Goddess of wisdom, strategic warfare, and crafts." },
  { name: "Apollo", blurb: "God of music, prophecy, healing, the sun, and archery." },
  { name: "Artemis", blurb: "Goddess of the hunt, wilderness, moon, and chastity." },
  { name: "Ares", blurb: "God of brutal and violent war." },
  { name: "Aphrodite", blurb: "Goddess of love, beauty, and desire." },
  { name: "Hephaestus", blurb: "God of fire, metalworking, and blacksmiths." },
  { name: "Hermes", blurb: "The messenger god and patron of travelers, merchants, and thieves." },
  { name: "Hestia", blurb: "Goddess of the hearth and home." },
  { name: "Dionysus", blurb: "God of wine and festivity." },
  { name: "Hades", blurb: "Brother to Zeus and Poseidon — ruler of the Underworld, excluded from the standard twelve Olympians." },
];

export function takenAliases(players) {
  return new Set((players || []).map((p) => p.alias).filter(Boolean));
}

export function availableAliases(players) {
  const taken = takenAliases(players);
  return ALIASES.filter((a) => !taken.has(a.name));
}
