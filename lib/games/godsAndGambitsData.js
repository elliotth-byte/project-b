import { storageSet, storageUpdate, subscribeGameState } from "../gameStorage";

// ─── Gods and Gambits — Big Screen ───
// A Greek-mythology reskin of Wits & Wagers (Vegas Edition)
// (boardgamegeek.com/boardgame/29223 for the base game, the Vegas
// Edition adds the persistent bankroll + up-to-2-split-bets rules this
// file follows), trimmed to 3 rounds instead of the original's 7 — see
// TOTAL_ROUNDS. The Oracle poses a numeric riddle each round; everyone
// privately writes down their own guess (submitGuess). Once every
// guess is in (or the window times out), the guesses reveal, sorted
// low-to-high onto a shared betting board — see computeBettingSpaces
// for exactly how DISTINCT guess values become betting spaces and how
// their odds are derived. Everyone then places up to 2 bets, in
// drachma, from their own running bankroll, on ANY space — their own
// guess, someone else's, or the special highest-odds fallback space
// (submitBets). Once every bet is in (or that window times out too),
// the Oracle's true answer reveals: the WINNING space is whichever
// guess is closest to the truth WITHOUT EXCEEDING IT (see resolveBets'
// own header comment for exactly how, and why, that maps onto the
// fallback space precisely when every single guess overshot). Bets on
// the winning space pay back stake + stake*odds; every other bet is
// simply lost. Separately, whoever actually SUBMITTED the winning
// guess splits a flat per-round bonus pot, regardless of what they
// personally bet. Bankrolls persist and compound across all 3 rounds;
// whoever has the most drachma after round 3 wins.
//
// Same simultaneous-secret-choice, resolve-on-everyone-in-or-timeout
// shape as lib/games/goldenFleeceData.js's submitChoice/
// tickGoldenFleece, just run twice per round (once for guesses, once
// for bets) with a reveal pause between the second resolution and the
// next round — same three-phase "answering -> revealed -> next" shape
// as lib/games/majorityRulesTvData.js.
//
// db: optional override on init/tick — see lib/games/
// plinkoBracketData.js's initPlinkoBracket for why (server-side auto-
// start/housekeeping passes its own db wrapper; a client call uses the
// default storage functions).

export const godsAndGambitsKey = (round) => `pb:godsandgambits:${round}`;
const key = godsAndGambitsKey;

export function subscribeGodsAndGambits(gameId, round, onChange) {
  return subscribeGameState(gameId, key(round), onChange);
}

export const TOTAL_ROUNDS = 3;
export const BANKROLL_START = 100;
export const MAX_BETS_PER_PLAYER = 2;
// Flat bonus, paid outright to whoever submitted the round's winning
// guess (split evenly on an exact tie), independent of anything they
// personally bet — a small "reward for good instincts" on top of the
// betting economy. Scales up slightly round to round, same as the
// stakes naturally do as bankrolls compound.
export const BONUS_POT_BY_ROUND = { 1: 25, 2: 30, 3: 40 };

const REVEAL_DISPLAY_MS = 10000;

// ─── The question bank ───
// 15-20 numeric-answer riddles, only 3 drawn per battle (no repeats
// within one), a mix of Greek-mythology/history trivia and well-known
// general numeric facts, both framed as "the Oracle asks..." on the
// TV. Every answer here is a well-established, round or famous figure
// (see this file's own review comment below each entry where the
// number isn't self-evidently common knowledge) — deliberately never
// an obscure precise statistic, since these have to just be RIGHT.
export const QUESTION_BANK = [
  { id: "labors", prompt: "The Oracle asks: how many labors was Hercules sentenced to complete?", answer: 12 },
  { id: "cerberus", prompt: "The Oracle asks: how many heads does Cerberus, hound of the Underworld, have?", answer: 3 },
  { id: "trojanwar", prompt: "The Oracle asks: according to legend, how many years did the Trojan War last?", answer: 10 },
  { id: "muses", prompt: "The Oracle asks: how many Muses inspire the arts in Greek mythology?", answer: 9 },
  { id: "olympicsban", prompt: "The Oracle asks: in what year AD did Emperor Theodosius I ban the ancient Olympic Games?", answer: 393 },
  { id: "olympicsrevived", prompt: "The Oracle asks: in what year were the modern Olympic Games revived, first held in Athens?", answer: 1896 },
  { id: "parthenon", prompt: "The Oracle asks: in what year BC was the Parthenon in Athens completed?", answer: 438 },
  { id: "olympians", prompt: "The Oracle asks: how many gods are traditionally counted among the Twelve Olympians?", answer: 12 },
  { id: "thebesgates", prompt: "The Oracle asks: in the legend of the Seven Against Thebes, how many gates guard the city?", answer: 7 },
  { id: "odysseyyears", prompt: "The Oracle asks: how many years did Odysseus wander before finally reaching home?", answer: 10 },
  { id: "wonders", prompt: "The Oracle asks: how many wonders made up the original list of the Wonders of the Ancient World?", answer: 7 },
  { id: "planets", prompt: "The Oracle asks: how many planets orbit the Sun in our solar system?", answer: 8 },
  { id: "bones", prompt: "The Oracle asks: how many bones are in the adult human skeleton?", answer: 206 },
  { id: "continents", prompt: "The Oracle asks: how many continents are there on Earth?", answer: 7 },
  { id: "soccer", prompt: "The Oracle asks: how many players from each team are on a soccer pitch at once?", answer: 11 },
  { id: "billofrights", prompt: "The Oracle asks: how many amendments make up the United States' Bill of Rights?", answer: 10 },
  { id: "beethoven", prompt: "The Oracle asks: how many symphonies did Beethoven complete in his lifetime?", answer: 9 },
  { id: "ww2end", prompt: "The Oracle asks: in what year did the Second World War end?", answer: 1945 },
  { id: "usstates", prompt: "The Oracle asks: how many states make up the United States?", answer: 50 },
  { id: "minutesinaday", prompt: "The Oracle asks: how many minutes are in a full day?", answer: 1440 },
];

