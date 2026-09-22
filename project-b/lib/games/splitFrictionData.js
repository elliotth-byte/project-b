import { storageSet, storageUpdate, subscribeGameState } from "../gameStorage";

// ─── Split Friction ───
// A pure ultimatum-style negotiation, played by every alive participant
// against every other one, all at once — no TV, phone-only, two phases:
//
//   "offering" — every player independently proposes a split of 100
//   points to EVERY OTHER alive player (N-1 offers each, N*(N-1) total
//   directed offers in the whole battle). Each offer is just one number
//   — how much the SENDER keeps for themselves; the recipient's share is
//   always 100 minus that. A player can set a completely different split
//   for each other player. Offers are submitted one recipient at a time
//   (submitOffer) — robust against a dropped connection mid-submission,
//   same reasoning Pandora's Boxes' round-2 draft has for letting a
//   player build up a multi-target submission incrementally — then
//   explicitly locked in all together (lockOffers), mirroring Pandora's
//   Boxes' own "assign each box, then Lock In" shape. Once every player
//   has locked in every one of their offers, the phase ends and moves on
//   to deciding; a player who's short an offer or two when the phase's
//   own timer runs out gets those specific missing offers defaulted to a
//   neutral 50/50 split (never something punitive-looking like 0/100 —
//   see completeOffersWithDefaults) so a dropped connection never reads
//   as a deliberate insult.
//
//   "deciding" — every player reviews every offer sent TO them (one from
//   each other alive player) and accepts or rejects each one
//   INDIVIDUALLY — not a blanket accept/reject-all. Same
//   submit-each-then-lock-all-in shape as offering (submitDecision, then
//   lockDecisions). An offer still undecided when this phase's own timer
//   runs out defaults to REJECT — the safe, costs-nothing default this
//   app uses everywhere a non-responder needs a fallback (see e.g.
//   goldenFleeceData.js's own "not deciding costs you the least, not the
//   most" convention).
//
// Resolution: for every accepted offer, BOTH sides of that specific
// offer get paid (the sender gets what they kept, the recipient gets
// what they were offered) — a rejected offer pays nobody. A player's
// final score is the sum of what they actually collected, in either
// direction, across every offer that involved them. The reverse offer
// between the same two players is a completely independent decision —
// accepting A's offer to B has zero effect on what happens with B's own
// offer to A.
//
// Same trust model as every other "everyone can already read this whole
// row" negotiation game in this app (Pandora's Boxes, Art Auction,
// Chains, Masquerade) — the blind-until-reveal property is a UI
// convention, not a technically enforced secret (see sql/schema.sql).
// The real design goal it protects is simultaneity, not secrecy from a
// determined dev-tools user: nobody's own client ever shows them another
// player's still-pending offers or decisions before the reveal, so a
// normal player genuinely can't peek and adjust their own strategy
// mid-battle.
//
// db: optional override on init/tick — see lib/games/
// plinkoBracketData.js's initPlinkoBracket for why (server-side
// auto-start/housekeeping passes its own db wrapper; a client call uses
// the default storage functions).

export const splitFrictionKey = (round) => `pb:splitfriction:${round}`;
const key = splitFrictionKey;

export function subscribeSplitFriction(gameId, round, onChange) {
  return subscribeGameState(gameId, key(round), onChange);
}

// storageUpdate resolves to dbAdapter.js's own actual return shape —
// { ok, value, aborted? } — never the raw next state directly. See
// pandorasBoxesData.js's own identical helper for the full reasoning.
async function updateState(gameId, k, updater) {
  const result = await storageUpdate(gameId, k, updater);
  return result?.value ?? null;
}

const NEUTRAL_DEFAULT_SELF_AMOUNT = 50; // a genuine timeout default, never a punitive-looking 0/100 or 100/0

// Below 2 alive participants, there's nobody to make an offer to at
// all — this mechanic has a real, structural floor, not just a
// nicety. Rather than refusing to init (which would leave the lone
// player's client stuck on a permanent "Loading..." — see e.g.
// pandorasBoxesData.js's own MIN_PARTICIPANTS handling, which the
// client renders as an explicit "Not Enough Players" card instead), a
// single alive participant just gets the battle resolved on the spot,
// trivially, with nothing to negotiate and nothing to score.
const MIN_PARTICIPANTS = 2;

