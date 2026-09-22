import { storageUpdate, subscribeGameState } from "../gameStorage";

// ─── Deal or No Deal ───
// Previously this game's ENTIRE state lived in local React component
// state — nothing persisted to the server at all, unlike every other
// mini-game in this app. That was directly exploitable: the case-to-
// value shuffle was seeded deterministically from challenge.startedAt
// (fixed for the whole challenge) plus a player-id-derived offset, so
// it never changed across a reload — a player could open cases,
// memorize which one held a big number, reload (wiping local state
// back to "pick your case" with the exploiter's knowledge intact but
// the SAME shuffle still in play), and deliberately choose the case
// they already knew the value of. Reported directly by the season's
// host with the exact box-and-reset sequence, not a theoretical
// concern.
//
// The fix here is architectural, not just "shuffle better" — even a
// perfectly random shuffle doesn't help if a player can reload AFTER
// learning something and get a fresh pick against the same board. Case
// values are computed once and written to game_state immediately
// (dondKey, below) the first time a player reaches this game, and
// myCase — once chosen — is written the same way and never allowed to
// change again, regardless of how many times the component remounts.
// A reload now just re-subscribes to the exact same persisted state,
// same as every other game already works.
//
// Full 26-case standard US show values (verified against the actual
// show's board, not approximated) — the previous version deliberately
// used a compacted 16-case set to fit inside a challenge's time budget;
// this restores the full set as asked, with a correspondingly adjusted
// (still compact, not the show's real ~10-offer pace) opening schedule
// so a full 26-case playthrough still reasonably fits.
export const CASE_VALUES = [
  0.01, 1, 5, 10, 25, 50, 75, 100, 200, 300, 400, 500, 750, 1000,
  5000, 10000, 25000, 50000, 75000, 100000, 200000, 300000, 400000, 500000, 750000, 1000000,
];

// 25 non-player cases opened across 7 rounds of offers (6+5+4+4+3+2+1 =
// 25), leaving exactly one other case (plus the player's own) for the
// final go/no-go — same shape as the original 16-case design, just
// scaled to the full 26.
export const ROUND_OPEN_COUNTS = [6, 5, 4, 4, 3, 2, 1];

const OFFER_FACTOR_BY_ROUND = [0.4, 0.5, 0.6, 0.68, 0.76, 0.84, 0.92];