function pickQuestions(count, rng) {
  const pool = [...QUESTION_BANK];
  const picked = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = Math.floor(rng() * pool.length);
    picked.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return picked;
}

export async function initGodsAndGambits(gameId, round, participants, now, db) {
  const set = db?.set || storageSet;
  const participantIds = participants.map((p) => p.id);
  const questions = pickQuestions(TOTAL_ROUNDS, Math.random);
  const bankrolls = Object.fromEntries(participantIds.map((id) => [id, BANKROLL_START]));

  await set(gameId, key(round), {
    participantIds,
    totalRounds: TOTAL_ROUNDS,
    questions, // this battle's 3 questions, in play order, no repeats
    roundNum: 1,
    question: questions[0],
    phase: "guessing", // "guessing" -> "betting" -> "revealed" -> next round's "guessing"
    phaseStartedAt: now,
    guesses: {}, // playerId -> number, THIS round only — a non-submitter just has no entry
    bettingSpaces: [], // computed once guessing resolves — see computeBettingSpaces
    pendingBets: {}, // playerId -> [{space, amount}] (possibly []), THIS round only — see submitBets
    bankrolls,
    reveal: null, // set once this round resolves — see resolveBets
    history: [], // resolved rounds, in order, for the TV/phone recap
    gameEnded: false,
  });
}

// Same target-turns-into-a-window approach as
// lib/games/goldenFleeceData.js's own decisionWindowMs. Guessing is a
// quick gut call, so it gets the smaller share of the budget; betting
// takes more thought (comparing spaces, sizing up to 2 bets), so it
// gets a longer window. Both are generous enough that fast tables
// finish well under budget via the fast-path resolve in submitGuess/
// submitBets, and slow tables still fit comfortably inside a
// recommended 480-600s Battle.
export function guessWindowMs(settings) {
  const totalSec = settings?.challengeDurationSec || 540;
  const perSec = Math.max(20, Math.min(35, totalSec / 18));
  return perSec * 1000;
}
export function betWindowMs(settings) {
  const totalSec = settings?.challengeDurationSec || 540;
  const perSec = Math.max(25, Math.min(40, totalSec / 14));
  return perSec * 1000;
}

// ─── Betting board construction ───
// Ranks DISTINCT guess values ascending (ties on the exact same number
// share one space, per the source game's own rule) and assigns
// increasing odds by rank: 1:1, 2:1, 3:1, 4:1, 5:1, 6:1, capping
// (repeating) at 6:1 for any rank beyond that — a low, conservative
// guess is the safest, most-likely-close bet and pays the least; the
// highest, most out-there guess is the least likely to be both correct
// AND not an overshoot, so it pays the most. On top of the guess
// spaces sits one more fixed space, "over" — betting that the true
// answer will fall BELOW every single guess submitted (see resolveBets
// for exactly when that fires and why). It's priced at the same odds
// as the single highest guess-space, on the reasoning that it's an
// equally-extreme, equally-unlikely outcome to the top guess itself
// being exactly right — not higher, not lower, just its own equally
// long shot.
export function computeBettingSpaces(guesses) {
  const byValue = new Map();
  Object.entries(guesses || {}).forEach(([pid, value]) => {
    if (typeof value !== "number" || !Number.isFinite(value)) return;
    if (!byValue.has(value)) byValue.set(value, []);
    byValue.get(value).push(pid);
  });
  const values = [...byValue.keys()].sort((a, b) => a - b);
  const spaces = values.map((value, idx) => ({
    id: `g${idx}`,
    value,
    ownerIds: byValue.get(value),
    odds: Math.min(idx + 1, 6),
  }));
  const topOdds = spaces.length > 0 ? spaces[spaces.length - 1].odds : 1;
  spaces.push({ id: "over", value: null, ownerIds: [], odds: topOdds });
  return spaces;
}

