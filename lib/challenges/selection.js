import { GAME_REGISTRY } from "./registry";

// ─── Random challenge selection ───
// An alternative to the host manually picking a game type each round
// (see settings.challengeSelectionMode in lib/gameState.js). Two rules,
// layered — see eligibleGameTypes below for exactly how they combine
// and relax under pressure:
//   - No more than 2 plays of the same subcategory across the whole
//     season (categories are the ones shown in the host's own picker —
//     Arcade, Word, Maze, Luck, Trivia, Visual, Speed, Puzzle,
//     Precision, Negotiation, Prediction — see each game's own
//     `category` field in lib/challengeGames.js).
//   - Never the exact same game twice in a season.
//
// Hephaestus's character power ("see two options for the next round's
// challenge and pick between them" — see lib/characterPowers.js) is
// built directly on top of this rather than as separate logic: it's the
// same eligible pool, just drawing two instead of one.

// How many times has each category already been played this season —
// derived from KEY_CHALLENGE_HISTORY (lib/gameState.js), which already
// records gameType per round. "manual" entries don't have a category at
// all (see the registry's own comment on why that entry still exists)
// and are simply skipped rather than counted against anything.
export function categoryPlayCounts(challengeHistory) {
  const counts = {};
  for (const entry of challengeHistory || []) {
    const category = GAME_REGISTRY[entry.gameType]?.category;
    if (!category) continue;
    counts[category] = (counts[category] || 0) + 1;
  }
  return counts;
}

const CATEGORY_CAP = 2;

// Which exact game types have already been played this season — used
// to avoid ever repeating the same game twice, layered on top of (not
// instead of) the category cap below.
function playedGameTypes(challengeHistory) {
  return new Set((challengeHistory || []).map((e) => e.gameType));
}

// The pool of game types still eligible to be randomly picked. Layered,
// progressively-relaxed preference — each constraint only gets dropped
// once it would otherwise leave nothing to pick from, rather than all
// relaxing at once:
//   0. Never a game that's been turned off — either for this season
//      specifically (settings.disabledChallenges) or platform-wide
//      (see lib/platformSettings.js) — combined and passed in as
//      disabledTypes by the caller. Applied FIRST, before any of the
//      layers below even run, so a disabled game can never sneak back
//      in through one of the later fallback layers. The one exception:
//      if disabling would leave literally nothing left to pick from at
//      all (every single game disabled somehow), the filter is dropped
//      entirely rather than breaking challenge selection outright —
//      matching this function's own existing philosophy of relaxing
//      constraints rather than returning an empty, unusable pool.
//   1. Not yet played this season AT ALL, and under the category cap —
//      the ideal case, satisfying both "no repeats" and "no more than
//      2 per category".
//   2. If that's empty (every remaining under-cap game has already been
//      played once — plausible once a season's deep into its games),
//      relax the no-repeat rule but keep respecting the category cap.
//   3. If THAT'S also empty (every category maxed out — needs a
//      genuinely long season, 11 categories × 2 is 22 rounds), fall
//      back to the full pool with nothing enforced, rather than random
//      selection just stopping working entirely.
export function eligibleGameTypes(challengeHistory, disabledTypes = []) {
  const counts = categoryPlayCounts(challengeHistory);
  const played = playedGameTypes(challengeHistory);
  const everyType = Object.keys(GAME_REGISTRY).filter((k) => k !== "manual");
  const disabledSet = new Set(disabledTypes);
  const notDisabled = everyType.filter((k) => !disabledSet.has(k));
  const allTypes = notDisabled.length > 0 ? notDisabled : everyType;
  const underCap = allTypes.filter((k) => (counts[GAME_REGISTRY[k].category] || 0) < CATEGORY_CAP);
  const underCapAndUnplayed = underCap.filter((k) => !played.has(k));
  if (underCapAndUnplayed.length > 0) return underCapAndUnplayed;
  if (underCap.length > 0) return underCap;
  return allTypes;
}

function randomPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// A single random pick — the normal (non-Hephaestus) case.
export function pickRandomChallenge(challengeHistory, disabledTypes = []) {
  const pool = eligibleGameTypes(challengeHistory, disabledTypes);
  return randomPick(pool);
}

// Hephaestus's two-option draw — two DISTINCT game types (never the same
// game offered as both options) from the same eligible pool. Falls back
// to offering the single eligible option twice-over only in the
// degenerate case where the pool has exactly one entry (nothing else
// left to pair it with) — Hephaestus still gets to "pick", it's just
// not a meaningful choice in that edge case, which is preferable to
// crashing or returning fewer than two options.
export function pickHephaestusOptions(challengeHistory, disabledTypes = []) {
  const pool = eligibleGameTypes(challengeHistory, disabledTypes);
  if (pool.length <= 1) return [pool[0], pool[0]];
  const first = randomPick(pool);
  let second = randomPick(pool);
  while (second === first) second = randomPick(pool);
  return [first, second];
}

// Per-round game_state key for Hephaestus's two-option draw — shaped
// { options: [gameTypeA, gameTypeB], chosen: null | gameTypeA/B }. Keyed
// by round number the same way other per-round state throughout this
// app is (see e.g. lib/chaosDraw.js's exileContext), since "the next
// round's challenge" is meaningful per-round, not season-wide.
export function hephaestusDrawKey(round) {
  return `pb:hephaestus-draw:${round}`;
}

// Same "pick once, persist" reasoning as Hephaestus's draw — without
// this, a host refreshing the setup screen mid-round would get a
// DIFFERENT random pick every time (nothing currently remembers what
// was already rolled for this specific round's setup).
export function randomPickKey(round) {
  return `pb:random-pick:${round}`;
}
