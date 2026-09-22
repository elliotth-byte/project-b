import { storageSet, storageUpdate, subscribeGameState } from "../gameStorage";
import { buildCrownSet } from "./crownArt";

// ─── Crowns ───
// A Greek-mythology reskin of the classic reality-show negotiation twist
// usually played with a set of distinct masks — every alive participant
// starts holding exactly ONE unique crown, drawn from a full set the
// size of the alive roster, and spends the whole battle openly
// negotiating direct, named, one-for-one trades with each other.
//
// ─── "Ever held," not "currently holds" ───
// The win condition is a CHECKLIST, not a snapshot: what matters is
// which crowns a player has EVER held at any point during the battle
// (`everHeld`, tracked per player — see emptyEverHeld/recordEverHeld
// below), not which ones they happen to be physically holding right
// this instant (`holdings`, which still exists and still matters for
// what a player CAN currently offer up in a trade, but no longer
// decides anything about winning). `everHeld` only ever grows — once a
// crown is checked off for a player, trading it away again can never
// un-check it. First to check off every crown in play wins outright, on
// the spot; if the battle's own timer runs out first, whoever's
// checklist has the most crowns checked off wins instead. See
// lib/games/pitData.js's own header for the shared-state
// conventions this borrows (CAS storageUpdate, a tradeLog activity
// feed, seededRandom, placementValue integration) — the trade mechanic
// itself is deliberately different: this is 1-for-1 direct swaps of
// UNIQUE single items between exactly two consenting, fully-visible
// players, not Pit's blind pool offers of duplicate cards.
//
// ─── A deliberate deviation from a literal "1-for-1 swap always"
// reading — kept even though the "ever held" win condition no longer
// strictly NEEDS it ───
// A pure swap — one specific crown leaves each side, one different
// specific crown arrives on each side — never changes how many crowns
// either party is CURRENTLY holding, but it can absolutely still change
// each side's `everHeld` checklist (any swap can hand either side a
// crown that's new to them — that's the whole game now). So, unlike the
// very first version of this file (back when the win condition was
// "currently holds every crown," which pure swaps genuinely could never
// reach on their own — see this app's own delivery notes for that
// history), the `everHeld` checklist win condition is already reachable
// through ordinary swaps alone. `requestedCrownId` may still be
// null/omitted, making a proposal a one-way GIFT (give one named crown
// to a target player, ask for nothing back) instead of a swap, and
// that's kept regardless: it's a legitimate negotiation tactic on its
// own merits (a player nearing elimination, or an alliance rallying
// behind one favorite, handing a crown over outright), not load-bearing
// for reachability anymore.
//
// db: optional override on init/tick — see lib/games/
// plinkoBracketData.js's initPlinkoBracket for why (server-side
// auto-start/housekeeping passes its own db wrapper; a client call uses
// the default storage functions).

export const crownsKey = (round) => `pb:crowns:${round}`;
const key = crownsKey;

export function subscribeCrowns(gameId, round, onChange) {
  return subscribeGameState(gameId, key(round), onChange);
}

// Below 2 alive participants there's nobody to trade with — same
// "resolve trivially on the spot instead of hanging" convention as
// splitFrictionData.js's/pandorasBoxesData.js's own MIN_PARTICIPANTS
// handling. A lone survivor (or, in theory, none) trivially "holds all
// the crowns" since there's only the one to hold at all.
const MIN_PARTICIPANTS = 2;

// ─── Crown naming/visuals ───
// Real black-figure-pottery-style SVG art per god, one curated design
// per major deity, cycling back through the list (with a distinguishing
// accent tint per lap) past its length — see lib/games/crownArt.js for
// the full design set and reasoning. buildCrownDefs is kept as a thin
// local alias so nothing else in this file has to change name.
const buildCrownDefs = buildCrownSet;

