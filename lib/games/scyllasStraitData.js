import { storageSet, storageUpdate, subscribeGameState } from "../gameStorage";

// ─── Scylla's Strait — Big Screen ───
// A reskin of the Get Bit! board game: sailors row single-file through
// a narrow strait with the monster Scylla lurking behind the very last
// boat. Each round, everyone privately plays one card from their hand
// (numbered 1..handSize, where handSize = starting player count + 1 —
// same scaling rule the physical game uses for 4/5/6 players, just
// generalized to any count). Cards are revealed together: whoever
// played the LOWEST number with no one else matching it moves their
// boat to the very front of the line, then the next-lowest unique
// number does the same, and so on — each move cuts to the front of
// the CURRENT line, so the highest untied player to move ends up
// truly frontmost. Anyone who tied another player's number doesn't
// move at all, and gets left behind by everyone who did.
//
// Whoever's boat ends up LAST after all that gets bitten: Scylla
// snatches one of their four items (an oar, a sandal, a shield, a
// toga), their boat is flung all the way to the front, and they get
// every card they've ever played back into their hand — a real
// consolation for the worst spot in the line. A played card that
// ISN'T retrieved this way stays face-up in a visible discard pile
// (inspectable by everyone, same as the physical game's whole bluffing
// tension) UNLESS the player would have 2 or fewer cards left in hand,
// in which case they quietly recycle their own discard pile back into
// their hand regardless of getting bitten. Losing all 4 items eliminates
// a sailor outright. The very first round never bites (the starting
// line order is random, nobody's "earned" last place yet).
//
// Once only two sailors are left, the round-by-round loop stops dead:
// Scylla immediately takes whoever's in back, and whoever's in front
// wins on the spot — matching the physical game's own printed
// shortcut ending rather than playing out a pointless final round.
//
// Deliberately a real bracket-style winner/elimination game, like
// lib/games/musicalChairsTvData.js and lib/games/torchedData.js — NOT
// continuous like Wager Trivia/Acrophobia — so it's driven by
// autoLockResolvedScores in roundEngine.js once winnerId is set,
// exactly like those two.
const ITEM_NAMES = ["an oar", "a sandal", "a shield", "a toga"];
const CHOOSING_WINDOW_MS = 20000;
const RESOLVED_DISPLAY_MS = 7000;