// Both phase lengths scale with how many offers/decisions an alive
// roster of this size actually has to get through — N-1 for every
// player, same "more players = more thinking to do, so more time
// needed" reasoning lib/games/divinersDiceData.js's own registry
// comment gives for its own no-cap timing, just applied per-phase here
// instead of to one flat outer timer. Each floor is a REAL minimum (even
// a 2-player battle needs enough time to weigh a single offer
// seriously, same "real minimum" reasoning artAuctionData.js's own
// MIN_PAINTING_MS/MIN_BIDDING_MS give); the configured challenge
// duration is then split between the two phases, offering getting
// slightly more share since composing N-1 numbers takes more active
// effort than reading and deciding on them.
const MIN_OFFERING_MS = 60000; // real floor: enough to weigh even a single offer seriously
const MIN_DECIDING_MS = 45000; // real floor: enough to read and decide on even a single offer
const PER_OFFER_MS = 20000; // extra floor-time per additional offer a player has to compose
const PER_DECISION_MS = 12000; // extra floor-time per additional offer a player has to review and decide on
const OFFERING_EXTRA_SHARE = 0.55; // once both floors are covered, offering gets the bigger slice of whatever's left

export function computePhaseDurationsMs(challengeDurationSec, participantCount) {
  const n = Math.max(participantCount || 0, MIN_PARTICIPANTS);
  const offersPerPlayer = n - 1;
  const offeringFloor = Math.max(MIN_OFFERING_MS, offersPerPlayer * PER_OFFER_MS);
  const decidingFloor = Math.max(MIN_DECIDING_MS, offersPerPlayer * PER_DECISION_MS);
  const totalMs = (challengeDurationSec || 540) * 1000;
  const flooredTotal = offeringFloor + decidingFloor;
  if (totalMs <= flooredTotal) return { offeringMs: offeringFloor, decidingMs: decidingFloor };
  const extra = totalMs - flooredTotal;
  const offeringMs = offeringFloor + Math.round(extra * OFFERING_EXTRA_SHARE);
  const decidingMs = totalMs - offeringMs;
  return { offeringMs, decidingMs };
}

function emptyResults(participantIds) {
  const results = {};
  participantIds.forEach((id) => { results[id] = { total: 0, sent: [], received: [] }; });
  return results;
}

export async function initSplitFriction(gameId, round, participants, now, challengeDurationSec, db) {
  const set = db?.set || storageSet;
  const participantIds = participants.map((p) => p.id);

  if (participantIds.length < MIN_PARTICIPANTS) {
    // Degenerate 1-alive-participant case (or, theoretically, 0) —
    // there's nobody to negotiate with, so the battle just ends on the
    // spot with a trivial, honest result instead of erroring or hanging.
    await set(gameId, key(round), {
      participantIds,
      phase: "revealed",
      offeringEndsAt: now,
      decidingDurationMs: 0,
      decidingEndsAt: now,
      offers: {},
      offersLockedAt: {},
      decisions: {},
      decisionsLockedAt: {},
      results: emptyResults(participantIds),
      timedOut: false,
      degenerate: true,
    });
    return;
  }

  const { offeringMs, decidingMs } = computePhaseDurationsMs(challengeDurationSec, participantIds.length);
  await set(gameId, key(round), {
    participantIds,
    phase: "offering", // "offering" | "deciding" | "revealed"
    offeringEndsAt: now + offeringMs,
    decidingDurationMs: decidingMs, // stashed, not yet applied — decidingEndsAt is only set once deciding actually opens
    decidingEndsAt: null,
    offers: {}, // senderId -> { recipientId: selfAmount }, filled in incrementally
    offersLockedAt: {}, // senderId -> timestamp, set once that sender explicitly locks in ALL of their offers
    decisions: {}, // deciderId -> { senderId: "accept" | "reject" }, filled in incrementally
    decisionsLockedAt: {}, // deciderId -> timestamp, set once that decider explicitly locks in ALL of their decisions
    results: null, // playerId -> { total, sent: [{to, kept, offered, accepted}], received: [{from, kept, offered, accepted}] }
    timedOut: false,
    degenerate: false,
  });
}

// Fills in any offer a locked-or-not sender never got around to setting
// for some recipient, with a neutral, non-punitive 50/50 split — called
// exactly once, at the moment offering ends (whether that's because
// everyone locked in or because the phase timed out), so every offer
// exists before deciding ever opens.
function completeOffersWithDefaults(offers, participantIds) {
  const next = {};
  participantIds.forEach((senderId) => {
    next[senderId] = { ...(offers[senderId] || {}) };
    participantIds.forEach((recipientId) => {
      if (recipientId === senderId) return;
      if (!Number.isInteger(next[senderId][recipientId])) next[senderId][recipientId] = NEUTRAL_DEFAULT_SELF_AMOUNT;
    });
  });
  return next;
}