function seededRandom(seed) {
  let s = seed || 1;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

// everHeld: playerId -> [crownId, ...], the set (as an array, since
// storage here is plain JSON) of every crown this player has EVER held
// at any point in the battle — see this file's header. Starts as
// exactly whatever they were dealt.
function emptyEverHeld(holdings) {
  const out = {};
  Object.keys(holdings).forEach((pid) => { out[pid] = [...(holdings[pid] || [])]; });
  return out;
}

// everHeldTimestamps: playerId -> { [checklistSize]: elapsedMsSinceStartedAt }
// — the elapsed time at which this player's everHeld set MOST RECENTLY
// grew to that specific size. Since everHeld only ever grows (unlike
// the old current-holdings count, which could climb and drop), a given
// size is reached at most once per player, so this doubles as "when did
// I first reach my current/final checklist size" for the timeout
// tiebreak with no ambiguity — a strictly simpler invariant than the
// old holdings-count version had to account for.
function emptyEverHeldTimestamps(everHeld) {
  const out = {};
  Object.keys(everHeld).forEach((pid) => { out[pid] = { [everHeld[pid].length]: 0 }; });
  return out;
}

// participants: [{ id, name }]. Called once from ChallengeHost.jsx's
// startChallenge / lib/roundEngine.js's autoStartRandomChallenge, same
// as every other shared-state game here.
export async function initCrowns(gameId, round, participants, seed, db) {
  const set = db?.set || storageSet;
  const participantIds = participants.map((p) => p.id);
  const now = Date.now();

  if (participantIds.length < MIN_PARTICIPANTS) {
    const defs = buildCrownDefs(Math.max(participantIds.length, 1));
    const holdings = {};
    participantIds.forEach((id) => { holdings[id] = defs.map((d) => d.id); });
    const everHeld = emptyEverHeld(holdings);
    await set(gameId, key(round), {
      participantIds, crownDefs: defs, totalCrowns: defs.length, holdings,
      everHeld, everHeldTimestamps: emptyEverHeldTimestamps(everHeld),
      proposals: [], tradeLog: [],
      startedAt: now, winnerId: participantIds[0] || null, gameEnded: true, endReason: "degenerate", degenerate: true,
    });
    return;
  }

  const rand = seededRandom(seed || 1);
  const defs = buildCrownDefs(participantIds.length);
  const crownIds = defs.map((d) => d.id);
  // Fisher-Yates shuffle, seeded off the challenge's own shared
  // startedAt — same shared-seed determinism convention as every other
  // seeded-random game here (see e.g. lifesTapestryData.js's header),
  // and importantly NOT list order, so nobody trivially starts holding
  // "their own" trivially-matching crown.
  for (let i = crownIds.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [crownIds[i], crownIds[j]] = [crownIds[j], crownIds[i]];
  }
  const holdings = {};
  participantIds.forEach((id, i) => { holdings[id] = [crownIds[i]]; });
  const everHeld = emptyEverHeld(holdings);

  await set(gameId, key(round), {
    participantIds,
    crownDefs: defs,
    totalCrowns: defs.length,
    holdings, // playerId -> [crownId, ...] — ALWAYS fully visible to every player, no hidden information (see this file's header). Still relevant to what a player CAN currently trade away — just no longer what decides the win.
    everHeld, // playerId -> [crownId, ...] — every crown this player has EVER held, monotonically growing — THIS is what decides the win. See this file's header.
    proposals: [], // [{id, fromPlayerId, toPlayerId, offeredCrownId, requestedCrownId (null = gift), status: "pending"|"accepted"|"declined"|"cancelled"|"invalid", createdAt, resolvedAt}]
    tradeLog: [], // recent RESOLVED trades, newest last, for the activity feed
    everHeldTimestamps: emptyEverHeldTimestamps(everHeld), // see emptyEverHeldTimestamps's own header
    startedAt: now,
    winnerId: null,
    gameEnded: false,
    endReason: null, // "fullset" | "timeout" | "degenerate"
    endedAt: null,
    degenerate: false,
  });
}

function recordEverHeldGrowth(everHeldTimestamps, playerId, newSize, elapsedMs) {
  return { ...everHeldTimestamps, [playerId]: { ...(everHeldTimestamps[playerId] || {}), [newSize]: elapsedMs } };
}

// Proposes a trade to a specific target player: give them
// `offeredCrownId` (which the proposer must currently hold) in exchange
// for `requestedCrownId` (which the target must currently hold) —
// or, with `requestedCrownId` left null/undefined, a one-way GIFT of
// `offeredCrownId` asking nothing in return (see this file's header for
// why that escape hatch exists). Silently no-ops (same convention as
// every other trade/offer function in this app) on anything invalid: a
// self-trade, an unknown player, offering a crown the proposer doesn't
// actually currently hold, or requesting a crown the target doesn't
// actually currently hold. A player may have any number of simultaneous
// pending proposals in flight, in either direction, including more than
// one that names the SAME crown they currently hold — that's allowed on
// purpose (a continuous, freely-running negotiation floor, not
// turn-based); which one (if any) actually goes through first is
// decided at ACCEPT time, not here — see respondToTrade's own re-check.
export async function proposeTrade(gameId, round, fromPlayerId, toPlayerId, offeredCrownId, requestedCrownId) {
  const normalizedRequested = requestedCrownId == null ? null : requestedCrownId;
  return storageUpdate(gameId, key(round), (fresh) => {
    if (!fresh || fresh.gameEnded) return fresh;
    if (fromPlayerId === toPlayerId) return fresh;
    if (!fresh.participantIds.includes(fromPlayerId) || !fresh.participantIds.includes(toPlayerId)) return fresh;
    if (!(fresh.holdings[fromPlayerId] || []).includes(offeredCrownId)) return fresh;
    if (normalizedRequested != null) {
      if (normalizedRequested === offeredCrownId) return fresh; // nonsensical no-op
      if (!(fresh.holdings[toPlayerId] || []).includes(normalizedRequested)) return fresh;
    }
    const proposal = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      fromPlayerId, toPlayerId, offeredCrownId, requestedCrownId: normalizedRequested,
      status: "pending", createdAt: Date.now(), resolvedAt: null,
    };
    return { ...fresh, proposals: [...fresh.proposals, proposal] };
  });
}

