// ─── Stroop Effect Wall ───
// The classic cognitive-interference test: a grid of color-name words,
// each rendered in an ink color that never matches what the word says
// (the word "RED" printed in blue, etc.) — the player has to name the
// INK color, not read the word, which is exactly what makes it hard:
// reading is automatic, so the mismatched color creates real
// interference to fight through.
//
// Same shared-seed fairness as Whack-a-Mole's mole sequence — "racing"
// only means something if everyone's racing through the identical wall,
// not their own independently-random one.
export const COLORS = [
  { name: "RED", hex: "#ff3860" },
  { name: "BLUE", hex: "#00d9ff" },
  { name: "GREEN", hex: "#00ff9d" },
  { name: "YELLOW", hex: "#ffd700" },
  { name: "PURPLE", hex: "#c879ff" },
  { name: "ORANGE", hex: "#ff9f4d" },
];

function seededRandom(seed) {
  let s = seed || 1;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

// count words, each { word, ink } where ink is always a DIFFERENT color
// name than word — guaranteed mismatch on every single tile.
export function generateWall(seed, count) {
  const rand = seededRandom(seed || 1);
  const wall = [];
  for (let i = 0; i < count; i++) {
    const word = COLORS[Math.floor(rand() * COLORS.length)];
    let ink;
    do { ink = COLORS[Math.floor(rand() * COLORS.length)]; } while (ink.name === word.name);
    wall.push({ word: word.name, ink: ink.name, inkHex: ink.hex });
  }
  return wall;
}