export function seededShuffle(values, seed) {
  let s = seed || 1;
  const rand = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const arr = [...values];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function computeOffer(remainingValues, roundIndex) {
  const avg = remainingValues.reduce((a, b) => a + b, 0) / remainingValues.length;
  const factor = OFFER_FACTOR_BY_ROUND[Math.min(roundIndex, OFFER_FACTOR_BY_ROUND.length - 1)];
  return Math.round((avg * factor) / 5) * 5; // round to nearest $5, keeps it feeling like a real offer, not a raw average
}

export function formatMoney(n) {
  return "$" + n.toLocaleString(undefined, { minimumFractionDigits: n < 1 ? 2 : 0, maximumFractionDigits: 2 });
}

export const dondKey = (round, playerId) => `pb:dond:${round}:${playerId}`;

// Idempotent — if this player already has a state for this round (a
// remount, a reload, anything), returns it UNCHANGED rather than
// re-shuffling. This is the actual fix: the shuffle only ever happens
// once, the moment it's first written, and every subsequent read (no
// matter how the component got re-mounted) sees the same persisted
// board.
export async function initDondState(gameId, round, playerId, seed, db) {
  const update = db?.update || storageUpdate;
  const initial = {
    caseValues: seededShuffle(CASE_VALUES, seed || 1),
    myCase: null,
    openedIndices: [],
    roundIndex: 0,
    openedThisRound: 0,
    offer: null,
    dealtAt: null,
    done: false,
  };
  // update()'s own idempotent callback is what actually guarantees only
  // the FIRST call's shuffle ever sticks (e.g. two rapid remounts both
  // racing to initialize) — matching the "never re-shuffle" guarantee
  // this whole fix depends on.
  const res = await update(gameId, dondKey(round, playerId), (fresh) => (fresh ? fresh : initial));
  return res?.value || initial;
}

// Locks in the player's own case — permanently. Once set, this can
// NEVER be changed by any later call, which is the specific guarantee
// that closes the exploit: even with full knowledge of every other
// case's value, there's no way back to an unpicked state to apply that
// knowledge to your OWN case.
export async function pickCase(gameId, round, playerId, caseIndex, db) {
  const update = db?.update || storageUpdate;
  const res = await update(gameId, dondKey(round, playerId), (fresh) => {
    if (!fresh || fresh.myCase != null) return fresh; // already locked in — no-op, never overwrite
    return { ...fresh, myCase: caseIndex };
  });
  return res?.value || null;
}

// Opens one case and, if this completes the current round's quota (or
// leaves only one case besides the player's own), computes the next
// offer — same rules the original client-only version used, just
// applied as a single atomic server write instead of local setState
// calls, so a reload mid-decision can't lose or rewind progress either.
export async function openCase(gameId, round, playerId, caseIndex, db) {
  const update = db?.update || storageUpdate;
  const res = await update(gameId, dondKey(round, playerId), (fresh) => {
    if (!fresh || fresh.myCase == null || fresh.offer != null || fresh.done) return fresh;
    if (caseIndex === fresh.myCase || fresh.openedIndices.includes(caseIndex)) return fresh;

    const openedIndices = [...fresh.openedIndices, caseIndex];
    const openedThisRound = fresh.openedThisRound + 1;
    const stillClosed = fresh.caseValues.map((_, idx) => idx).filter((idx) => idx !== fresh.myCase && !openedIndices.includes(idx));

    if (stillClosed.length === 1) {
      const finalValues = [fresh.caseValues[fresh.myCase], fresh.caseValues[stillClosed[0]]];
      return {
        ...fresh, openedIndices, openedThisRound,
        offer: { amount: computeOffer(finalValues, ROUND_OPEN_COUNTS.length - 1), isFinal: true, otherCaseIndex: stillClosed[0] },
      };
    }

    if (openedThisRound >= ROUND_OPEN_COUNTS[Math.min(fresh.roundIndex, ROUND_OPEN_COUNTS.length - 1)]) {
      return {
        ...fresh, openedIndices, openedThisRound,
        offer: { amount: computeOffer(stillClosed.map((idx) => fresh.caseValues[idx]), fresh.roundIndex), isFinal: false },
      };
    }

    return { ...fresh, openedIndices, openedThisRound };
  });
  return res?.value || null;
}

export async function acceptDeal(gameId, round, playerId, db) {
  const update = db?.update || storageUpdate;
  const res = await update(gameId, dondKey(round, playerId), (fresh) => {
    if (!fresh || !fresh.offer || fresh.done) return fresh;
    const dealtAt = fresh.offer.isFinal
      ? { amount: fresh.caseValues[fresh.offer.otherCaseIndex], swapped: true }
      : { amount: fresh.offer.amount, swapped: null };
    return { ...fresh, dealtAt, done: true };
  });
  return res?.value || null;
}

export async function declineDeal(gameId, round, playerId, db) {
  const update = db?.update || storageUpdate;
  const res = await update(gameId, dondKey(round, playerId), (fresh) => {
    if (!fresh || !fresh.offer || fresh.done) return fresh;
    if (fresh.offer.isFinal) {
      return { ...fresh, dealtAt: { amount: fresh.caseValues[fresh.myCase], swapped: false }, done: true };
    }
    return { ...fresh, roundIndex: fresh.roundIndex + 1, openedThisRound: 0, offer: null };
  });
  return res?.value || null;
}

export function subscribeDondState(gameId, round, playerId, onChange) {
  return subscribeGameState(gameId, dondKey(round, playerId), onChange);
}