// A living player locks in ONE guess for the CURRENT round. Rejected
// as a no-op (same silent-reject convention as every other blind-
// choice game here) if the game's over, we're not in the guessing
// phase, this player already guessed, or the value isn't a finite
// number.
export async function submitGuess(gameId, round, playerId, value) {
  const num = Number(value);
  return storageUpdate(gameId, key(round), (fresh) => {
    if (!fresh || fresh.gameEnded) return fresh;
    if (fresh.phase !== "guessing") return fresh;
    if (!fresh.participantIds.includes(playerId)) return fresh;
    if (fresh.guesses[playerId] !== undefined) return fresh;
    if (!Number.isFinite(num)) return fresh;
    const next = { ...fresh, guesses: { ...fresh.guesses, [playerId]: num } };
    // Fast path: everyone's guessed — move straight to betting rather
    // than waiting for the next poll, same optimization as
    // goldenFleeceData.js's own submitChoice.
    const everyoneIn = fresh.participantIds.every((id) => next.guesses[id] !== undefined);
    return everyoneIn ? openBetting(next) : next;
  });
}

function openBetting(fresh) {
  return {
    ...fresh,
    bettingSpaces: computeBettingSpaces(fresh.guesses),
    phase: "betting",
    phaseStartedAt: Date.now(),
    pendingBets: {},
  };
}

// A living player locks in their bets for the CURRENT round — `bets`
// is an array of up to MAX_BETS_PER_PLAYER {space, amount} objects
// (space is a bettingSpaces id; amount a positive drachma stake). An
// empty array is a valid, deliberate "I'm sitting this round out"
// submission — same "not deciding costs you nothing, but earns you
// nothing either" shape as this game's own timeout default (see
// resolveBets). Rejected as a no-op if the game's over, we're not in
// the betting phase, this player already submitted, there are too many
// bets, any bet targets a space that doesn't exist, any amount isn't a
// positive number, or the total staked exceeds this player's CURRENT
// bankroll — validated here, against the only bankroll value that can
// possibly matter (a round only ever resolves once, sequentially, so
// there's no way for it to change between this validation and this
// round's own resolution).
export async function submitBets(gameId, round, playerId, bets) {
  return storageUpdate(gameId, key(round), (fresh) => {
    if (!fresh || fresh.gameEnded) return fresh;
    if (fresh.phase !== "betting") return fresh;
    if (!fresh.participantIds.includes(playerId)) return fresh;
    if (fresh.pendingBets[playerId] !== undefined) return fresh;
    const list = Array.isArray(bets) ? bets : [];
    if (list.length > MAX_BETS_PER_PLAYER) return fresh;
    const spaceIds = new Set(fresh.bettingSpaces.map((s) => s.id));
    let total = 0;
    for (const b of list) {
      const amount = Number(b?.amount);
      if (!spaceIds.has(b?.space)) return fresh;
      if (!Number.isFinite(amount) || amount <= 0) return fresh;
      total += amount;
    }
    const bankroll = fresh.bankrolls[playerId] || 0;
    if (total > bankroll) return fresh;

    const cleanBets = list.map((b) => ({ space: b.space, amount: Number(b.amount) }));
    const next = { ...fresh, pendingBets: { ...fresh.pendingBets, [playerId]: cleanBets } };
    const everyoneIn = fresh.participantIds.every((id) => next.pendingBets[id] !== undefined);
    return everyoneIn ? resolveBets(next) : next;
  });
}

