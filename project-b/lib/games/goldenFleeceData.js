import { storageSet, storageUpdate, subscribeGameState } from "../gameStorage";

// ─── The Golden Fleece — Big Screen ───
// A Greek-mythology reskin of Diamant/Incan Gold
// (boardgamegeek.com/boardgame/15512), same credit-the-source approach
// this app already takes with Spyfall (see lib/games/spyfallData.js) —
// full push-your-luck expedition mechanic, just dressed as Jason's crew
// raiding a monster-guarded ruin for the Golden Fleece instead of
// Incan explorers raiding a temple. Everyone delves the SAME shared
// path on the shared TV at once; your phone is just your own private
// "press on or turn back" lever each time a new card turns up.
//
// Per chamber (this app runs 3, not the original's 5 — see
// TOTAL_CHAMBERS): a 31-card deck (15 treasure, 15 hazards — 3 each of
// 5 distinct monsters, 1 relic) is shuffled fresh. One card flips at a
// time:
//   - Treasure splits evenly (rounded down) among everyone still in the
//     chamber; whatever doesn't divide evenly stays sitting on the path.
//   - The FIRST sighting of a given monster does nothing but raise the
//     tension. The SECOND sighting of that same monster empties every
//     still-active player's hands for this chamber (gold banked in
//     earlier chambers is safe; leftover gold and any relic still
//     sitting on the path are lost too) and ends the chamber on the
//     spot.
//   - A relic just sits on the path — see below.
// After every card, everyone still active secretly chooses to press on
// or turn back, at the same time, blind to what everyone else picked
// (see submitChoice/tickGoldenFleece — same simultaneous-secret-choice,
// resolve-on-everyone-in-or-timeout shape as lib/games/torchedData.js's
// shooting rounds). Turning back banks whatever you're personally
// carrying this chamber for good, plus an equal share of any gold
// sitting unclaimed on the path. If EXACTLY one player turns back in a
// given moment, they alone also collect every relic sitting on the path
// so far (a real rule straight from the source game, not a
// simplification: multiple simultaneous retreats can't carry a relic
// out at all, which is exactly what makes "am I the only one leaving
// right now?" a real, tense guess). A fresh chamber always starts with
// EVERY original participant back at the entrance, however they did in
// the previous one.
//
// db: optional override on init/tick — see lib/games/
// plinkoBracketData.js's initPlinkoBracket for why (server-side auto-
// start/housekeeping passes its own db wrapper; a client call uses the
// default storage functions).

export const goldenFleeceKey = (round) => `pb:goldenfleece:${round}`;
const key = goldenFleeceKey;

export function subscribeGoldenFleece(gameId, round, onChange) {
  return subscribeGameState(gameId, key(round), onChange);
}

export const TOTAL_CHAMBERS = 3;
export const RELIC_VALUE = 5;

export const HAZARDS = {
  medusa: { label: "Medusa", icon: "🐍", flavor: "Her gaze turns the careless to stone." },
  sirens: { label: "The Sirens", icon: "🧜", flavor: "Their song leads sailors straight onto the rocks." },
  harpies: { label: "Harpies", icon: "🦅", flavor: "They swoop down and strip a camp bare." },
  cerberus: { label: "Cerberus", icon: "🐺", flavor: "The three-headed hound guards what's his." },
  scylla: { label: "Scylla", icon: "🐙", flavor: "She strikes from the strait without warning." },
};
const HAZARD_IDS = Object.keys(HAZARDS);
const COPIES_PER_HAZARD = 3;

// A close cousin of the source game's own 15 treasure values, not a
// literal copy — see this file's header for why an exact replica was
// never the goal here, just the same shape (mostly small values, a
// handful of big ones worth pressing on for).
export const TREASURE_VALUES = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 7, 9, 11, 13, 15];

