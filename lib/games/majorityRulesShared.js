// ─── Majority Rules — shared question bank + pairing algorithm ───
// Both modes (lib/games/majorityRulesData.js's regular mode and
// lib/games/majorityRulesTvData.js's Big Screen mode) draw from this
// exact same 23-question bank and the exact same "who faces whom"
// distribution algorithm, so neither file duplicates the content or the
// (slightly fiddly) fairness logic. Each question is a forced choice
// between exactly two currently-alive players — never a general trivia
// question — so building a "round" of these always means picking N
// question prompts AND assigning each one a pair of two different alive
// players, trying to spread appearances roughly evenly across everyone
// competing rather than letting the same couple of players get asked
// about over and over by pure chance.

export const QUESTION_BANK = [
  "Whose life story would make more money at the box office?",
  "Who would win a beauty pageant?",
  "Who is more likely to put a larger than life sculpture of themself in their front yard?",
  "Who has more social media followers?",
  "Who would you cheat off of during an exam?",
  "What would you prefer pack your parachute before jumping out of an airplane?",
  "Who is more likely to talk their way out of a traffic ticket?",
  "Who would you not let your sibling go on a date with?",
  "Who would hold a grudge the longest?",
  "Who would be the best person to cheer you up if you were feeling down?",
  "Who is most likely to turn 1 thousand dollars into 10 million dollars?",
  "Who would help an old lady cross the street?",
  "Who is smarter?",
  "Who is tougher competition?",
  "Who is funnier?",
  "Who has a better smile?",
  "Who is more likely to return a lost wallet?",
  "Who looks at themselves in the mirror more?",
  "Who would the majority rather receive mouth to mouth resuscitation from?",
  "Who is a pickier eater?",
  "Who would you rather babysit your kids?",
  "Who is the best cook?",
  "Who would write a better love poem?",
];

// The game-type registry keys (see lib/challenges/registry.js) —
// exported here too so both mode data files can reference the same
// literal rather than each hardcoding its own copy of the string.
export const MAJORITY_RULES_GAME_TYPE = "majorityrules";
export const MAJORITY_RULES_TV_GAME_TYPE = "majorityrulestv";

// Fisher-Yates, generic over whatever rng function is handed in — every
// caller here either passes Math.random (fine: this is one-time,
// server-authoritative init/draw, not something each client needs to
// independently re-derive the same way the solo self-contained games'
// seeded scrambles do) or its own seeded generator.
function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Picks `count` distinct question prompts, preferring ones not already
// in `excludeTexts` (used by Big Screen mode's sudden-death draws so it
// doesn't immediately repeat one of the 8 questions already asked this
// battle). If excluding leaves too small a pool to satisfy `count`, this
// falls back to the full bank rather than crashing or silently
// returning fewer than asked for — sudden death can run long enough to
// exhaust the bank's remaining unused entries, and re-using an entry at
// that point (with a fresh player pairing) is a fine, explicitly-allowed
// simplification rather than something worth guarding harder against.
export function pickQuestionTexts(count, rng, excludeTexts = []) {
  const random = rng || Math.random;
  let pool = QUESTION_BANK.filter((q) => !excludeTexts.includes(q));
  if (pool.length < count) pool = QUESTION_BANK;
  return shuffle(pool, random).slice(0, count);
}

// The actual "who faces whom" distribution: round-robins through a
// shuffled player order, cycling as many times as needed to fill every
// slot (2 per question), then shuffles the resulting flat slot list
// before pairing off consecutive slots into questions — the shuffle
// after the round-robin build is what keeps a given question's two
// players from being predictable just from knowing the fixed cycle
// order. If that pairing happens to land the same player on both sides
// of a single question (only possible once there are few enough alive
// players that collisions become likely), this does a simple local
// repair: swap one side with the next question's corresponding side.
// Not a globally optimal repair, just "good enough, never crashes,
// never leaves a question with a player facing themselves" — exactly
// what a battle-royale-style forced-choice game like this needs, not a
// perfectly balanced combinatorial design.
export function pairQuestions(questionTexts, alivePlayers, rng) {
  const random = rng || Math.random;
  const ids = (alivePlayers || []).map((p) => p.id);
  const n = ids.length;
  const qCount = questionTexts.length;
  if (n === 0 || qCount === 0) return [];

  const slotsNeeded = qCount * 2;
  let cycle = [];
  while (cycle.length < slotsNeeded) {
    cycle = cycle.concat(shuffle(ids, random));
  }
  const slots = shuffle(cycle.slice(0, slotsNeeded), random);

  const pairs = [];
  for (let i = 0; i < slots.length; i += 2) {
    pairs.push([slots[i], slots[i + 1]]);
  }

  // Local repair for same-player pairs — only possible (and only fixable)
  // when there are at least 2 distinct alive players to swap in from
  // elsewhere. With exactly 1 alive player, every "pair" is necessarily
  // that same player twice; there's nothing to repair, so this is left
  // as-is rather than looping forever trying to fix the unfixable.
  if (n > 1) {
    for (let i = 0; i < pairs.length; i++) {
      if (pairs[i][0] === pairs[i][1]) {
        const next = pairs[(i + 1) % pairs.length];
        if (next !== pairs[i]) {
          const tmp = pairs[i][1];
          pairs[i][1] = next[0];
          next[0] = tmp;
        }
      }
    }
  }

  return questionTexts.map((text, i) => ({
    id: `mr_${Date.now()}_${i}_${Math.floor(random() * 1e6)}`,
    text,
    playerAId: pairs[i][0],
    playerBId: pairs[i][1],
  }));
}

// The one function most call sites actually need: pick `count` fresh
// question prompts AND pair them against the current alive roster in
// one step. Big Screen mode's sudden-death draws call the two pieces
// above directly instead, since it needs to draw one question at a time
// against a running `excludeTexts` list that grows as the tiebreaker
// runs long.
export function buildQuestionSet(alivePlayers, count, rng) {
  const texts = pickQuestionTexts(count, rng);
  return pairQuestions(texts, alivePlayers, rng);
}