// ─── Resolution: the Oracle's truth reveals ───
// The winning space is whichever guess is closest to the true answer
// WITHOUT EXCEEDING IT — i.e. the largest guess value that is still
// <= the true answer. That candidate can only fail to exist in exactly
// one scenario: every single submitted guess is HIGHER than the true
// answer (everyone overshot), since a guess below or equal to the
// truth always exists as a valid, always-computable "closest without
// going over" otherwise. That's precisely — and only — the case the
// fixed "over" space exists to cover (see computeBettingSpaces): it
// wins exactly when there's no legal closest-without-going-over guess
// at all, i.e. when the true answer actually fell UNDER every guess
// submitted. (No guesses submitted at all is folded into this same
// branch — there's nothing to be closest to, so "over" wins by
// default.)
function resolveBets(fresh) {
  const trueAnswer = fresh.question.answer;
  const spaces = fresh.bettingSpaces;
  const guessSpaces = spaces.filter((s) => s.value !== null);
  const candidates = guessSpaces.filter((s) => s.value <= trueAnswer);
  const winningSpace = candidates.length > 0
    ? candidates.reduce((best, s) => (s.value > best.value ? s : best))
    : spaces.find((s) => s.id === "over");

  const nextBankrolls = { ...fresh.bankrolls };
  const payouts = {}; // playerId -> { staked, won, bonus, netChange }

  fresh.participantIds.forEach((pid) => {
    const bets = fresh.pendingBets[pid] || [];
    let staked = 0;
    let won = 0;
    bets.forEach((b) => {
      staked += b.amount;
      if (b.space === winningSpace.id) {
        won += b.amount * winningSpace.odds + b.amount; // stake back + winnings
      }
    });
    payouts[pid] = { staked, won, bonus: 0, netChange: won - staked };
    nextBankrolls[pid] = (nextBankrolls[pid] || 0) - staked + won;
  });

  // The round's flat bonus pot goes outright to whoever submitted the
  // winning guess (split evenly on an exact tie) — but only when the
  // winning space is a REAL guess, never the "over" fallback (nobody
  // guessed the truth in that scenario, so there's nobody to reward).
  const bonusPot = BONUS_POT_BY_ROUND[fresh.roundNum] || 25;
  let bonusWinnerIds = [];
  if (winningSpace.id !== "over" && winningSpace.ownerIds.length > 0) {
    bonusWinnerIds = winningSpace.ownerIds;
    const share = bonusPot / bonusWinnerIds.length;
    bonusWinnerIds.forEach((pid) => {
      nextBankrolls[pid] = (nextBankrolls[pid] || 0) + share;
      payouts[pid] = { ...(payouts[pid] || { staked: 0, won: 0, netChange: 0 }), bonus: share, netChange: (payouts[pid]?.netChange || 0) + share };
    });
  }

  const revealEntry = {
    roundNum: fresh.roundNum,
    question: fresh.question,
    trueAnswer,
    bettingSpaces: spaces,
    winningSpaceId: winningSpace.id,
    bonusWinnerIds,
    bonusPot: bonusWinnerIds.length > 0 ? bonusPot : 0,
    payouts,
    bankrollsAfter: nextBankrolls,
  };

  return {
    ...fresh,
    bankrolls: nextBankrolls,
    phase: "revealed",
    phaseStartedAt: Date.now(),
    reveal: revealEntry,
    history: [...fresh.history, revealEntry],
  };
}

function startNextRound(fresh) {
  const nextRoundNum = fresh.roundNum + 1;
  return {
    ...fresh,
    roundNum: nextRoundNum,
    question: fresh.questions[nextRoundNum - 1],
    phase: "guessing",
    phaseStartedAt: Date.now(),
    guesses: {},
    bettingSpaces: [],
    pendingBets: {},
    reveal: null,
  };
}

// The authoritative tick — called on its own short interval by both
// the TV display and every active player's own phone (same belt-and-
// suspenders redundancy as lib/games/goldenFleeceData.js's own
// tickGoldenFleece), AND from lib/roundEngine.js's housekeeping pass,
// so a decision window (or the reveal pause) still resolves on time
// even if nobody currently has either screen open. No-ops unless the
// current phase has genuinely either been fully answered or timed out
// — safe to call as often as anyone likes.
export async function tickGodsAndGambits(gameId, round, settings, db) {
  const update = db?.update || storageUpdate;
  const now = Date.now();
  return update(gameId, key(round), (fresh) => {
    if (!fresh || fresh.gameEnded) return fresh;

    if (fresh.phase === "guessing") {
      const everyoneIn = fresh.participantIds.length > 0 && fresh.participantIds.every((id) => fresh.guesses[id] !== undefined);
      const timedOut = now - fresh.phaseStartedAt >= guessWindowMs(settings);
      if (!everyoneIn && !timedOut) return fresh;
      return openBetting(fresh);
    }

    if (fresh.phase === "betting") {
      const everyoneIn = fresh.participantIds.length > 0 && fresh.participantIds.every((id) => fresh.pendingBets[id] !== undefined);
      const timedOut = now - fresh.phaseStartedAt >= betWindowMs(settings);
      if (!everyoneIn && !timedOut) return fresh;
      return resolveBets(fresh);
    }

    if (fresh.phase === "revealed") {
      if (now - fresh.phaseStartedAt < REVEAL_DISPLAY_MS) return fresh;
      if (fresh.roundNum >= fresh.totalRounds) {
        return { ...fresh, gameEnded: true };
      }
      return startNextRound(fresh);
    }

    return fresh;
  });
}

// The value reported via reportScore/autoLockResolvedScores — just the
// current (or, once gameEnded, final) bankroll. Safe to read live at
// any point, same as lib/games/goldenFleeceData.js's own
// placementValue.
export function placementValue(state, playerId) {
  return state?.bankrolls?.[playerId] ?? BANKROLL_START;
}
