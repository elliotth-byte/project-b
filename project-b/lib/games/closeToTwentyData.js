import { storageSet, storageUpdate, subscribeGameState } from "../gameStorage";

// ─── Close to 20 ───
// Adapted from the real Big Brother veto competition (bigbrother.
// fandom.com/wiki/Close_to_20). Simultaneous and blind, not sequential:
// every player independently distributes their full 13-coin allotment
// across at least 2 piggy banks (their own or anyone else's) without
// seeing anyone else's moves OR any bank's running total — including
// their own. Nobody knows where anything stands, playing or spectating,
// until every participant has submitted (or the challenge's own time
// limit runs out), at which point all distributions apply at once and
// every bank total is revealed together — the same all-at-once, blind
// suspense the real competition uses, since knowing your own running
// total mid-round would take away exactly the guesswork that makes the
// targeting decisions meaningful.
//
// A player who never submits before time runs out simply never
// distributes their coins — nobody receives them. Same consequence as
// forfeiting any other timed challenge here.
//
// A bank that ends up over 20 "busts" — out of contention for winning,
// but that's determined only at the reveal, all at once, not something
// that can happen "mid-game" the way it could in the old sequential
// version, since nothing is visible until then anyway.

const STARTING_COINS = 13;
const TARGET = 20;

function seededRandom(seed) {
  let s = seed || 1;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

const key = (round) => `pb:closeto20:${round}`;

export function subscribeCloseToTwenty(gameId, round, onChange) {
  return subscribeGameState(gameId, key(round), onChange);
}

// db: optional override — see lib/games/plinkoBracketData.js's
// initPlinkoBracket for why.
export async function initCloseToTwenty(gameId, round, participants, seed, db) {
  const set = db?.set || storageSet;
  const rand = seededRandom(seed || 1);
  if (participants.length < 2) return; // degenerate case, handled client-side

  const participantIds = [...participants].map((p) => p.id).sort(() => rand() - 0.5);

  await set(gameId, key(round), {
    participantIds,
    submissions: {}, // { [playerId]: [{targetId, amount}, ...] } — hidden from every client's UI until revealed
    submittedIds: [],
    revealed: false,
    banks: {}, // only populated once revealed
    busted: [], // only populated once revealed
  });
}

// deposits: [{targetId, amount}, ...] — must cover at least 2 distinct
// targets, every amount >= 1, and the total must equal the player's full
// 13-coin allotment. Rejected (no-op) if any of that doesn't hold, or if
// this player's already submitted.
export async function submitDistribution(gameId, round, playerId, deposits) {
  return storageUpdate(gameId, key(round), (fresh) => {
    if (!fresh || fresh.revealed || fresh.submittedIds.includes(playerId)) return fresh;
    if (!fresh.participantIds.includes(playerId)) return fresh;

    const distinctTargets = new Set(deposits.map((d) => d.targetId));
    if (distinctTargets.size < 2) return fresh;
    if (deposits.some((d) => !Number.isInteger(d.amount) || d.amount < 1 || !fresh.participantIds.includes(d.targetId))) return fresh;
    const total = deposits.reduce((s, d) => s + d.amount, 0);
    if (total !== STARTING_COINS) return fresh;

    return {
      ...fresh,
      submissions: { ...fresh.submissions, [playerId]: deposits },
      submittedIds: [...fresh.submittedIds, playerId],
    };
  });
}

// Any connected client calls this once everyone's submitted (or the
// challenge's own timer has run out) — same "any client drives shared
// state forward" pattern used throughout the other live games. Computes
// every bank total from every submission at once and reveals them all
// together; a no-op if already revealed, so it's safe to call
// redundantly from multiple clients.
export async function revealBanks(gameId, round) {
  return storageUpdate(gameId, key(round), (fresh) => {
    if (!fresh || fresh.revealed) return fresh;

    const banks = {};
    fresh.participantIds.forEach((id) => (banks[id] = 0));
    Object.values(fresh.submissions).forEach((deposits) => {
      deposits.forEach((d) => { banks[d.targetId] = (banks[d.targetId] || 0) + d.amount; });
    });

    const busted = Object.entries(banks).filter(([, amt]) => amt > TARGET).map(([pid]) => pid);

    return { ...fresh, banks, busted, revealed: true };
  });
}

// A busted bank is guaranteed the lowest tier regardless of how far over
// 20 it went — the real competition treats busting as a flat "out of
// contention," not a graded penalty. Among non-busted players, closer to
// 20 (a bigger bank value) is straightforwardly better, which the raw
// bank total already encodes with no extra math needed. Only meaningful
// once state.revealed is true — banks/busted are empty before that.
export function placementValue(state, playerId) {
  if (state.busted.includes(playerId)) return -1000;
  return state.banks[playerId] || 0;
}

export { STARTING_COINS, TARGET };
