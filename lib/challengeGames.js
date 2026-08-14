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
  MAZEINVISIBLE: "mazeinvisible",
  MAZETRIVIA: "mazetrivia",
  FARKLE: "farkle",
  TRIVIA: "trivia",
  BREAKOUT: "breakout",
  PLINKO: "plinko",
  SPOTDIFF: "spotdiff",
  WHACKMOLE: "whackmole",
  SIMON: "simon",
  BOGGLE: "boggle",
  DEALORNODEAL: "dealornodeal",
  METRONOME: "metronome",
  PIT: "pit",
  WHOSAIDIT: "whosaidit",
  MASQUERADE: "masquerade",
  CLOSETO20: "closeto20",
  SNAKE: "snake",
  MINESWEEPER: "minesweeper",
  STROOP: "stroop",
  REDLIGHTGREENLIGHT: "redlightgreenlight",
};

export const GAME_REGISTRY = {
  manual: { label: "Manual / In-Person", icon: "📋", rank: "manual", defaultDurationSec: 900, blurb: "Run any real-world battle yourselves; enter finishing order by hand." },
  match3: { label: "Match 3", icon: "💎", rank: "score-desc", defaultDurationSec: 180, blurb: "Swap adjacent gems to clear lines of 3+. Highest score when time's up wins." },
  frogger: { label: "Frogger", icon: "🐸", rank: "score-desc", defaultDurationSec: 180, config: { lives: 3 }, blurb: "Guide 5 frogs home across traffic. Forward hops, home arrivals, time bonuses, and bonus lady frogs/flies all score — highest total wins." },
  wordscramble: { label: "Word Scramble", icon: "🔤", rank: "time-asc", defaultDurationSec: 300, blurb: "Unscramble your own set of 7 floating, fading letters. Fastest to solve all 7 wins." },
  maze2d: { label: "2D Maze", icon: "🧩", rank: "time-asc", defaultDurationSec: 300, config: { size: 11 }, blurb: "Navigate from start to finish, fog-of-war style — only where you've walked (and the goal) is visible. Fastest solve wins." },
  mazeinvisible: { label: "Invisible Maze", icon: "🕶️", rank: "time-asc", defaultDurationSec: 300, config: { size: 15 }, blurb: "Collect 5 gems in order. Toggle between viewing the maze (can't move) and moving blind (walls invisible, wall bumps cost time). Fastest wins." },
  mazetrivia: { label: "Trivia Maze", icon: "🔑", rank: "time-asc", defaultDurationSec: 300, config: { size: 15 }, blurb: "Collect 5 gems in order. Each has a direct shortcut gated by a trivia question — answer right for instant access, wrong and you navigate the maze the long way. Fastest wins." },
  farkle: { label: "Farkle", icon: "🎲", rank: "score-desc", defaultDurationSec: 300, blurb: "Solo dice scoring game — bank points or push your luck. Highest banked score wins." },
  trivia: { label: "Trivia", icon: "❓", rank: "score-desc", defaultDurationSec: 130, config: { questions: 10, secPerQuestion: 10 }, blurb: "See each category, then choose your difficulty — Easy (1pt), Medium (2pts), or Hard (3pts). Highest total wins; fastest answers break ties." },
  breakout: { label: "Breakout", icon: "🧱", rank: "score-desc", defaultDurationSec: 180, config: { lives: 3 }, blurb: "Break bricks with a paddle and ball, after a 3-2-1 countdown. 3 lives — most bricks broken wins." },
  plinko: { label: "Plinko", icon: "🔴", rank: "score-desc", defaultDurationSec: 120, config: { shots: 3 }, blurb: "Drop 3 chips through the pegs into scoring slots. Highest total wins." },
  spotdiff: { label: "Spot the Difference", icon: "🔍", rank: "score-desc", defaultDurationSec: 180, config: { differences: 5 }, blurb: "Find all 5 differences between two scenes. Fastest to find them all wins." },
  whackmole: { label: "Whack-a-Mole", icon: "🔨", rank: "score-desc", defaultDurationSec: 90, blurb: "90 seconds, same standardized mole sequence for everyone. Gold moles are +5, red moles are -3, plain moles are +1. Most points wins." },
  simon: { label: "Simon", icon: "🔴", rank: "score-desc", defaultDurationSec: 300, blurb: "Watch a growing sequence of 4 pads, then repeat it. Every round adds one more step — most rounds completed before a mistake wins." },
  boggle: { label: "Boggle", icon: "🔠", rank: "score-desc", defaultDurationSec: 180, blurb: "3 flat minutes to trace adjacent letters into words on a 4x4 board. Standard length-based scoring — highest total wins." },
  dealornodeal: { label: "Deal or No Deal", icon: "💼", rank: "score-desc", defaultDurationSec: 300, blurb: "Pick a case, open others for banker offers, and decide when to walk away. Highest dollar amount wins." },
  metronome: { label: "Metronome", icon: "🥁", rank: "score-desc", defaultDurationSec: 180, blurb: "Hear an odd rhythm 3 times, then tap it back from memory. Closer to on-rhythm (same beat pattern for everyone) wins." },
  pit: { label: "The Agora", icon: "🏺", rank: "score-desc", defaultDurationSec: 480, blurb: "Blind-trade cards of godly item sets with everyone else — offer 1-4 at a time, swap the instant someone offers the same count. First 3 to hold all 9 of one set win." },
  whosaidit: { label: "Who Said It?", icon: "💬", rank: "score-desc", defaultDurationSec: 180, blurb: "8 real quotes pulled from Panopticon chat — guess who said each one. Most correct wins." },
  masquerade: { label: "Murder at the Masquerade", icon: "🍷", rank: "score-desc", defaultDurationSec: 600, blurb: "One active player secretly poisons one of two glasses and offers a target either one — the target picks what they drink, the active player's stuck with the rest. Two poison strikes and you're out. Last one standing wins." },
  closeto20: { label: "Close to 20", icon: "🐷", rank: "score-desc", defaultDurationSec: 480, blurb: "Everyone gets 13 coins and, on their turn, deposits all of them across at least 2 piggy banks (their own or others'). Go over 20 in your own bank and you're busted. Closest to 20 without going over wins." },
  snake: { label: "Snake", icon: "🐍", rank: "score-desc", defaultDurationSec: 180, blurb: "Classic Snake — eat food to grow, don't hit the walls or yourself. Speeds up as you go. Highest score wins." },
  minesweeper: { label: "Minesweeper", icon: "💣", rank: "score-desc", defaultDurationSec: 300, blurb: "Classic 9x9, 10-mine board, first click always safe. Clear it as fast as you can — cleared it wins by speed, didn't clear it ranks by how much you revealed." },
  stroop: { label: "Stroop Wall", icon: "🌈", rank: "score-desc", defaultDurationSec: 240, blurb: "20 color-name words, each printed in a mismatched ink color — tap the ink color, not the word. Same wall for everyone. Clear it fastest wins; a wrong answer costs time." },
  redlightgreenlight: { label: "Red Light, Green Light", icon: "🚦", rank: "score-desc", defaultDurationSec: 180, blurb: "Same red/green sequence for everyone. Tap fast on green to score, don't tap on red — that costs a life (3 total). First to 100 wins outright; otherwise it's whoever scored highest." },
};

export function gameConfigWithDefaults(gameType, overrides) {
  const base = GAME_REGISTRY[gameType]?.config || {};
  return { ...base, ...(overrides || {}) };
}
