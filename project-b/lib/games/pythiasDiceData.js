// ─── The Pythia's Dice ───
// Standard 13-category Yahtzee, played solo/asynchronously — see
// FarklePlayer.jsx's own header reasoning for why this app's dice games
// don't need seeded/identical rolls the way its shared-layout puzzles
// (Sliding Puzzle, Minotaur's Maze) do: there's no other player's dice
// to race against turn-by-turn, so plain Math.random() per roll is
// correct here, same as farkleData.js's rollDice.
//
// This file is pure scoring/detection logic: given 5 dice, compute what
// EVERY one of the 13 categories would score if the player chose it right
// now, so the UI (PythiasDicePlayer.jsx) can show a live preview next to
// every still-open category before the player commits to one.

export const CATEGORIES = [
  "ones", "twos", "threes", "fours", "fives", "sixes",
  "threeKind", "fourKind", "fullHouse", "smallStraight", "largeStraight", "yahtzee", "chance",
];

export const CATEGORY_LABELS = {
  ones: "Ones", twos: "Twos", threes: "Threes", fours: "Fours", fives: "Fives", sixes: "Sixes",
  threeKind: "Three of a Kind", fourKind: "Four of a Kind", fullHouse: "Full House",
  smallStraight: "Small Straight", largeStraight: "Large Straight", yahtzee: "Yahtzee", chance: "Chance",
};

export const UPPER_CATEGORIES = ["ones", "twos", "threes", "fours", "fives", "sixes"];
export const UPPER_BONUS_THRESHOLD = 63;
export const UPPER_BONUS = 35;
export const YAHTZEE_BONUS = 100;
export const ROUNDS = 13;
export const MAX_ROLLS_PER_ROUND = 3;

const FACE_TO_UPPER = { ones: 1, twos: 2, threes: 3, fours: 4, fives: 5, sixes: 6 };

function countsOf(dice) {
  const counts = [0, 0, 0, 0, 0, 0, 0]; // index 1..6
  dice.forEach((d) => counts[d]++);
  return counts;
}

function sum(dice) {
  return dice.reduce((a, b) => a + b, 0);
}

// True if the dice contain a run of `len` consecutive distinct faces
// (e.g. 4 for a small straight, 5 for a large straight). Works off the
// set of distinct faces present, since duplicates don't help a straight.
function hasStraight(dice, len) {
  const present = new Set(dice);
  let run = 0;
  for (let face = 1; face <= 6; face++) {
    if (present.has(face)) {
      run++;
      if (run >= len) return true;
    } else {
      run = 0;
    }
  }
  return false;
}

// Scores every one of the 13 categories for the given 5 dice, returning
// { categoryKey: score }. This is what each category WOULD score if
// chosen right now — used both for the live preview and for actually
// committing a round's result once the player taps a category.
export function scoreAllCategories(dice) {
  const counts = countsOf(dice);
  const total = sum(dice);
  const scores = {};

  for (const cat of UPPER_CATEGORIES) {
    const face = FACE_TO_UPPER[cat];
    scores[cat] = counts[face] * face;
  }

  const maxCount = Math.max(...counts.slice(1));
  scores.threeKind = maxCount >= 3 ? total : 0;
  scores.fourKind = maxCount >= 4 ? total : 0;

  // Full house: exactly a 3-of-a-kind + a 2-of-a-kind of a DIFFERENT
  // face. A five-of-a-kind (all one face) is NOT a full house under
  // standard rules — it has no second, different-face pair — so this
  // deliberately requires both a distinct 3-count face and a distinct
  // 2-count face, not just "any count >= 3 and any count >= 2".
  const hasThree = counts.some((c) => c === 3);
  const hasTwo = counts.some((c) => c === 2);
  scores.fullHouse = hasThree && hasTwo ? 25 : 0;

  scores.smallStraight = hasStraight(dice, 4) ? 30 : 0;
  scores.largeStraight = hasStraight(dice, 5) ? 40 : 0;
  scores.yahtzee = maxCount === 5 ? 50 : 0;
  scores.chance = total;

  return scores;
}

// Whether this exact roll is a Yahtzee (all 5 dice the same face) —
// used by the player component to detect bonus-eligible extra Yahtzees
// independent of which category the player ultimately assigns the roll
// to (a second-or-later Yahtzee still earns the 100-point bonus even if
// assigned to, say, Chance, once the Yahtzee category itself has already
// been scored with actual points, per standard rules).
export function isYahtzeeRoll(dice) {
  const counts = countsOf(dice);
  return counts.some((c) => c === 5);
}

// Upper-section subtotal (Ones..Sixes actually scored so far) and
// whether the 63+ bonus applies. `scorecard` is { categoryKey: score |
// null }, null meaning "not yet filled".
export function upperSubtotal(scorecard) {
  return UPPER_CATEGORIES.reduce((s, c) => s + (scorecard[c] || 0), 0);
}

export function upperBonusEarned(scorecard) {
  return upperSubtotal(scorecard) >= UPPER_BONUS_THRESHOLD;
}

// Full final total: every filled category + upper bonus (if earned) +
// any accumulated Yahtzee bonuses (tracked separately by the player
// component, since bonus eligibility depends on roll HISTORY, not just
// the final scorecard).
export function computeTotal(scorecard, yahtzeeBonusCount) {
  const categorySum = CATEGORIES.reduce((s, c) => s + (scorecard[c] || 0), 0);
  const bonus = upperBonusEarned(scorecard) ? UPPER_BONUS : 0;
  return categorySum + bonus + (yahtzeeBonusCount || 0) * YAHTZEE_BONUS;
}

export function rollDie() {
  return 1 + Math.floor(Math.random() * 6);
}

export function rollDice(n) {
  return Array.from({ length: n }, rollDie);
}

export const DIE_FACES = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
