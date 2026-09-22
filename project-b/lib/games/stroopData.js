// ─── Stroop Effect Wall ───
// The classic cognitive-interference test: a grid of color-name words,
// each rendered in an ink color that never matches what the word says
// (the word "RED" printed in blue, etc.). Each tile also carries its
// own askFor ("ink" or "word"), decided per-tile rather than fixed for
// the whole wall — some tiles ask what color it's PRINTED in (name the
// ink, ignore the word — the classic, harder direction, since reading
// is automatic and fights the ink answer), others ask what the word
// SAYS (name the word, ignore the ink — the easier direction on its
// own, but the constant switching is what makes alternating harder
// than either direction alone: recognizing which rule applies to THIS
// tile is itself part of the challenge). Drawn from the SAME seeded
// random stream as word/ink below, not a separate independent draw —
// same shared-seed fairness as Whack-a-Mole's mole sequence and this
// wall's own word/ink pairs: "racing" only means something if everyone
// faces the identical sequence of prompts, not their own
// independently-random one.
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

// count words, each { word, ink, askFor } where ink is always a
// DIFFERENT color name than word (guaranteed mismatch on every single
// tile) and askFor is "ink" or "word", roughly 50/50 across the wall.
export function generateWall(seed, count) {
  const rand = seededRandom(seed || 1);
  const wall = [];
  for (let i = 0; i < count; i++) {
    const word = COLORS[Math.floor(rand() * COLORS.length)];
    let ink;
    do { ink = COLORS[Math.floor(rand() * COLORS.length)]; } while (ink.name === word.name);
    const askFor = rand() < 0.5 ? "ink" : "word";
    wall.push({ word: word.name, ink: ink.name, inkHex: ink.hex, askFor });
  }
  return wall;
}
