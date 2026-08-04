// ============================================================
// Every mini-game ultimately reports one number (lib/challengeScores.js)
// and this registry says how to turn that into a ranking:
//   "score-desc" — higher number wins (points, bricks broken, etc.)
//   "time-asc"   — lower number wins (a finish time in ms)
// Ties in EITHER direction are broken by who reported their score
// first — this is also exactly Trivia's requested tiebreaker (fastest
// answers wins), it just turns out to be the right default for every
// other game too (whoever locked in their result first, under equal
// scores, gets the edge).
// ============================================================

export const GAME_TYPES = {
  MANUAL: "manual",
  MATCH3: "match3",
  FROGGER: "frogger",
  WORDSCRAMBLE: "wordscramble",
  MAZE2D: "maze2d",
  FARKLE: "farkle",
  TRIVIA: "trivia",
  BREAKOUT: "breakout",
  PLINKO: "plinko",
  SPOTDIFF: "spotdiff",
  WHACKMOLE: "whackmole",
};

export const GAME_REGISTRY = {
  manual: { label: "Manual / In-Person", icon: "📋", rank: "manual", defaultDurationSec: 900, blurb: "Run any real-world challenge yourselves; enter finishing order by hand." },
  match3: { label: "Match 3", icon: "💎", rank: "score-desc", defaultDurationSec: 180, blurb: "Swap adjacent gems to clear lines of 3+. Highest score when time's up wins." },
  frogger: { label: "Frogger", icon: "🐸", rank: "score-desc", defaultDurationSec: 180, config: { lives: 3 }, blurb: "Cross the road without getting hit. 3 lives — most successful crossings wins." },
  wordscramble: { label: "Word Scramble", icon: "🔤", rank: "time-asc", defaultDurationSec: 300, blurb: "Unscramble your own set of 7 floating words. Fastest to solve all 7 wins." },
  maze2d: { label: "2D Maze", icon: "🧩", rank: "time-asc", defaultDurationSec: 300, config: { size: 11 }, blurb: "Navigate from start to finish, fog-of-war style — only where you've walked (and the goal) is visible. Fastest solve wins." },
  farkle: { label: "Farkle", icon: "🎲", rank: "score-desc", defaultDurationSec: 300, blurb: "Solo dice scoring game — bank points or push your luck. Highest banked score wins." },
  trivia: { label: "Trivia", icon: "❓", rank: "score-desc", defaultDurationSec: 130, config: { questions: 10, secPerQuestion: 10 }, blurb: "10 questions, 10 seconds each. Most correct wins; fastest answers break ties." },
  breakout: { label: "Breakout", icon: "🧱", rank: "score-desc", defaultDurationSec: 180, config: { lives: 3 }, blurb: "Break bricks with a paddle and ball. 3 lives — most bricks broken wins." },
  plinko: { label: "Plinko", icon: "🔴", rank: "score-desc", defaultDurationSec: 120, config: { shots: 3 }, blurb: "Drop 3 chips through the pegs into scoring slots. Highest total wins." },
  spotdiff: { label: "Spot the Difference", icon: "🔍", rank: "score-desc", defaultDurationSec: 180, config: { differences: 5 }, blurb: "Find all 5 differences between two scenes. Fastest to find them all wins." },
  whackmole: { label: "Whack-a-Mole", icon: "🔨", rank: "score-desc", defaultDurationSec: 60, blurb: "60 seconds. Whack every mole you can. Most whacks wins." },
};

export function gameConfigWithDefaults(gameType, overrides) {
  const base = GAME_REGISTRY[gameType]?.config || {};
  return { ...base, ...(overrides || {}) };
}