function buildDeck() {
  const cards = [
    ...TREASURE_VALUES.map((value) => ({ type: "treasure", value })),
    ...HAZARD_IDS.flatMap((hazard) => Array.from({ length: COPIES_PER_HAZARD }, () => ({ type: "hazard", hazard }))),
    { type: "relic" },
  ];
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

function freshHazardCounts() {
  const counts = {};
  HAZARD_IDS.forEach((h) => { counts[h] = 0; });
  return counts;
}

function startChamber(participantIds, chamberNum) {
  return {
    chamberNum,
    deck: buildDeck(),
    path: [], // revealed cards this chamber, in order — TV feed
    hazardCounts: freshHazardCounts(),
    activeIds: [...participantIds],
    campedThisChamber: [], // who's already turned back this chamber, in the order they did
    carriedGold: Object.fromEntries(participantIds.map((id) => [id, 0])), // at-risk gold, this chamber only — lost on a repeat hazard, banked on turning back
    pathLeftoverGold: 0,
    pathRelics: 0,
    pendingChoices: {}, // playerId -> "stay" | "leave", THIS decision window only
    decisionStartedAt: Date.now(),
    chamberLog: [], // short flavor strings, newest last, for the TV feed
    drawsThisChamber: 0,
    chamberEndReason: null, // set once this chamber's own decision loop above ends: "allLeft" | "hazard" | "deckExhausted"
  };
}

export async function initGoldenFleece(gameId, round, participants, now, db) {
  const set = db?.set || storageSet;
  const participantIds = participants.map((p) => p.id);
  await set(gameId, key(round), {
    participantIds,
    totalChambers: TOTAL_CHAMBERS,
    goldTotals: Object.fromEntries(participantIds.map((id) => [id, 0])), // banked, safe, carries across chambers — this is the actual score
    gameEnded: false,
    ...startChamber(participantIds, 1),
  });
}

export function decisionWindowMs(settings) {
  // Same target-turns-into-a-window approach as lib/games/torchedData.js's
  // own matching constants — sized so a typical battle length lands on a
  // readable, not-too-rushed window per decision without needing a host
  // to babysit anyone's phone.
  const totalSec = settings?.challengeDurationSec || 600;
  const perDecisionSec = Math.max(10, Math.min(45, totalSec / 24));
  return perDecisionSec * 1000;
}

// A living, still-in-the-chamber player locks in ONE choice for the
// CURRENT decision window. Rejected as a no-op (same silent-reject
// convention as every other blind-choice game here) if the game's over,
// this player isn't currently active, or they've already chosen this
// window.
export async function submitChoice(gameId, round, playerId, choice) {
  return storageUpdate(gameId, key(round), (fresh) => {
    if (!fresh || fresh.gameEnded) return fresh;
    if (!fresh.activeIds.includes(playerId)) return fresh;
    if (fresh.pendingChoices[playerId]) return fresh;
    if (choice !== "stay" && choice !== "leave") return fresh;
    const next = { ...fresh, pendingChoices: { ...fresh.pendingChoices, [playerId]: choice } };
    // Fast path: if that was the last active player's choice, resolve
    // immediately in this same write rather than waiting for the next
    // poll — same optimization torchedData.js's own resolveRound
    // benefits from being called right after a submit, just done inline
    // here since there's nothing else this write needs to wait on.
    const everyoneIn = fresh.activeIds.every((id) => !!next.pendingChoices[id]);
    return everyoneIn ? resolveStep(next) : next;
  });
}

// The authoritative tick — called on its own short interval by both the
// TV display and every active player's own phone (same belt-and-
// suspenders redundancy as lib/games/wagerTriviaTvData.js's
// tickWagerTrivia), AND from lib/roundEngine.js's housekeeping pass, so
// a decision window still resolves on time even if nobody currently has
// either screen open. No-ops unless the window has genuinely either
// been fully answered or timed out — safe to call as often as anyone
// likes.
export async function tickGoldenFleece(gameId, round, settings, db) {
  const update = db?.update || storageUpdate;
  return update(gameId, key(round), (fresh) => {
    if (!fresh || fresh.gameEnded) return fresh;
    const everyoneIn = fresh.activeIds.length > 0 && fresh.activeIds.every((id) => !!fresh.pendingChoices[id]);
    const timedOut = Date.now() - fresh.decisionStartedAt >= decisionWindowMs(settings);
    if (!everyoneIn && !timedOut) return fresh;
    return resolveStep(fresh);
  });
}

// Pure function of the current state — everything below is synchronous,
// safe to run inside a storageUpdate callback. A player who never
// submitted by the time this runs (a timed-out window) defaults to
// "leave" — same "not deciding costs you the least, not the most"
// convention this app uses everywhere else (see e.g. the re-entry
// decision in components/ChallengePlayer.jsx) — a dead phone banks
// whatever that player was carrying rather than risking it forever.
function resolveStep(fresh) {
  const choices = fresh.pendingChoices;
  const leavingIds = fresh.activeIds.filter((id) => (choices[id] || "leave") === "leave");
  const stayingIds = fresh.activeIds.filter((id) => (choices[id] || "leave") === "stay");

  const nextGoldTotals = { ...fresh.goldTotals };
  const nextCarried = { ...fresh.carriedGold };
  let nextPathLeftoverGold = fresh.pathLeftoverGold;
  let nextPathRelics = fresh.pathRelics;
  const logAdd = [];

  if (leavingIds.length > 0) {
    const share = Math.floor(nextPathLeftoverGold / leavingIds.length);
    const remainder = nextPathLeftoverGold - share * leavingIds.length;
    leavingIds.forEach((id) => {
      nextGoldTotals[id] = (nextGoldTotals[id] || 0) + (nextCarried[id] || 0) + share;
      nextCarried[id] = 0;
    });
    nextPathLeftoverGold = remainder;

    // The real rule this is modeled on: relics only ever leave with a
    // SOLO retreat. Two or more turning back at once means the relics
    // stay put, up for grabs by whoever's left.
    if (leavingIds.length === 1 && nextPathRelics > 0) {
      const soleId = leavingIds[0];
      nextGoldTotals[soleId] += nextPathRelics * RELIC_VALUE;
      logAdd.push(`🐑 Alone on the way out, ${soleId} carries off ${nextPathRelics} shard${nextPathRelics === 1 ? "" : "s"} of the Fleece!`);
      nextPathRelics = 0;
    } else if (leavingIds.length > 1 && nextPathRelics > 0) {
      logAdd.push(`Too many retreated at once to grab the Fleece shard${nextPathRelics === 1 ? "" : "s"} on the path.`);
    }
  }

  const withGoldChanges = {
    ...fresh, goldTotals: nextGoldTotals, carriedGold: nextCarried,
    pathLeftoverGold: nextPathLeftoverGold, pathRelics: nextPathRelics,
    campedThisChamber: [...fresh.campedThisChamber, ...leavingIds],
    chamberLog: [...fresh.chamberLog, ...logAdd],
  };

  if (stayingIds.length === 0) {
    return endChamber(withGoldChanges, "allLeft");
  }

  if (fresh.deck.length === 0) {
    // Never actually expected (31 cards is far more than any realistic
    // chamber draws through), but a graceful, no-stall fallback beats a
    // stuck battle: everyone still in just walks out with what they're
    // carrying, same as if they'd all chosen to leave.
    const finalGold = { ...withGoldChanges.goldTotals };
    const finalCarried = { ...withGoldChanges.carriedGold };
    stayingIds.forEach((id) => {
      finalGold[id] = (finalGold[id] || 0) + (finalCarried[id] || 0);
      finalCarried[id] = 0;
    });
    return endChamber({ ...withGoldChanges, goldTotals: finalGold, carriedGold: finalCarried, campedThisChamber: [...withGoldChanges.campedThisChamber, ...stayingIds] }, "deckExhausted");
  }

  const [card, ...restDeck] = fresh.deck;
  const nextHazardCounts = { ...fresh.hazardCounts };
  const drawLog = [];
  let hazardRepeat = false;

  if (card.type === "treasure") {
    const share = Math.floor(card.value / stayingIds.length);
    const remainder = card.value - share * stayingIds.length;
    stayingIds.forEach((id) => { nextCarried[id] = (nextCarried[id] || 0) + share; });
    nextPathLeftoverGold += remainder;
    drawLog.push(`💰 ${card.value} gold uncovered — ${share} each${remainder > 0 ? `, ${remainder} left on the path` : ""}.`);
  } else if (card.type === "relic") {
    nextPathRelics += 1;
    drawLog.push(`🐑 A shard of the Golden Fleece glints on the path...`);
  } else if (card.type === "hazard") {
    nextHazardCounts[card.hazard] = (nextHazardCounts[card.hazard] || 0) + 1;
    const h = HAZARDS[card.hazard];
    if (nextHazardCounts[card.hazard] >= 2) {
      hazardRepeat = true;
      drawLog.push(`${h.icon} ${h.label} again! Everyone still inside flees with nothing from this chamber.`);
      stayingIds.forEach((id) => { nextCarried[id] = 0; });
    } else {
      drawLog.push(`${h.icon} ${h.label} appears — first sighting. Press on if you dare.`);
    }
  }

  const nextState = {
    ...withGoldChanges,
    deck: restDeck,
    path: [...fresh.path, card],
    hazardCounts: nextHazardCounts,
    carriedGold: nextCarried,
    pathLeftoverGold: nextPathLeftoverGold,
    pathRelics: nextPathRelics,
    drawsThisChamber: fresh.drawsThisChamber + 1,
    chamberLog: [...withGoldChanges.chamberLog, ...drawLog],
  };

  if (hazardRepeat) {
    return endChamber({ ...nextState, pathLeftoverGold: 0, pathRelics: 0 }, "hazard");
  }

  return {
    ...nextState,
    activeIds: stayingIds,
    pendingChoices: {},
    decisionStartedAt: Date.now(),
  };
}

function endChamber(state, reason) {
  const finishedChamber = state.chamberNum;
  if (finishedChamber >= state.totalChambers) {
    return { ...state, activeIds: [], chamberEndReason: reason, gameEnded: true };
  }
  return {
    participantIds: state.participantIds,
    totalChambers: state.totalChambers,
    goldTotals: state.goldTotals,
    gameEnded: false,
    ...startChamber(state.participantIds, finishedChamber + 1),
    chamberEndReason: reason, // flavor only — the fresh chamber's own fields above already reset everything that matters mechanically
  };
}

// The value reported via reportScore — just the banked total. Gold
// still being carried mid-chamber deliberately does NOT count yet
// (that's the entire tension of the game: it's only really yours once
// you've walked out with it), so this can be, and is, safe to read live
// while the game's still in progress, not just once gameEnded.
export function placementValue(state, playerId) {
  return state.goldTotals?.[playerId] || 0;
}