// Fills in any decision a decider never got around to making for some
// sender's offer, with the safe "reject" default — see this file's
// header for why reject (not accept) is the correct non-responder
// fallback here.
function completeDecisionsWithDefaults(decisions, participantIds) {
  const next = {};
  participantIds.forEach((deciderId) => {
    next[deciderId] = { ...(decisions[deciderId] || {}) };
    participantIds.forEach((senderId) => {
      if (senderId === deciderId) return;
      if (next[deciderId][senderId] !== "accept" && next[deciderId][senderId] !== "reject") next[deciderId][senderId] = "reject";
    });
  });
  return next;
}

function transitionToDeciding(fresh, now) {
  return {
    ...fresh,
    offers: completeOffersWithDefaults(fresh.offers, fresh.participantIds),
    phase: "deciding",
    decidingEndsAt: now + fresh.decidingDurationMs,
  };
}

// Pure function of the current state — safe to run inside a
// storageUpdate callback, shared by both the natural "everyone decided"
// path and the timeout fallback (same shape as artAuctionData.js's own
// resolveAuction).
function resolveBattle(fresh, now) {
  const decisions = completeDecisionsWithDefaults(fresh.decisions, fresh.participantIds);
  const results = emptyResults(fresh.participantIds);

  fresh.participantIds.forEach((senderId) => {
    fresh.participantIds.forEach((recipientId) => {
      if (senderId === recipientId) return;
      const kept = fresh.offers[senderId]?.[recipientId] ?? NEUTRAL_DEFAULT_SELF_AMOUNT;
      const offered = 100 - kept;
      const accepted = decisions[recipientId]?.[senderId] === "accept";
      if (accepted) {
        results[senderId].total += kept;
        results[recipientId].total += offered;
      }
      results[senderId].sent.push({ to: recipientId, kept, offered, accepted });
      results[recipientId].received.push({ from: senderId, kept, offered, accepted });
    });
  });

  return { ...fresh, decisions, phase: "revealed", results, resolvedAt: now };
}

// One offer, to one recipient — freely revisable up until this sender
// locks in ALL of their offers (see lockOffers). Rejected outright
// (silent no-op, same convention as every other blind-choice game here)
// if the phase has already moved on, this sender's already locked in,
// the target isn't a valid other alive participant, or selfAmount isn't
// a clean integer 0-100 — the receiver's share is never stored
// separately, it's always derived as 100 - selfAmount, so the two can
// never drift apart or fail to sum to exactly 100.
export async function submitOffer(gameId, round, playerId, recipientId, selfAmount) {
  return updateState(gameId, key(round), (fresh) => {
    if (!fresh || fresh.phase !== "offering") return fresh;
    if (fresh.offersLockedAt[playerId]) return fresh;
    if (recipientId === playerId) return fresh;
    if (!fresh.participantIds.includes(recipientId)) return fresh;
    if (!Number.isInteger(selfAmount) || selfAmount < 0 || selfAmount > 100) return fresh;

    const nextOffers = { ...fresh.offers, [playerId]: { ...(fresh.offers[playerId] || {}), [recipientId]: selfAmount } };
    return { ...fresh, offers: nextOffers };
  });
}

// This sender's explicit "I'm done, send them all" — requires every
// other alive participant to already have a valid offer set for them
// (rejected outright, no-op, if any are still missing: the UI should
// never actually let a player reach this call in that state, but this
// is the same defensive re-check every other lock-in function here
// does). Whichever submission turns out to be the LAST sender needed
// transitions the whole battle into deciding in that same write — same
// "last one in triggers the transition" shape chainsData.js's own
// submitChain and pandorasBoxesData.js's own submitRound1Gift use.
export async function lockOffers(gameId, round, playerId) {
  return updateState(gameId, key(round), (fresh) => {
    if (!fresh || fresh.phase !== "offering") return fresh;
    if (fresh.offersLockedAt[playerId]) return fresh;

    const others = fresh.participantIds.filter((id) => id !== playerId);
    const mine = fresh.offers[playerId] || {};
    const complete = others.every((id) => Number.isInteger(mine[id]) && mine[id] >= 0 && mine[id] <= 100);
    if (!complete) return fresh;

    const nextLockedAt = { ...fresh.offersLockedAt, [playerId]: Date.now() };
    const withLock = { ...fresh, offersLockedAt: nextLockedAt };
    const everyoneIn = fresh.participantIds.every((id) => !!nextLockedAt[id]);
    return everyoneIn ? transitionToDeciding(withLock, Date.now()) : withLock;
  });
}

