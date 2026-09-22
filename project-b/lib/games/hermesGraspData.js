// ─── Hermes' Grasp — five relics, one color each, most cards lying ───
// Same underlying puzzle as the classic reflex board game this is
// reskinned from: five objects, each with exactly one TRUE color. Every
// card shows two of the five objects, each printed in SOME color — not
// necessarily its own. Whichever color a relic is actually shown in on
// a given card is deliberately unrelated to which relic gets grabbed;
// what matters is:
//   - If exactly one of the two shown relics is printed in its own
//     true color, that one is the answer — the other's color is a red
//     herring, whatever it happens to be.
//   - If NEITHER shown relic is printed in its true color, the answer
//     is the ONE relic (out of the 3 not shown at all) whose object AND
//     true color both fail to appear anywhere among the four details on
//     the card (2 shown objects + 2 shown colors) — see generateDeck
//     below for exactly how that's guaranteed to always be unique,
//     never zero, never more than one.
export const RELICS = [
  { id: "dove", emoji: "🕊️", name: "Dove", owner: "Aphrodite's", colorName: "White", hex: "#f5f0ff" },
  { id: "grapes", emoji: "🍇", name: "Grapes", owner: "Dionysus'", colorName: "Green", hex: "#00ff9d" },
  { id: "owl", emoji: "🦉", name: "Owl", owner: "Athena's", colorName: "Grey", hex: "#a0a8c0" },
  { id: "trident", emoji: "🔱", name: "Trident", owner: "Poseidon's", colorName: "Blue", hex: "#00d9ff" },
  { id: "apple", emoji: "🍎", name: "Apple of Discord", owner: "Eris'", colorName: "Red", hex: "#ff3860" },
];

function relicById(id) {
  return RELICS.find((r) => r.id === id);
}

function seededRandom(seed) {
  let s = seed || 1;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

function pick(rand, arr) {
  return arr[Math.floor(rand() * arr.length)];
}

// Fisher-Yates using the same seeded stream — needed below to pick 2
// distinct relics and, separately, 2 distinct "other" colors, without
// ever retrying/looping on a collision (a do-while retry loop is fine
// for a single distinctness check, as generateWall's own ink/word pick
// already does, but selecting 2-out-of-N cleanly is simpler as a
// shuffle-and-slice).
function shuffledIndices(rand, n) {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// One card: { shown: [{relicId, colorName, hex}, {relicId, colorName, hex}], answerRelicId }
function generateCard(rand) {
  const order = shuffledIndices(rand, RELICS.length);
  const [aIdx, bIdx, ...restIdx] = order;
  const a = RELICS[aIdx];
  const b = RELICS[bIdx];
  const others = restIdx.map((i) => RELICS[i]); // the 3 relics not shown at all

  // Roughly half the deck is each type — same 50/50 split
  // lib/games/stroopData.js's own askFor draw uses.
  const oneCorrect = rand() < 0.5;

  if (oneCorrect) {
    // One of a/b keeps its own true color (the answer); the other gets
    // any color that ISN'T its own true color, so exactly one is ever
    // correctly colored on this card — never both, which would leave
    // no way to tell which one to grab.
    const correctIsA = rand() < 0.5;
    const correctRelic = correctIsA ? a : b;
    const wrongRelic = correctIsA ? b : a;
    const wrongColorPool = RELICS.filter((r) => r.id !== wrongRelic.id);
    const wrongColor = pick(rand, wrongColorPool);
    const shownA = correctIsA
      ? { relicId: a.id, colorName: a.colorName, hex: a.hex }
      : { relicId: a.id, colorName: wrongColor.colorName, hex: wrongColor.hex };
    const shownB = correctIsA
      ? { relicId: b.id, colorName: wrongColor.colorName, hex: wrongColor.hex }
      : { relicId: b.id, colorName: b.colorName, hex: b.hex };
    return { shown: [shownA, shownB], answerRelicId: correctRelic.id };
  }

  // Both wrong: paint a and b using two of the THREE other relics' true
  // colors (never a's or b's own — those colors belong to relics not
  // on this card at all, so this can never accidentally recolor either
  // shown relic correctly). That leaves exactly one of the 3 "others"
  // whose true color went completely unused — its object was never
  // shown, and now its color wasn't either. That's the unique answer:
  // the only one of all 5 relics whose object AND color both fail to
  // appear anywhere among the card's four details.
  const otherOrder = shuffledIndices(rand, others.length); // length 3
  const [usedIdx1, usedIdx2, leftoverIdx] = otherOrder;
  const colorForA = others[usedIdx1];
  const colorForB = others[usedIdx2];
  const answerRelic = others[leftoverIdx];
  return {
    shown: [
      { relicId: a.id, colorName: colorForA.colorName, hex: colorForA.hex },
      { relicId: b.id, colorName: colorForB.colorName, hex: colorForB.hex },
    ],
    answerRelicId: answerRelic.id,
  };
}

// Same card for everyone playing this round — "racing" only means
// something if the deck is identical, same reasoning as every other
// seeded mini-game in this app (see lib/games/stroopData.js).
export function generateDeck(seed, count) {
  const rand = seededRandom(seed || 1);
  const deck = [];
  for (let i = 0; i < count; i++) deck.push(generateCard(rand));
  return deck;
}

export { relicById };
