import { storageSet, storageUpdate, subscribeGameState } from "../gameStorage";

// ─── The Agora ───
// A Greek-mythology reskin of the classic card game Pit — commodities
// become godly item sets. Every player gets a hand of 9 cards, drawn
// from N themes (N ≈ player count) at 9 cards per theme, all dealt out
// with nothing left in a draw pile — same as the real game. The goal is
// "corner the market": hold all 9 of one theme in your hand at once.
//
// Trading stays true to the original's blind-exchange tension in one
// sense (you never see WHICH cards you're about to receive), but not
// in another: matching used to happen automatically the instant two
// offers shared the same count, with no say in who you traded with.
// Now it's always an explicit choice — offer 1-4 cards of a SINGLE
// theme from your hand into a shared pool for someone else to pick up,
// or browse the pool yourself (seeing who's offering how many, never
// what) and choose a specific offer to accept with cards of your own. This is "single round" as requested:
// no re-dealing after a corner, no multi-round scoring — the round just
// keeps running (so players who don't corner the market still get
// ranked by progress) until 3 players have finished or time runs out.
//
// Scoring integrates with the standard pipeline the same way the Plinko
// bracket does — see placementValue below for exactly how.

export const THEMES = [
  { id: "zeus", label: "Zeus's Thunderbolts", icon: "⚡" },
  { id: "poseidon", label: "Poseidon's Tridents", icon: "🔱" },
  { id: "hades", label: "Hades's Helms", icon: "🪖" },
  { id: "athena", label: "Athena's Owls", icon: "🦉" },
  { id: "apollo", label: "Apollo's Lyres", icon: "🎼" },
  { id: "artemis", label: "Artemis's Bows", icon: "🏹" },
  { id: "ares", label: "Ares's Swords", icon: "🗡️" },
  { id: "aphrodite", label: "Aphrodite's Doves", icon: "🕊️" },
  { id: "hermes", label: "Hermes's Wings", icon: "🪽" },
];
const CARDS_PER_THEME = 9;
const SET_SIZE = 9; // how many of one theme you need in hand to corner the market
const MAX_WINNERS = 3;

export function themeById(id) {
  return THEMES.find((t) => t.id === id);
}