// The proposer withdrawing their own still-pending proposal before the
// recipient has responded to it.
export async function cancelTrade(gameId, round, tradeId, playerId) {
  return storageUpdate(gameId, key(round), (fresh) => {
    if (!fresh || fresh.gameEnded) return fresh;
    const idx = fresh.proposals.findIndex((p) => p.id === tradeId);
    if (idx === -1) return fresh;
    const proposal = fresh.proposals[idx];
    if (proposal.status !== "pending" || proposal.fromPlayerId !== playerId) return fresh;
    const proposals = [...fresh.proposals];
    proposals[idx] = { ...proposal, status: "cancelled", resolvedAt: Date.now() };
    return { ...fresh, proposals };
  });
}

// The recipient responding to a proposal addressed to them. Declining
// is a pure status flip. Accepting is where the actual trade executes —
// see the CAS/no-double-spend reasoning inline below.
export async function respondToTrade(gameId, round, tradeId, playerId, accept) {
  return storageUpdate(gameId, key(round), (fresh) => {
    if (!fresh || fresh.gameEnded) return fresh;
    const idx = fresh.proposals.findIndex((p) => p.id === tradeId);
    if (idx === -1) return fresh;
    const proposal = fresh.proposals[idx];
    if (proposal.status !== "pending") return fresh;
    if (proposal.toPlayerId !== playerId) return fresh; // only the addressed recipient may respond

    if (!accept) {
      const proposals = [...fresh.proposals];
      proposals[idx] = { ...proposal, status: "declined", resolvedAt: Date.now() };
      return { ...fresh, proposals };
    }

    // ─── The actual double-spend guard ───
    // storageUpdate's own compare-and-swap loop (lib/dbAdapter.js) is
    // what makes this safe: this whole callback re-runs from scratch
    // against a genuinely FRESH read every time its write loses a race,
    // so `fresh.holdings` here is never stale. Re-checking both sides'
    // CURRENT holdings against THIS read — not against whatever was
    // true when the proposal was first created — is what actually
    // prevents a double-spend: a single crown can be named in any
    // number of simultaneously pending proposals (allowed, see
    // proposeTrade), and two players could try to accept two different
    // ones involving the same crown at nearly the same instant, but
    // only ONE accept's write can ever land first; every other
    // proposal touching that same crown fails this exact check the
    // moment IT gets re-evaluated (whether that's this same tick or a
    // later one), because by then the crown genuinely isn't where that
    // proposal still thinks it is. There is no window where a crown can
    // exist in two players' holdings at once, or vanish from both.
    const fromHolds = fresh.holdings[proposal.fromPlayerId] || [];
    const toHolds = fresh.holdings[proposal.toPlayerId] || [];
    const stillValid = fromHolds.includes(proposal.offeredCrownId)
      && (proposal.requestedCrownId == null || toHolds.includes(proposal.requestedCrownId));
    if (!stillValid) {
      const proposals = [...fresh.proposals];
      proposals[idx] = { ...proposal, status: "invalid", resolvedAt: Date.now() };
      return { ...fresh, proposals };
    }

    const fromRemaining = fromHolds.filter((c) => c !== proposal.offeredCrownId);
    const isGift = proposal.requestedCrownId == null;
    const toRemaining = isGift ? toHolds : toHolds.filter((c) => c !== proposal.requestedCrownId);
    const nextFromHoldings = isGift ? fromRemaining : [...fromRemaining, proposal.requestedCrownId];
    const nextToHoldings = [...toRemaining, proposal.offeredCrownId];
    const nextHoldings = { ...fresh.holdings, [proposal.fromPlayerId]: nextFromHoldings, [proposal.toPlayerId]: nextToHoldings };

    const proposals = fresh.proposals.map((p, i) => (i === idx ? { ...p, status: "accepted", resolvedAt: Date.now() } : p));

    // ─── everHeld checklist growth ───
    // The proposer (fromPlayerId) receives proposal.requestedCrownId on
    // a real swap (nothing, on a gift); the recipient (toPlayerId)
    // always receives proposal.offeredCrownId. Either arrival checks
    // that crown off for that player's `everHeld` set FOR GOOD if it's
    // new to them — a crown already checked off staying checked off
    // even once it's later traded away again is exactly the point (see
    // this file's header). A crown that was already checked off leaves
    // everHeld, and therefore its size, untouched.
    const elapsedNow = Date.now() - fresh.startedAt;
    let everHeld = fresh.everHeld;
    let everHeldTimestamps = fresh.everHeldTimestamps;
    const arrivals = [
      [proposal.fromPlayerId, isGift ? null : proposal.requestedCrownId],
      [proposal.toPlayerId, proposal.offeredCrownId],
    ];
    arrivals.forEach(([pid, crownId]) => {
      if (crownId == null) return;
      const held = everHeld[pid] || [];
      if (held.includes(crownId)) return;
      const nextHeld = [...held, crownId];
      everHeld = { ...everHeld, [pid]: nextHeld };
      everHeldTimestamps = recordEverHeldGrowth(everHeldTimestamps, pid, nextHeld.length, elapsedNow);
    });

    const tradeLog = [...fresh.tradeLog, {
      at: Date.now(), fromId: proposal.fromPlayerId, toId: proposal.toPlayerId,
      offeredCrownId: proposal.offeredCrownId, requestedCrownId: proposal.requestedCrownId, gift: isGift,
    }].slice(-40);

    let next = { ...fresh, holdings: nextHoldings, proposals, everHeld, everHeldTimestamps, tradeLog };

    // ─── Early resolution ───
    // The instant someone's CHECKLIST (everHeld) covers the full set,
    // the battle ends right there — same early-resolution pattern as
    // goldenFleeceData.js's own gameEnded, picked up by
    // lib/roundEngine.js's autoLockResolvedScores isResolved check
    // rather than waited out until the outer challenge timer. No longer
    // gated on CURRENTLY holding all of them at once (see this file's
    // header) — everHeld only grows, so this fires the very first
    // moment it's true and never needs to un-fire.
    const winnerId = [proposal.fromPlayerId, proposal.toPlayerId].find((pid) => (everHeld[pid] || []).length >= fresh.totalCrowns);
    if (winnerId) next = { ...next, gameEnded: true, winnerId, endReason: "fullset", endedAt: Date.now() };

    return next;
  });
}