function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffledIds(ids, rng) {
  const arr = ids.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function fullHand(handSize) {
  return Array.from({ length: handSize }, (_, i) => i + 1);
}

function removeOne(arr, value) {
  const next = arr.slice();
  const i = next.indexOf(value);
  if (i !== -1) next.splice(i, 1);
  return next;
}

export const scyllasStraitKey = (round) => `pb:scyllasstrait:${round}`;

export function subscribeScyllasStrait(gameId, round, onChange) {
  return subscribeGameState(gameId, scyllasStraitKey(round), onChange);
}

// Checks the physical game's own printed shortcut: once exactly 2
// sailors remain, the loop ends immediately — Scylla eats whoever's in
// back, whoever's in front wins, no further card round is dealt. Pure
// function of an in-progress state, applied both right after init (a
// battle that somehow starts with only 2 participants) and after every
// bite resolves an elimination down to 2.
function applyFinalTwoShortcut(state, roundForRecord) {
  if (state.order.length > 2 || state.winnerId) return state;
  if (state.order.length === 2) {
    const [front, back] = state.order;
    return {
      ...state,
      phase: "gameOver",
      winnerId: front,
      eliminatedInRound: { ...state.eliminatedInRound, [back]: roundForRecord },
      order: [front],
    };
  }
  // Defensive only — normal play can never actually reach 1 or 0 in one
  // step (a single bite removes at most one sailor per round), but a
  // battle can't be left with no winner declared if it somehow did.
  if (state.order.length === 1) {
    return { ...state, phase: "gameOver", winnerId: state.order[0] };
  }
  return state;
}

export async function initScyllasStrait(gameId, round, participants, seed, db) {
  const set = db?.set || storageSet;
  const rng = mulberry32(seed || Date.now());
  const ids = participants.map((p) => p.id);
  const handSize = ids.length + 1;
  const order = shuffledIds(ids, rng);
  const hands = {}, discards = {}, itemsLeft = {}, lostItems = {};
  ids.forEach((id) => {
    hands[id] = fullHand(handSize);
    discards[id] = [];
    itemsLeft[id] = ITEM_NAMES.slice();
    lostItems[id] = [];
  });

  let state = {
    participantIds: ids,
    handSize,
    order,
    hands,
    discards,
    itemsLeft, // playerId -> array of item names not yet lost (length 0 = eliminated)
    lostItems, // playerId -> array of item names already lost, in the order lost
    round: 1,
    phase: "choosing", // "choosing" | "resolved" | "gameOver"
    phaseStartedAt: Date.now(),
    picks: {},
    lastRoundResult: null,
    eliminatedInRound: {},
    winnerId: null,
  };
  state = applyFinalTwoShortcut(state, 1);
  await set(gameId, scyllasStraitKey(round), state);
}

export async function submitScyllaCard(gameId, round, playerId, cardValue) {
  return storageUpdate(gameId, scyllasStraitKey(round), (fresh) => {
    if (!fresh || fresh.phase !== "choosing") return fresh;
    if (!fresh.order.includes(playerId)) return fresh; // eliminated, or somehow not seated
    if (fresh.picks[playerId] != null) return fresh; // already played this round
    if (!(fresh.hands[playerId] || []).includes(cardValue)) return fresh; // don't own that card
    return {
      ...fresh,
      hands: { ...fresh.hands, [playerId]: removeOne(fresh.hands[playerId], cardValue) },
      picks: { ...fresh.picks, [playerId]: cardValue },
    };
  });
}

// The actual phase-transition logic, kept as a pure function of
// (fresh, now) — same reasoning as every other Big Screen game's own
// header comment on this split (e.g. wagerTriviaTransition in
// lib/games/wagerTriviaTvData.js): exercisable directly by a
// standalone test script with zero mocking. tickScyllasStrait below is
// just this wrapped in the standard storageUpdate CAS.
export function scyllasStraitTransition(fresh, now) {
  if (!fresh || fresh.phase === "gameOver") return fresh;

  if (fresh.phase === "choosing") {
    const everyonePicked = fresh.order.every((id) => fresh.picks[id] != null);
    const timedOut = now - fresh.phaseStartedAt >= CHOOSING_WINDOW_MS;
    if (!everyonePicked && !timedOut) return fresh;

    // Anyone who never picked in time auto-plays their lowest
    // remaining card — a real, if unglamorous, default: it's the
    // single worst card to play alone (see this file's header comment
    // on why a low unique number gets overtaken by everyone else), so
    // sitting out costs something real rather than nothing.
    const hands = { ...fresh.hands };
    const picks = { ...fresh.picks };
    fresh.order.forEach((id) => {
      if (picks[id] == null) {
        const lowest = Math.min(...hands[id]);
        hands[id] = removeOne(hands[id], lowest);
        picks[id] = lowest;
      }
    });

    const counts = {};
    fresh.order.forEach((id) => { counts[picks[id]] = (counts[picks[id]] || 0) + 1; });
    const untiedIds = fresh.order.filter((id) => counts[picks[id]] === 1).sort((a, b) => picks[a] - picks[b]);
    const tiedIds = fresh.order.filter((id) => counts[picks[id]] > 1);

    let newOrder = fresh.order.slice();
    untiedIds.forEach((id) => { newOrder = [id, ...newOrder.filter((x) => x !== id)]; });

    // Per-player hand bookkeeping — independent of movement/biting:
    // every played card either joins that player's own face-up
    // discard pile (publicly inspectable, exactly like the physical
    // game) or, if that would leave them with 2 or fewer cards in
    // hand, their whole discard pile quietly comes back to them.
    const discards = { ...fresh.discards };
    fresh.order.forEach((id) => {
      let discard = [...(discards[id] || []), picks[id]];
      if (hands[id].length <= 2) {
        hands[id] = [...hands[id], ...discard];
        discard = [];
      }
      discards[id] = discard;
    });

    let bitten = null, itemLost = null, eliminated = null;
    const itemsLeft = { ...fresh.itemsLeft };
    const lostItems = { ...fresh.lostItems };
    const eliminatedInRound = { ...fresh.eliminatedInRound };

    // The very first round never bites — the starting line was random,
    // nobody's actually earned last place yet.
    if (fresh.round > 1) {
      bitten = newOrder[newOrder.length - 1];
      const remaining = itemsLeft[bitten].slice();
      itemLost = remaining.shift();
      itemsLeft[bitten] = remaining;
      lostItems[bitten] = [...lostItems[bitten], itemLost];

      // A bite always flings you to the front and hands back every
      // card you've ever played, regardless of the 2-or-fewer rule
      // above — the one real consolation for getting caught last.
      newOrder = [bitten, ...newOrder.filter((x) => x !== bitten)];
      hands[bitten] = [...hands[bitten], ...discards[bitten]];
      discards[bitten] = [];

      if (remaining.length === 0) {
        eliminated = bitten;
        eliminatedInRound[bitten] = fresh.round;
        newOrder = newOrder.filter((x) => x !== bitten);
      }
    }

    let next = {
      ...fresh,
      order: newOrder,
      hands,
      discards,
      itemsLeft,
      lostItems,
      eliminatedInRound,
      picks: {},
      phase: "resolved",
      phaseStartedAt: now,
      round: fresh.round + 1,
      lastRoundResult: {
        round: fresh.round,
        picks,
        untiedIds,
        tiedIds,
        newOrder,
        bitten,
        itemLost,
        eliminated,
      },
    };
    next = applyFinalTwoShortcut(next, fresh.round);
    return next;
  }

  if (fresh.phase === "resolved") {
    if (now - fresh.phaseStartedAt < RESOLVED_DISPLAY_MS) return fresh;
    return { ...fresh, phase: "choosing", phaseStartedAt: now };
  }

  return fresh;
}

export async function tickScyllasStrait(gameId, round, db) {
  const update = db?.update || storageUpdate;
  const now = Date.now();
  return update(gameId, scyllasStraitKey(round), (fresh) => scyllasStraitTransition(fresh, now));
}

// Real bracket-style winner/elimination shape, same tiering as
// lib/games/musicalChairsTvData.js's own placementValue: the winner
// always outranks anyone eliminated, an earlier elimination always
// ranks below a later one (1000 + eliminatedRound needs no extra
// offset for that to hold), and anyone still alive but the battle
// hasn't ended yet ranks above every past elimination but below the
// eventual winner — broken by how many items they still have, so a
// live leaderboard mid-battle reads sensibly even before anyone's won.
export function placementValue(state, playerId) {
  if (state.winnerId === playerId) return 1000000;
  const elimRound = state.eliminatedInRound?.[playerId];
  if (elimRound != null) return 1000 + elimRound;
  const itemsLeft = state.itemsLeft?.[playerId]?.length ?? 0;
  return 100000 + itemsLeft * 100 + (state.round || 0);
}
