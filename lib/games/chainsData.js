import { storageSet, storageUpdate, subscribeGameState } from "../gameStorage";

// ─── Chains ───
// Every player builds their OWN chain: one {opponent, symbol} entry per
// every other living participant, in whatever order they choose — this
// order is entirely theirs; Bob can face Betty first while Betty faces
// Bob last, completely independent of each other. A chain must be fully
// built and locked in before ANYONE's results are revealed — no partial
// info leaks, and nothing resolves until every participant has locked
// in (same "no rescue for a straggler" tradeoff Murder at the
// Masquerade and Torched already accept for turn/lock-in-gated games in
// this app — documented, not fixed here).
//
// Per-pairing outcome: A's chosen symbol against B is compared to B's
// chosen symbol against A — these are two INDEPENDENT choices (neither
// player sees the other's pick), so the standard rock/paper/scissors
// rule decides who won that one pairing, symmetric regardless of either
// player's own chain order.
//
// Scoring, though, depends entirely on each player's OWN order: walking
// their chain in the sequence THEY chose, a win scores a point and the
// chain continues, a draw scores nothing but ALSO continues, and a loss
// breaks the chain outright — nothing past that point counts, no matter
// how many wins might have followed. Highest score wins; ties broken by
// whoever locked in earliest (see placementValue for how that's
// actually encoded, since results for everyone become known at the same
// moment once the last chain comes in — reportScore's own timestamp
// can't be what breaks the tie here).

const SYMBOLS = ["rock", "paper", "scissors"];
const BEATS = { rock: "scissors", paper: "rock", scissors: "paper" };

export const chainsKey = (round) => `pb:chains:${round}`;
const key = chainsKey;

export function subscribeChains(gameId, round, onChange) {
  return subscribeGameState(gameId, key(round), onChange);
}

// db: optional override — see lib/games/plinkoBracketData.js's
// initPlinkoBracket for why.
export async function initChains(gameId, round, participants, db) {
  const set = db?.set || storageSet;
  if (participants.length < 2) return; // degenerate case, handled client-side
  await set(gameId, key(round), {
    participantIds: participants.map((p) => p.id),
    chains: {}, // playerId -> [{ opponentId, symbol }, ...] — only present once FULLY built and locked in
    lockedInAt: {}, // playerId -> timestamp
    results: null, // computed once everyone's locked in — see computeResults
    revealed: false,
  });
}

// A valid chain has exactly one entry per OTHER participant (never
// themselves), no duplicates, no missing opponents, and every symbol is
// one of the three real choices.
export function isValidChain(chain, playerId, participantIds) {
  if (!Array.isArray(chain)) return false;
  const others = participantIds.filter((id) => id !== playerId);
  if (chain.length !== others.length) return false;
  const seen = new Set();
  for (const step of chain) {
    if (!step || step.opponentId === playerId) return false;
    if (!others.includes(step.opponentId)) return false;
    if (seen.has(step.opponentId)) return false;
    if (!SYMBOLS.includes(step.symbol)) return false;
    seen.add(step.opponentId);
  }
  return true;
}

function resolvePairing(symbolMine, symbolTheirs) {
  if (symbolMine === symbolTheirs) return "draw";
  return BEATS[symbolMine] === symbolTheirs ? "win" : "loss";
}

function computeResults(participantIds, chains) {
  const results = {};
  participantIds.forEach((playerId) => {
    const chain = chains[playerId] || [];
    let score = 0;
    let brokeAtOpponentId = null;
    const steps = [];
    for (const step of chain) {
      const oppChain = chains[step.opponentId] || [];
      const oppStep = oppChain.find((s) => s.opponentId === playerId);
      // Every participant's chain covers every other participant by
      // construction (isValidChain enforces this before a chain is ever
      // accepted), so oppStep should always exist here — this is just
      // defensive, not an expected path.
      if (!oppStep) { steps.push({ opponentId: step.opponentId, result: "draw", mySymbol: step.symbol, theirSymbol: null }); continue; }
      const result = resolvePairing(step.symbol, oppStep.symbol);
      steps.push({ opponentId: step.opponentId, result, mySymbol: step.symbol, theirSymbol: oppStep.symbol });
      if (result === "win") score += 1;
      else if (result === "loss") { brokeAtOpponentId = step.opponentId; break; }
      // a draw scores nothing but doesn't break the chain either
    }
    results[playerId] = { score, brokeAtOpponentId, steps };
  });
  return results;
}

// Submits a player's COMPLETE chain in one atomic write — there's no
// partial/draft state stored server-side at all (see file header on why
// that's deliberate: nothing here should be visible to anyone,
// including a half-built chain, until every participant has locked in).
// If this submission is the LAST one needed, results are computed and
// stored in this same update, so "everyone's in" and "results exist"
// become true at the exact same instant for every client watching.
export async function submitChain(gameId, round, playerId, chain) {
  return storageUpdate(gameId, key(round), (fresh) => {
    if (!fresh || fresh.revealed) return fresh;
    if (fresh.chains[playerId]) return fresh; // already locked in — can't resubmit
    if (!isValidChain(chain, playerId, fresh.participantIds)) return fresh;

    const nextChains = { ...fresh.chains, [playerId]: chain };
    const nextLockedInAt = { ...fresh.lockedInAt, [playerId]: Date.now() };
    const everyoneIn = fresh.participantIds.every((id) => !!nextChains[id]);

    return {
      ...fresh,
      chains: nextChains,
      lockedInAt: nextLockedInAt,
      results: everyoneIn ? computeResults(fresh.participantIds, nextChains) : fresh.results,
      revealed: everyoneIn,
    };
  });
}

// The value reported via reportScore. Encodes the tie-break (earlier
// lock-in wins) directly into the number rather than relying on
// reportScore's own finishedAt timestamp — everyone's results become
// known at the exact same moment (whichever submission was the last one
// needed), so each player's own reportScore call would all land around
// that same instant regardless of who ACTUALLY locked their chain in
// first. Score dominates (multiplied by a factor far larger than any
// possible score-to-score gap could offset), and within a tied score,
// an earlier lockedInAt timestamp produces a strictly higher value.
const TIE_BREAK_REFERENCE_MS = 9999999999999; // year ~2286 — comfortably past any real lockedInAt this app will ever see
export function placementValue(state, playerId) {
  if (!state.revealed) return 0; // no results yet
  const r = state.results?.[playerId];
  if (!r) return 0; // never submitted a chain at all
  const lockedInAt = state.lockedInAt?.[playerId] || 0;
  return r.score * 1e13 + (TIE_BREAK_REFERENCE_MS - lockedInAt);
}
