// ─── The Pickpocket's Grasp ───
// Traitors' own reskin of Panopticon's "Hermes' Grasp" (lib/games/
// hermesGraspData.js): same underlying puzzle — five objects, each with
// exactly one TRUE color; every card shows two of them, each printed in
// SOME color, not necessarily its own — just restyled from sacred Greek
// relics to five trinkets lifted off the manor's own guests, to match
// Traitors' Italian-heist theme instead of Panopticon's Greek one.
//
// The puzzle logic itself (generateCard below) is a fresh implementation
// of the identical rule, not a straight re-import of hermesGraspData.js —
// that file's generateCard reaches for its own module-scoped RELICS
// constant internally, so it can't be parameterized with a different
// trinket set without editing Panopticon's own file, which this
// deliberately avoids touching. It's also simpler here: Traitors doesn't
// need hermesGraspData.js's seeded PRNG (that exists so Panopticon's
// ChallengePlayer can regenerate the identical deck from just a shared
// `challenge.startedAt` seed on every client) — the host here generates
// the deck ONCE and stores it directly in shared game_state, the exact
// same pattern EyesVillaHost.jsx and MasqueradeHost.jsx already use, so
// plain Math.random() is all that's needed.
//
// Rule, same as the original:
//   - If exactly one of the two shown trinkets is printed in its own
//     true color, that one is the answer — the other's color is a red
//     herring, whatever it happens to be.
//   - If NEITHER shown trinket is printed in its true color, the answer
//     is the ONE trinket (out of the 3 not shown at all) whose object
//     AND true color both fail to appear anywhere among the four details
//     on the card (2 shown objects + 2 shown colors) — generateCard below
//     guarantees that's always unique, never zero, never more than one.
export const TRINKETS = [
  { id: "ring", name: "The Doge's Ring", owner: "the Doge's", colorName: "Gold", hex: "#c9a84c" },
  { id: "dagger", name: "The Assassin's Dagger", owner: "the Assassin's", colorName: "Crimson", hex: "#c45c3c" },
  { id: "veil", name: "The Widow's Veil", owner: "the Widow's", colorName: "Violet", hex: "#7c3aed" },
  { id: "coin", name: "The Merchant's Coin", owner: "the Merchant's", colorName: "Silver", hex: "#c9c9c9" },
  { id: "goblet", name: "The Poisoner's Goblet", owner: "the Poisoner's", colorName: "Emerald", hex: "#7a9a5c" },
];

export function trinketById(id) {
  return TRINKETS.find((t) => t.id === id);
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Fisher-Yates — not the common `.sort(() => Math.random() - 0.5)`
// trick, which is a well-known non-uniform shuffle (see lib/
// characterPowers.js's own shuffle() for the same reasoning).
function shuffledIndices(n) {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// One card: { shown: [{trinketId, colorName, hex}, {trinketId, colorName, hex}], answerTrinketId }
function generateCard() {
  const order = shuffledIndices(TRINKETS.length);
  const [aIdx, bIdx, ...restIdx] = order;
  const a = TRINKETS[aIdx];
  const b = TRINKETS[bIdx];
  const others = restIdx.map((i) => TRINKETS[i]); // the 3 trinkets not shown at all

  const oneCorrect = Math.random() < 0.5; // roughly half the deck is each type

  if (oneCorrect) {
    const correctIsA = Math.random() < 0.5;
    const correctTrinket = correctIsA ? a : b;
    const wrongTrinket = correctIsA ? b : a;
    const wrongColorPool = TRINKETS.filter((t) => t.id !== wrongTrinket.id);
    const wrongColor = pick(wrongColorPool);
    const shownA = correctIsA
      ? { trinketId: a.id, colorName: a.colorName, hex: a.hex }
      : { trinketId: a.id, colorName: wrongColor.colorName, hex: wrongColor.hex };
    const shownB = correctIsA
      ? { trinketId: b.id, colorName: wrongColor.colorName, hex: wrongColor.hex }
      : { trinketId: b.id, colorName: b.colorName, hex: b.hex };
    return { shown: [shownA, shownB], answerTrinketId: correctTrinket.id };
  }

  // Both wrong: paint a and b using two of the THREE others' true
  // colors (never a's or b's own). That leaves exactly one of the 3
  // "others" whose true color went completely unused — the unique answer.
  const otherOrder = shuffledIndices(others.length); // length 3
  const [usedIdx1, usedIdx2, leftoverIdx] = otherOrder;
  const colorForA = others[usedIdx1];
  const colorForB = others[usedIdx2];
  const answerTrinket = others[leftoverIdx];
  return {
    shown: [
      { trinketId: a.id, colorName: colorForA.colorName, hex: colorForA.hex },
      { trinketId: b.id, colorName: colorForB.colorName, hex: colorForB.hex },
    ],
    answerTrinketId: answerTrinket.id,
  };
}

export function generateDeck(count) {
  const deck = [];
  for (let i = 0; i < count; i++) deck.push(generateCard());
  return deck;
}

export const STORAGE_KEY_PICKPOCKET = "traitors:pickpocket-grasp";
export const PICKPOCKET_ROUND_COUNT = 8;
export const PICKPOCKET_MISTAKE_PENALTY_MS = 2000;