function seededRandom(seed) {
  let s = seed || 1;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

const pitKey = (round) => `pb:pit:${round}`;

export function subscribePit(gameId, round, onChange) {
  return subscribeGameState(gameId, pitKey(round), onChange);
}

// participants: [{ id, name }]. Called once from ChallengeHost.jsx's
// startChallenge, same as the Plinko bracket.
// db: optional override — see initPlinkoBracket's own comment above for
// why (lib/games/plinkoBracketData.js).
export async function initPit(gameId, round, participants, seed, db) {
  const set = db?.set || storageSet;
  const rand = seededRandom(seed || 1);
  const playerCount = participants.length;
  if (playerCount < 2) return; // degenerate case handled client-side, same pattern as Plinko

  const numThemes = Math.max(3, Math.min(THEMES.length, playerCount));
  const themeIds = THEMES.slice(0, numThemes).map((t) => t.id);

  const deck = [];
  themeIds.forEach((id) => { for (let i = 0; i < CARDS_PER_THEME; i++) deck.push(id); });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  // Round-robin deal — if the deck doesn't divide perfectly evenly by
  // player count (it won't always, since numThemes is clamped rather
  // than always exactly matching playerCount), some hands end up one
  // card bigger than others. That's fine; it doesn't affect the corner-
  // the-market goal either way.
  const hands = {};
  participants.forEach((p) => (hands[p.id] = []));
  deck.forEach((card, i) => {
    const p = participants[i % participants.length];
    hands[p.id].push(card);
  });

  await set(gameId, pitKey(round), {
    themeIds,
    hands,
    pool: [], // [{ offerId, playerId, cards: [themeId,...] }]
    finishOrder: [], // up to MAX_WINNERS playerIds, in achievement order
    fullSetLog: [], // playerIds who completed a set at all, in order (finishOrder is a prefix of this)
    tradeLog: [], // [{ at, aName, bName, count }] — recent trades, for a light activity feed
    finalized: false,
  });
}

function countByTheme(hand) {
  const counts = {};
  hand.forEach((c) => (counts[c] = (counts[c] || 0) + 1));
  return counts;
}

export function maxThemeCount(hand) {
  const counts = countByTheme(hand);
  return Math.max(0, ...Object.values(counts));
}

export function hasCompleteSet(hand) {
  return maxThemeCount(hand) >= SET_SIZE;
}

// The value reported via reportScore for this challenge — see the
// top-of-file comment and lib/games/plinkoBracketData.js's matching
// comment for why a single number here is enough for the standard
// scoring pipeline to reproduce the right ranking with no special-casing
// elsewhere: top-3 finishers occupy a 10000+ tier (ordered by finish
// order), anyone who completed a set late occupies a flat 5000 tier
// (tie-broken by report time, same as everywhere else), and everyone
// else is ranked by raw progress (0-9).
export function placementValue(pit, playerId) {
  const idx = pit.finishOrder.indexOf(playerId);
  if (idx !== -1) return 10000 - idx;
  if (pit.fullSetLog.includes(playerId)) return 5000;
  return maxThemeCount(pit.hands[playerId] || []);
}

// Submits a new offer of `cards` (1-4 cards, all the same theme, drawn
// from the player's own hand) into the shared pool — removed from their
// hand immediately, since an offer in flight isn't available to trade
// again or count toward a corner until it resolves one way or another.
//
// Purely posts to the pool now — no longer auto-matches against the
// oldest same-count offer the instant one exists. Matching is now
// always an explicit choice a player makes (see acceptOffer below):
// browse who's offering what count in the pool and pick one to trade
// with, or post your own and wait for someone else to pick yours.
export async function submitOffer(gameId, round, playerId, cards) {
  return storageUpdate(gameId, pitKey(round), (fresh) => {
    if (!fresh || fresh.finalized) return fresh;
    if (fresh.pool.some((o) => o.playerId === playerId)) return fresh; // one offer at a time
    if (fresh.finishOrder.includes(playerId)) return fresh; // done trading once you've cornered a market

    const hand = [...(fresh.hands[playerId] || [])];
    for (const c of cards) {
      const i = hand.indexOf(c);
      if (i === -1) return fresh; // trying to offer a card they don't actually have — no-op, reject silently
      hand.splice(i, 1);
    }

    const offerId = `${playerId}-${Date.now()}`;
    return {
      ...fresh,
      hands: { ...fresh.hands, [playerId]: hand },
      pool: [...fresh.pool, { offerId, playerId, cards }],
    };
  });
}

// The other half of trading: pick a SPECIFIC open offer out of the pool
// (see the pool's own "who's offering what count" listing in
// PitPlayer.jsx) and match it with `cards` of your own — same count as
// the target offer, same "all one theme" rule as submitOffer, drawn
// straight from your current hand rather than requiring you to have
// posted an offer of your own first. Still blind in the one sense the
// original game's whole tension depends on: you can see WHO posted an
// offer and HOW MANY cards, never WHICH theme, so accepting one is a
// real gamble on what you're about to receive — just no longer a
// gamble on WHO you end up trading with too.
export async function acceptOffer(gameId, round, playerId, targetOfferId, cards) {
  return storageUpdate(gameId, pitKey(round), (fresh) => {
    if (!fresh || fresh.finalized) return fresh;
    if (fresh.finishOrder.includes(playerId)) return fresh;

    const target = fresh.pool.find((o) => o.offerId === targetOfferId);
    if (!target || target.playerId === playerId) return fresh; // gone already, or trying to trade with yourself
    if (target.cards.length !== cards.length) return fresh; // must match the count exactly, same rule submitOffer's own matching used to enforce

    const hand = [...(fresh.hands[playerId] || [])];
    for (const c of cards) {
      const i = hand.indexOf(c);
      if (i === -1) return fresh; // offering a card they don't actually have
      hand.splice(i, 1);
    }

    const nextHands = {
      ...fresh.hands,
      [playerId]: [...hand, ...target.cards],
      [target.playerId]: [...fresh.hands[target.playerId], ...cards],
    };
    const nextPool = fresh.pool.filter((o) => o.offerId !== targetOfferId);

    let finishOrder = fresh.finishOrder;
    let fullSetLog = fresh.fullSetLog;
    [playerId, target.playerId].forEach((pid) => {
      if (hasCompleteSet(nextHands[pid]) && !fullSetLog.includes(pid)) {
        fullSetLog = [...fullSetLog, pid];
        if (finishOrder.length < MAX_WINNERS) finishOrder = [...finishOrder, pid];
      }
    });

    return {
      ...fresh,
      hands: nextHands,
      pool: nextPool,
      finishOrder,
      fullSetLog,
      tradeLog: [...fresh.tradeLog, { at: Date.now(), aId: playerId, bId: target.playerId, count: cards.length }].slice(-30),
    };
  });
}

// Pulls back a not-yet-matched offer — the offered cards return to hand.
export async function withdrawOffer(gameId, round, playerId) {
  return storageUpdate(gameId, pitKey(round), (fresh) => {
    if (!fresh) return fresh;
    const offer = fresh.pool.find((o) => o.playerId === playerId);
    if (!offer) return fresh;
    return {
      ...fresh,
      pool: fresh.pool.filter((o) => o.offerId !== offer.offerId),
      hands: { ...fresh.hands, [playerId]: [...fresh.hands[playerId], ...offer.cards] },
    };
  });
}