function finalizeCrownsTimeout(fresh) {
  // Whoever's checklist (everHeld) has the most crowns checked off at
  // this final moment wins; a tie on size goes to whoever reached THAT
  // size earliest (see everHeldTimestamps's own header comment above);
  // any tie that survives even that falls through to the app's existing
  // generic finishedAt tiebreak (lib/challenges/scores.js) — nothing
  // further needed here.
  let winnerId = null;
  fresh.participantIds.forEach((pid) => {
    const size = (fresh.everHeld?.[pid] || []).length;
    if (!winnerId) { winnerId = pid; return; }
    const winnerSize = (fresh.everHeld?.[winnerId] || []).length;
    if (size > winnerSize) { winnerId = pid; return; }
    if (size === winnerSize) {
      const at = fresh.everHeldTimestamps?.[pid]?.[size] ?? Infinity;
      const winnerAt = fresh.everHeldTimestamps?.[winnerId]?.[winnerSize] ?? Infinity;
      if (at < winnerAt) winnerId = pid;
    }
  });
  return { ...fresh, gameEnded: true, winnerId, endReason: "timeout", endedAt: Date.now() };
}

// The authoritative safety-net tick. Trades are entirely player-
// initiated (no phase clock of its own to drive — unlike Golden
// Fleece's decision windows), so this is mostly here to catch ONE
// thing: the outer challenge timer running out before anyone completes
// the full set, same idea as autoResolveGoldenFleece's own comment in
// lib/roundEngine.js. `endsAt` is the battle's own real
// challenge.endsAt (this game has no separate phase timer of its own —
// see this file's header — so it uses the shared outer timer directly
// rather than computing its own from settings). Called on its own
// short interval by both the phone and the TV display, AND from
// lib/roundEngine.js's housekeeping pass — safe to call as often as
// anyone likes, since it no-ops unless the game genuinely isn't
// resolved yet and the timer has genuinely run out.
export async function tickCrowns(gameId, round, endsAt, db) {
  const update = db?.update || storageUpdate;
  if (!endsAt) return; // settings.infiniteTime — no outer timer to finalize against; only a full-set win can end this battle
  return update(gameId, key(round), (fresh) => {
    if (!fresh || fresh.gameEnded) return fresh;
    if (Date.now() < endsAt) return fresh;
    return finalizeCrownsTimeout(fresh);
  });
}

