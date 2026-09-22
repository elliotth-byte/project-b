import { storageSet, storageUpdate, subscribeGameState } from "../gameStorage";

// ─── Art Auction ───
// Everyone paints something, then every painting goes up in one
// simultaneous, anonymous, sealed-bid auction — nobody sees who
// painted what, and nobody sees anyone else's bids until everything
// closes at once. Whoever ends up owning the most pieces wins; ties go
// to whoever has the most money left over PLUS whatever their own
// piece sold for (see placementValue) — the two things a real auction
// house would actually call "doing well": buying a lot, and having
// something worth selling.
//
// Two phases, each with its own dynamically-scaled timeout (same
// reasoning lib/games/musicalChairsData.js's own timing has — this
// app's challenges range from a few live minutes to many async hours):
//   "painting" — draw on your own canvas, submit when ready. Once
//   everyone's submitted (or the painting timer runs out, whichever
//   comes first), every submitted piece is shuffled into a numbered
//   lot list and bidding opens.
//   "bidding" — place, raise, lower, or withdraw a private bid on any
//   lot that isn't your own. All bids for all lots resolve together
//   the instant bidding closes — nothing is settled early, and nobody
//   can see who's leading on anything beforehand.
//
// Same trust model as Chains/Masquerade/Pandora's Boxes already accept
// in this app (see sql/schema.sql: any player in a game can already
// read this entire row) — the anonymity of who painted which lot, and
// the privacy of each bidder's own numbers, are UI-convention secrets,
// not technically enforced ones. A player determined enough to open
// dev tools could see the underlying artistId behind a lot before the
// reveal; this app has never tried to defend against that for any of
// its other "secret until reveal" mechanics either.

export const artAuctionKey = (round) => `pb:artauction:${round}`;
const key = artAuctionKey;

export function subscribeArtAuction(gameId, round, onChange) {
  return subscribeGameState(gameId, key(round), onChange);
}

const MIN_PARTICIPANTS = 2;
export const STARTING_BUDGET = 500;

const MIN_PAINTING_MS = 60000; // a real minimum to actually draw something, even in a fast live battle
const MIN_BIDDING_MS = 60000; // enough to look over every lot and place more than one bid, even in a fast live battle
const PAINTING_SHARE = 0.5; // roughly half the configured duration for painting, the rest for bidding

// Both phase lengths derived from the same configured challenge
// duration — see MIN_PAINTING_MS/MIN_BIDDING_MS above for why the
// actual total can end up longer than configured on a very short
// battle (same accepted drift lib/games/musicalChairsData.js documents
// for its own timing): a battle too short to give both phases their
// real minimum just runs a little long rather than rushing either one
// unfairly.
export function computePhaseDurationsMs(challengeDurationSec) {
  const totalMs = (challengeDurationSec || 600) * 1000;
  const paintingMs = Math.max(MIN_PAINTING_MS, Math.round(totalMs * PAINTING_SHARE));
  const biddingMs = Math.max(MIN_BIDDING_MS, totalMs - paintingMs);
  return { paintingMs, biddingMs };
}