// One decision, on one received offer — freely revisable up until this
// decider locks in ALL of their decisions (see lockDecisions). Same
// no-op guards as submitOffer above.
export async function submitDecision(gameId, round, playerId, senderId, decision) {
  if (decision !== "accept" && decision !== "reject") return null;
  return updateState(gameId, key(round), (fresh) => {
    if (!fresh || fresh.phase !== "deciding") return fresh;
    if (fresh.decisionsLockedAt[playerId]) return fresh;
    if (senderId === playerId) return fresh;
    if (!fresh.participantIds.includes(senderId)) return fresh;

    const nextDecisions = { ...fresh.decisions, [playerId]: { ...(fresh.decisions[playerId] || {}), [senderId]: decision } };
    return { ...fresh, decisions: nextDecisions };
  });
}

// This decider's explicit "I'm done, resolve them all" — requires a
// decision on every offer actually addressed to them (every other alive
// participant sent exactly one, since offering always completes with
// defaults before deciding opens — see transitionToDeciding). Whichever
// lock-in turns out to be the last one needed resolves the whole battle
// in that same write.
export async function lockDecisions(gameId, round, playerId) {
  return updateState(gameId, key(round), (fresh) => {
    if (!fresh || fresh.phase !== "deciding") return fresh;
    if (fresh.decisionsLockedAt[playerId]) return fresh;

    const others = fresh.participantIds.filter((id) => id !== playerId);
    const mine = fresh.decisions[playerId] || {};
    const complete = others.every((id) => mine[id] === "accept" || mine[id] === "reject");
    if (!complete) return fresh;

    const nextLockedAt = { ...fresh.decisionsLockedAt, [playerId]: Date.now() };
    const withLock = { ...fresh, decisionsLockedAt: nextLockedAt };
    const everyoneIn = fresh.participantIds.every((id) => !!nextLockedAt[id]);
    return everyoneIn ? resolveBattle(withLock, Date.now()) : withLock;
  });
}

// The authoritative tick — called on its own short interval by every
// active player's own phone, AND from lib/roundEngine.js's
// housekeeping pass (this game has no TV, so unlike Golden Fleece's
// three-way redundancy, this is just those two: phone-poll + server
// housekeeping). No-ops unless the current phase has genuinely either
// been fully completed or timed out — safe to call as often as anyone
// likes.
export async function tickSplitFriction(gameId, round, settings, db) {
  const update = db?.update || storageUpdate;
  return update(gameId, key(round), (fresh) => {
    if (!fresh || fresh.phase === "revealed") return fresh;
    const now = Date.now();

    if (fresh.phase === "offering") {
      const everyoneIn = fresh.participantIds.every((id) => !!fresh.offersLockedAt[id]);
      const timedOut = now >= fresh.offeringEndsAt;
      if (!everyoneIn && !timedOut) return fresh;
      return transitionToDeciding(fresh, now);
    }

    if (fresh.phase === "deciding") {
      const everyoneIn = fresh.participantIds.every((id) => !!fresh.decisionsLockedAt[id]);
      const timedOut = now >= fresh.decidingEndsAt;
      if (!everyoneIn && !timedOut) return fresh;
      return resolveBattle(fresh, now);
    }

    return fresh;
  });
}

// Challenge-level safety net (see lib/roundEngine.js's
// autoFinalizeSplitFrictionOnTimeout) — same shape and same reason as
// artAuctionData.js's own finalizeArtAuctionOnTimeout: the season's
// configured challenge duration ran out before the battle naturally
// resolved on its own (an unlucky combination of a short battle and
// MIN_OFFERING_MS/MIN_DECIDING_MS's own floors — see
// computePhaseDurationsMs). Settles with whatever's on record, moving
// straight from offering to a full resolution if deciding never even
// formally opened.
export function finalizeSplitFrictionOnTimeout(fresh) {
  if (!fresh || fresh.phase === "revealed") return fresh;
  const now = Date.now();
  const withDeciding = fresh.phase === "offering" ? transitionToDeciding(fresh, now) : fresh;
  return { ...resolveBattle(withDeciding, now), timedOut: true };
}

// The value reported via reportScore — just each player's actual total
// collected across every accepted offer, in either direction. Only
// meaningful once revealed (0 beforehand): unlike Pandora's Boxes or
// Chains, nothing about a player's own in-progress offers or decisions
// is a fair interim ranking signal here, since every single one of
// those is blind by design until the whole battle resolves together —
// there's no partial, honest "how well are they doing so far" to report
// early. That's fine: this game keeps a REAL challenge.endsAt (see
// ChallengeHost.jsx and computePhaseDurationsMs above), the same as Art
// Auction/Floor/Musical Chairs, so it gets the same two-part safety net
// (the per-phase clock above, plus finalizeSplitFrictionOnTimeout as the
// outer bound) rather than needing an interim value for
// autoLockResolvedScores to fall back on.
export function placementValue(state, playerId) {
  if (state.phase !== "revealed") return 0;
  return state.results?.[playerId]?.total || 0;
}