const FULLSET_TIER = 1e15; // a distinctly higher tier than any possible partial-checklist value below — an outright completion always outranks every non-completion, regardless of timing
const COUNT_MULTIPLIER = 1e9; // large enough that even a many-hour battle's elapsedMs (well under 1e9) never spills into the next checklist-size tier

// The value reported via reportScore — see this file's header comment
// block above for the full reasoning. An outright full-checklist
// completion (or the trivial degenerate single-player case) reports a
// value from the distinctly higher FULLSET_TIER so it always outranks
// every partial-checklist outcome. Otherwise: everHeldSize *
// COUNT_MULTIPLIER - elapsedMsWhenThisPlayerFirstReachedThatSize —
// higher checklist size always wins the primary comparison, and within
// an equal size, whoever got there with a SMALLER elapsed value (i.e.
// earlier) scores higher, since it's subtracted. Unlike the old
// current-holdings version, everHeld only ever grows, so "the elapsed
// value at this size" is unambiguous — it's simply when this player's
// checklist most recently (and, for everHeld, only ever) reached this
// exact size.
export function placementValue(state, playerId) {
  if (!state) return 0;
  if (state.winnerId === playerId && (state.endReason === "fullset" || state.endReason === "degenerate")) return FULLSET_TIER;
  const size = state.everHeld?.[playerId]?.length || 0;
  const atMs = state.everHeldTimestamps?.[playerId]?.[size] ?? 0;
  return size * COUNT_MULTIPLIER - atMs;
}