function seededRandom(seed) {
  let s = seed || 1;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

function shuffle(arr, seed) {
  const rand = seededRandom(seed);
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// db: optional override — see lib/games/plinkoBracketData.js's
// initPlinkoBracket for why.
export async function initArtAuction(gameId, round, participants, now, challengeDurationSec, db) {
  const set = db?.set || storageSet;
  if (participants.length < MIN_PARTICIPANTS) return; // degenerate case, handled client-side

  const participantIds = participants.map((p) => p.id);
  const { paintingMs, biddingMs } = computePhaseDurationsMs(challengeDurationSec);

  await set(gameId, key(round), {
    participantIds,
    budget: STARTING_BUDGET,
    phase: "painting", // "painting" | "bidding" | "revealed"
    paintingEndsAt: now + paintingMs,
    biddingDurationMs: biddingMs, // stashed, not yet applied — biddingEndsAt is only set once bidding actually opens
    biddingEndsAt: null,
    submissions: {}, // artistId -> { dataUrl, submittedAt }
    lotOrder: null, // set once bidding opens: shuffled artistIds — the "lot number" a player sees is just its index in this array
    bids: {}, // bidderId -> { artistId: amount } — never includes a bid on the bidder's own artistId
    bidTimestamps: {}, // bidderId -> { artistId: timestamp } — tie-break only, "earliest to commit this amount wins a tie"
    results: null, // artistId -> { winnerId, amount } — only for lots that got at least one bid
    placements: null, // playerId -> { piecesWon, leftoverCash, saleProceeds, tiebreakValue }
    timedOut: false,
  });
}

function buildLotOrder(fresh, seed) {
  return shuffle(Object.keys(fresh.submissions), seed);
}

function openBidding(fresh, now, seed) {
  return {
    ...fresh,
    phase: "bidding",
    lotOrder: buildLotOrder(fresh, seed),
    biddingEndsAt: now + fresh.biddingDurationMs,
  };
}

// Shared by both the natural "everyone bid" resolution path and the
// timeout fallback — pure function of its inputs, same reasoning
// lib/games/musicalChairsData.js's own resolveRound documents (only
// one call's write ever actually lands; it doesn't matter which
// client's browser happened to compute it).
function resolveAuction(fresh) {
  const lotOrder = fresh.lotOrder || buildLotOrder(fresh, fresh.paintingEndsAt);
  const results = {};

  lotOrder.forEach((artistId) => {
    let bestBidderId = null, bestAmount = -1, bestAt = Infinity;
    Object.entries(fresh.bids).forEach(([bidderId, bidderBids]) => {
      const amount = bidderBids[artistId];
      if (amount == null || amount <= 0) return;
      const at = fresh.bidTimestamps?.[bidderId]?.[artistId] ?? Infinity;
      if (amount > bestAmount || (amount === bestAmount && at < bestAt)) {
        bestBidderId = bidderId; bestAmount = amount; bestAt = at;
      }
    });
    if (bestBidderId) results[artistId] = { winnerId: bestBidderId, amount: bestAmount };
  });

  const summary = {};
  fresh.participantIds.forEach((id) => { summary[id] = { piecesWon: 0, spent: 0, saleProceeds: 0 }; });
  Object.entries(results).forEach(([artistId, r]) => {
    if (summary[r.winnerId]) { summary[r.winnerId].piecesWon += 1; summary[r.winnerId].spent += r.amount; }
    if (summary[artistId]) summary[artistId].saleProceeds += r.amount;
  });

  const placements = {};
  fresh.participantIds.forEach((id) => {
    const s = summary[id];
    const leftoverCash = fresh.budget - s.spent;
    placements[id] = { piecesWon: s.piecesWon, leftoverCash, saleProceeds: s.saleProceeds, tiebreakValue: leftoverCash + s.saleProceeds };
  });

  return { ...fresh, phase: "revealed", lotOrder, results, placements };
}

// storageUpdate resolves to dbAdapter.js's own actual return shape —
// { ok, value, aborted? } — never the raw next state directly.
async function updateState(gameId, k, updater) {
  const result = await storageUpdate(gameId, k, updater);
  return result?.value ?? null;
}

// One painting, submitted once and locked — no re-submission, same as
// a real silent auction closing entries once handed in. The LAST
// submission to arrive is the one that flips the whole battle into
// bidding, same "last one in triggers the transition" shape
// lib/games/chainsData.js's submitChain uses.
export async function submitPainting(gameId, round, playerId, dataUrl) {
  return updateState(gameId, key(round), (fresh) => {
    if (!fresh || fresh.phase !== "painting") return fresh;
    if (fresh.submissions[playerId]) return fresh;
    const nextSubmissions = { ...fresh.submissions, [playerId]: { dataUrl, submittedAt: Date.now() } };
    const allIn = fresh.participantIds.every((id) => !!nextSubmissions[id]);
    const withSubmission = { ...fresh, submissions: nextSubmissions };
    if (allIn) return openBidding(withSubmission, Date.now(), fresh.paintingEndsAt);
    return withSubmission;
  });
}

// Painting phase timed out with some (or nobody) still un-submitted —
// whoever DID submit still gets a lot in the auction; whoever didn't
// simply isn't representing anything, same as a real silent auction
// closing entries at the posted deadline regardless of who's still
// working on theirs.
export async function autoOpenBiddingIfDue(gameId, round) {
  return updateState(gameId, key(round), (fresh) => {
    if (!fresh || fresh.phase !== "painting") return fresh;
    if (Date.now() < fresh.paintingEndsAt) return fresh;
    return openBidding(fresh, Date.now(), fresh.paintingEndsAt);
  });
}

// One bid, on one lot, from one bidder — replaces any previous bid
// they had on that SAME lot (freely revisable up until bidding
// closes), never touching their bids on any other lot. amount === 0
// withdraws the bid entirely. Rejected outright (no-op) for bidding on
// your own piece, a negative amount, an unknown lot, or a total (this
// bid plus every OTHER currently-standing bid this same bidder has)
// that would exceed their starting budget — that last check is what
// guarantees a bidder can never end up owing more than they have, even
// if every single lot they've bid on ends up going to them
// simultaneously, without needing any separate "can they actually
// afford everything they won" check at settlement time.
export async function submitBid(gameId, round, bidderId, artistId, amount) {
  if (amount < 0) return null;
  return updateState(gameId, key(round), (fresh) => {
    if (!fresh || fresh.phase !== "bidding") return fresh;
    if (artistId === bidderId) return fresh;
    if (!fresh.submissions[artistId]) return fresh;

    const myBids = fresh.bids[bidderId] || {};
    const otherBidsTotal = Object.entries(myBids)
      .filter(([lot]) => lot !== artistId)
      .reduce((sum, [, v]) => sum + v, 0);
    if (otherBidsTotal + amount > fresh.budget) return fresh;

    const nextMyBids = { ...myBids };
    const nextMyTimestamps = { ...(fresh.bidTimestamps[bidderId] || {}) };
    if (amount === 0) {
      delete nextMyBids[artistId];
      delete nextMyTimestamps[artistId];
    } else {
      nextMyBids[artistId] = amount;
      nextMyTimestamps[artistId] = Date.now();
    }

    return {
      ...fresh,
      bids: { ...fresh.bids, [bidderId]: nextMyBids },
      bidTimestamps: { ...fresh.bidTimestamps, [bidderId]: nextMyTimestamps },
    };
  });
}

// Bidding phase timed out — everything settles at once, using
// whatever bids are actually on record. Same "someone has to come out
// of this, even on partial information" fallback shape Chains,
// Masquerade, and Torched all accept for their own stalls.
export async function autoResolveAuctionIfDue(gameId, round) {
  return updateState(gameId, key(round), (fresh) => {
    if (!fresh || fresh.phase !== "bidding") return fresh;
    if (Date.now() < fresh.biddingEndsAt) return fresh;
    return resolveAuction(fresh);
  });
}

// Challenge-level safety net (see lib/roundEngine.js's
// autoFinalizeArtAuctionOnTimeout) — same shape as
// lib/games/musicalChairsData.js's own finalizeOnTimeout: the
// season's configured challenge duration ran out before the auction
// naturally closed on its own (an unlucky combination of a short
// battle and MIN_PAINTING_MS/MIN_BIDDING_MS's own floors — see
// computePhaseDurationsMs). Settles with whatever's on record,
// building a lot list first if bidding never even formally opened.
export function finalizeArtAuctionOnTimeout(fresh) {
  if (!fresh || fresh.phase === "revealed") return fresh;
  const withLots = fresh.phase === "painting" ? openBidding(fresh, Date.now(), fresh.paintingEndsAt) : fresh;
  return { ...resolveAuction(withLots), timedOut: true };
}

// The value reported via reportScore: piece count dominates
// everything (multiplied well above any possible money tiebreak could
// reach — the entire game's money supply is bounded by
// participantCount * STARTING_BUDGET, nowhere near this multiplier),
// with the leftover-cash-plus-sale-proceeds tiebreak folded in below
// it. Matches the exact rule as given: "most pieces wins; a tie goes
// to whoever has more between leftover money and profit turned on
// their own art."
const PIECE_MULTIPLIER = 1e7;
export function placementValue(state, playerId) {
  if (state.phase !== "revealed") return 0;
  const p = state.placements?.[playerId];
  if (!p) return 0;
  return p.piecesWon * PIECE_MULTIPLIER + p.tiebreakValue;
}
