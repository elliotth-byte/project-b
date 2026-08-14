import { storageSet, storageUpdate, subscribeGameState } from "../gameStorage";

// ─── Close to 20 ───
// Adapted from the real Big Brother veto competition (bigbrother.
// fandom.com/wiki/Close_to_20). One judgment call worth being explicit
// about, since the source description leaves it slightly open: each
// player gets exactly ONE turn (not several), and on that turn they
// distribute their FULL 13-coin allotment across at least 2 different
// piggy banks (their own or anyone else's) in whatever split they
// choose — matching "a player must distribute their coins" (their whole
// allotment) rather than some smaller amount per turn. Turns are
// sequential and visible, same as the live version, since knowing where
// everyone else's bank currently stands is what makes the targeting
// choice meaningful — this isn't a simultaneous/blind game like The
// Agora.
//
// A bank that goes over 20 "busts" — permanently out of contention for
// winning, but that player still gets their own turn to distribute
// coins (busted just means their OWN bank is dead, not that they're
// removed from the game entirely — they can still bust other people).

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

export async function initCloseToTwenty(gameId, round, participants, seed) {
  const rand = seededRandom(seed || 1);
  if (participants.length < 2) return; // degenerate case, handled client-side

  const order = [...participants].map((p) => p.id).sort(() => rand() - 0.5);
  const banks = {};
  order.forEach((id) => (banks[id] = 0));

  await storageSet(gameId, key(round), {
    order,
    banks,
    busted: [],
    turnsTaken: [],
    activeIndex: 0,
    finalized: false,
  });
}

// deposits: [{targetId, amount}, ...] — must cover at least 2 distinct
// targets, every amount >= 1, and the total must equal the player's full
// 13-coin allotment. Rejected (no-op) if any of that doesn't hold, or if
// it's not actually this player's turn.
export async function submitDistribution(gameId, round, playerId, deposits) {
  return storageUpdate(gameId, key(round), (fresh) => {
    if (!fresh || fresh.finalized) return fresh;
    if (fresh.order[fresh.activeIndex] !== playerId || fresh.turnsTaken.includes(playerId)) return fresh;

    const distinctTargets = new Set(deposits.map((d) => d.targetId));
    if (distinctTargets.size < 2) return fresh;
    if (deposits.some((d) => !Number.isInteger(d.amount) || d.amount < 1 || !fresh.order.includes(d.targetId))) return fresh;
    const total = deposits.reduce((s, d) => s + d.amount, 0);
    if (total !== STARTING_COINS) return fresh;

    const banks = { ...fresh.banks };
    deposits.forEach((d) => { banks[d.targetId] = (banks[d.targetId] || 0) + d.amount; });

    let busted = fresh.busted;
    Object.entries(banks).forEach(([pid, amt]) => {
      if (amt > TARGET && !busted.includes(pid)) busted = [...busted, pid];
    });

    const turnsTaken = [...fresh.turnsTaken, playerId];
    const allDone = turnsTaken.length >= fresh.order.length;

    return {
      ...fresh,
      banks, busted, turnsTaken,
      activeIndex: allDone ? fresh.activeIndex : fresh.activeIndex + 1,
      finalized: allDone,
    };
  });
}

// A busted bank is guaranteed the lowest tier regardless of how far over
// 20 it went — the real competition treats busting as a flat "out of
// contention," not a graded penalty. Among non-busted players, closer to
// 20 (a bigger bank value) is straightforwardly better, which the raw
// bank total already encodes with no extra math needed.
export function placementValue(state, playerId) {
  if (state.busted.includes(playerId)) return -1000;
  return state.banks[playerId] || 0;
}

export { STARTING_COINS, TARGET };
