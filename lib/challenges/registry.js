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
  SLIDINGPUZZLE: "slidingpuzzle",
  TORCHED: "torched",
  CHAINS: "chains",
  LABYRINTH: "labyrinth",
  ORACLESSEAL: "oraclesseal",
};

export const GAME_REGISTRY = {
  // No longer offered as a choice in the host's game picker (see
  // ChallengeHost.jsx) — kept here, not deleted, purely so any PAST
  // challenge that already used it (challenge history, ceremony
  // recaps, ...) still resolves to a real label/icon/blurb instead of
  // showing up blank or broken.
  manual: { label: "Manual / In-Person", icon: "📋", rank: "manual", defaultDurationSec: 900, blurb: "Run any real-world battle yourselves; enter finishing order by hand." },
  match3: { label: "Match 3", icon: "💎", rank: "score-desc", defaultDurationSec: 180, category: "Arcade", blurb: "Swap adjacent gems to clear lines of 3+. Highest score when time's up wins." },
  frogger: { label: "Frogger", icon: "🐸", rank: "score-desc", defaultDurationSec: 180, config: { lives: 3 }, category: "Arcade", blurb: "Guide 5 frogs home across traffic. Forward hops, home arrivals, time bonuses, and bonus lady frogs/flies all score — highest total wins." },
  wordscramble: { label: "Word Scramble", icon: "🔤", rank: "time-asc", defaultDurationSec: 300, category: "Word", blurb: "Unscramble your own set of 7 floating, fading letters. Fastest to solve all 7 wins." },
  maze2d: { label: "2D Maze", icon: "🧩", rank: "time-asc", defaultDurationSec: 300, config: { size: 11 }, category: "Maze", blurb: "Navigate from start to finish, fog-of-war style — only where you've walked (and the goal) is visible. Fastest solve wins." },
  mazeinvisible: { label: "Invisible Maze", icon: "🕶️", rank: "time-asc", defaultDurationSec: 300, config: { size: 15 }, category: "Maze", blurb: "Collect 3 gems in order. Toggle between viewing the maze (can't move) and moving blind (walls invisible, wall bumps cost time). Fastest wins." },
  mazetrivia: { label: "Trivia Maze", icon: "🔑", rank: "time-asc", defaultDurationSec: 300, config: { size: 15 }, category: "Maze", blurb: "Collect 5 gems in order. Each has a direct shortcut gated by a trivia question — answer right for instant access, wrong and you navigate the maze the long way. Fastest wins." },
  farkle: { label: "Farkle", icon: "🎲", rank: "score-desc", defaultDurationSec: 300, category: "Luck", blurb: "Solo dice scoring game — bank points or push your luck. Highest banked score wins." },
  trivia: { label: "Trivia", icon: "❓", rank: "score-desc", defaultDurationSec: 130, config: { questions: 10, secPerQuestion: 10 }, category: "Trivia", blurb: "See each category, then choose your difficulty — Easy (1pt), Medium (2pts), or Hard (3pts). Highest total wins; fastest answers break ties." },
  breakout: { label: "Breakout", icon: "🧱", rank: "score-desc", defaultDurationSec: 180, config: { lives: 3 }, category: "Arcade", blurb: "Break bricks with a paddle and ball, after a 3-2-1 countdown. 3 lives — most bricks broken wins." },
  plinko: { label: "Plinko", icon: "🔴", rank: "score-desc", defaultDurationSec: 120, config: { shots: 3 }, category: "Arcade", blurb: "Drop 3 chips through the pegs into scoring slots. Highest total wins." },
  spotdiff: { label: "Spot the Difference", icon: "🔍", rank: "score-desc", defaultDurationSec: 180, config: { differences: 5 }, category: "Visual", blurb: "Find all 5 differences between two scenes. Fastest to find them all wins." },
  whackmole: { label: "Whack-a-Mole", icon: "🔨", rank: "score-desc", defaultDurationSec: 90, category: "Speed", blurb: "90 seconds, same standardized mole sequence for everyone. Gold moles are +5, red moles are -3, plain moles are +1. Most points wins." },
  simon: { label: "Simon", icon: "🔴", rank: "score-desc", defaultDurationSec: 300, category: "Puzzle", blurb: "Watch a growing sequence of 4 pads, then repeat it. Every round adds one more step — most rounds completed before a mistake wins." },
  boggle: { label: "Boggle", icon: "🔠", rank: "score-desc", defaultDurationSec: 180, category: "Word", blurb: "3 flat minutes to trace adjacent letters into words on a 4x4 board. Standard length-based scoring — highest total wins." },
  dealornodeal: { label: "Deal or No Deal", icon: "💼", rank: "score-desc", defaultDurationSec: 420, category: "Luck", blurb: "Pick a case, open others for banker offers, and decide when to walk away. Highest dollar amount wins." },
  metronome: { label: "Metronome", icon: "🥁", rank: "score-desc", defaultDurationSec: 180, category: "Precision", blurb: "Hear an odd rhythm 3 times, then tap it back from memory. Closer to on-rhythm (same beat pattern for everyone) wins." },
  pit: { label: "The Agora", icon: "🏺", rank: "score-desc", defaultDurationSec: 480, category: "Negotiation", blurb: "Blind-trade cards of godly item sets with everyone else — offer 1-4 at a time, swap the instant someone offers the same count. First 3 to hold all 9 of one set win." },
  whosaidit: { label: "Who Said It?", icon: "💬", rank: "score-desc", defaultDurationSec: 180, category: "Trivia", blurb: "8 real quotes pulled from Panopticon chat — guess who said each one. Most correct wins." },
  masquerade: { label: "Murder at the Masquerade", icon: "🍷", rank: "score-desc", defaultDurationSec: 600, category: "Negotiation", blurb: "One active player secretly poisons one of two glasses and offers a target either one — the target picks what they drink, the active player's stuck with the rest. Two poison strikes and you're out. Last one standing wins." },
  closeto20: { label: "Close to 20", icon: "🐷", rank: "score-desc", defaultDurationSec: 480, category: "Prediction", blurb: "Everyone gets 13 coins and, on their turn, deposits all of them across at least 2 piggy banks (their own or others'). Go over 20 in your own bank and you're busted. Closest to 20 without going over wins." },
  snake: { label: "Snake", icon: "🐍", rank: "score-desc", defaultDurationSec: 180, category: "Arcade", blurb: "Classic Snake — eat food to grow, don't hit the walls or yourself. Speeds up as you go. Highest score wins." },
  minesweeper: { label: "Minesweeper", icon: "💣", rank: "score-desc", defaultDurationSec: 300, category: "Puzzle", blurb: "Classic 9x9, 10-mine board, first click always safe. Clear it as fast as you can — cleared it wins by speed, didn't clear it ranks by how much you revealed." },
  stroop: { label: "Stroop Wall", icon: "🌈", rank: "score-desc", defaultDurationSec: 240, category: "Visual", blurb: "20 color-name words, each printed in a mismatched ink color. Every tile asks for something different — sometimes the color it's printed in, sometimes the word it says — read each prompt. Same wall and sequence for everyone. Clear it fastest wins; a wrong answer costs time." },
  redlightgreenlight: { label: "Red Light, Green Light", icon: "🚦", rank: "score-desc", defaultDurationSec: 180, category: "Speed", blurb: "Same red/green sequence for everyone. Tap fast on green to score, don't tap on red — that costs a life (3 total). First to 100 wins outright; otherwise it's whoever scored highest." },
  sandsoftime: { label: "Sands of Time", icon: "⏳", rank: "score-desc", defaultDurationSec: 300, category: "Endurance", blurb: "Four hourglasses (10-60s each) run at once — re-flip one once it's at least 60% drained to keep it going. Every flip fades that hourglass further, until after 5 it's invisible and you're timing it blind. Let any one fully run out and it's over, everything's revealed, and your time locked in — the longer you last, the higher you rank." },
  slidingpuzzle: { label: "Sliding Puzzle", icon: "🧩", rank: "score-desc", defaultDurationSec: 240, category: "Puzzle", blurb: "Classic 15-puzzle — slide tiles into the empty slot to get them back in order, 1 to 15. Same scramble for everyone, guaranteed solvable. Fastest solve wins; ran out of time ranks by how many tiles were placed correctly." },
  torched: { label: "Torched", icon: "🔥", rank: "score-desc", defaultDurationSec: 360, category: "Prediction", blurb: "Everyone secretly hides a 3-cell marker on one shared grid. Once placement's done, players take turns calling out coordinates — land on someone's marker and their whole thing goes up in flames, eliminating them on the spot. Last marker standing wins; everyone else is ranked by how long they survived." },
  chains: { label: "Chains", icon: "✊", rank: "score-desc", defaultDurationSec: 300, category: "Negotiation", blurb: "Every player builds their own private order to face everyone else, picking rock, paper, or scissors against each — completely independent of what anyone else chooses or how they've ordered their own chain. Once everyone's locked in, chains play out: a win keeps yours going, a draw doesn't score but doesn't stop you either, a loss ends it right there. Highest score wins; ties go to whoever locked in first." },
  labyrinth: { label: "The Labyrinth", icon: "🐂", rank: "score-desc", defaultDurationSec: 240, config: { size: 13 }, category: "Maze", blurb: "Navigate a maze collecting scattered olives while the Minotaur hunts you down — it recalculates the shortest path to wherever you actually are every single step, so there's no outrunning it by luck. Clear every olive before it catches you for the best possible finish; otherwise, whoever collected the most before getting caught (or before time runs out) ranks highest." },
  oraclesseal: { label: "The Oracle's Seal", icon: "🏺", rank: "score-desc", defaultDurationSec: 180, category: "Precision", blurb: "Trace a shape stamped into a fragile clay tablet, from start back around to start — stray off the outline or lift your finger before you're done and it cracks. Too many cracks and the whole tablet shatters. Finish clean and it's a race against the clock; shatter first and you're ranked by how much of the outline you completed." },
  scavengerhunt: { label: "Scavenger Hunt", icon: "🏺", rank: "score-desc", defaultDurationSec: 600, category: "Negotiation", blurb: "Race between 8 temples collecting a set of 8 sacred offerings — each temple's stock is fixed and shared, first come first served, gone for good once someone takes it. Collect one of everything and return to Mount Olympus; the first 3 to do it win outright, everyone else is ranked by how much of the set they'd completed." },
  hue: { label: "Hue", icon: "🎨", rank: "score-desc", defaultDurationSec: 120, category: "Visual", blurb: "Mix red, green, and blue sliders to recreate a target color entirely by eye — no live closeness score while you're mixing, just your own swatch to compare. Lock in when you're happy with it. Scored on how close you land, with a small bonus for locking in quickly." },
  operator: { label: "Operator", icon: "🧮", rank: "score-desc", defaultDurationSec: 180, category: "Puzzle", blurb: "Combine five numbers with +, −, ×, and ÷ to hit a hidden target — tap a number, an operator, then another number, and the result becomes a new tile to keep working with. Undo or reset if you get stuck. Scored purely on speed — fastest to the target wins." },
  tavo: { label: "Tavo", icon: "📦", rank: "score-desc", defaultDurationSec: 180, category: "Puzzle", blurb: "Push crates onto their markers — walk into a crate to shove it one square, but you can only push, never pull, so plan your order before you move. Every board is guaranteed solvable. Undo and Reset are both free of penalty; mostly the clock decides your score, with a small bonus for a clean, efficient line." },
  tangle: { label: "Tangle", icon: "🪢", rank: "score-desc", defaultDurationSec: 150, category: "Puzzle", blurb: "Dots joined by strings, some crossing (shown in red) — drag the dots until no strings cross at all. Every knot here is guaranteed fully untangleable. Re-scramble resets the layout but keeps the clock running. Your time is your score — the faster you untangle it, the better." },
  bloom: { label: "Bloom", icon: "🌸", rank: "score-desc", defaultDurationSec: 180, category: "Puzzle", blurb: "The board blooms from a glowing center patch — tap a hue and the patch floods to that color, absorbing every connected cell that matches. Keep sweeping until the whole board is one light. No clock pressure — scored on how few sweeps it takes." },
};

export function gameConfigWithDefaults(gameType, overrides) {
  const base = GAME_REGISTRY[gameType]?.config || {};
  return { ...base, ...(overrides || {}) };
}
