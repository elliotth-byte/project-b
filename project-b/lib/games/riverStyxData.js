import { storageSet, storageUpdate, subscribeGameState } from "../gameStorage";
import { ALL_TILE_DESIGNS, shuffledIndexes, pickStartSlots, resolveMovement } from "./tsuroCore";

// ─── River Styx — Big Screen ───
// A Greek-mythology reskin of Tsuro (boardgamegeek.com/boardgame/2513)
// — see lib/games/tsuroCore.js's own header for the shared board/tile
// engine and the honest note on how its 35-tile deck was generated.
// Everyone's marker (a shade crossing the Styx) sits on the shared
// board, shown on the TV; your phone only ever shows your own 3-tile
// hand. Turn-based, not simultaneous: on your turn you place one tile
// from your hand (rotated however you like) into the cell your shade
// currently faces, and it — and anyone else who was also waiting on
// that same cell — slides along the newly-connected paths until it
// either exits the board (eliminated), reaches a cell with no tile yet
// (rests there, waiting), or collides with someone else's shade
// (both eliminated). Last shade on the board wins; a full round of
// deck-and-hand exhaustion, or everyone's last shades vanishing on the
// very same placement, is a shared tie.
//
// ─── The Dragon tile (turn-order marker), at reasonable fidelity ───
// In the real game, the one non-path Dragon tile changes hands to
// whoever first can't refill their hand once the shared deck runs dry,
// and that holder plays first every round after that. Implemented
// here at the fidelity the task calls for (a genuinely minor edge
// case, not worth over-engineering): the first player who tries to
// refill with an empty deck and an empty hand becomes `dragonHolderId`
// and is moved to the front of the live turn order on the spot — a
// faithful "you're up first from now on" without simulating a
// physical tile changing hands round to round.
export const riverStyxKey = (round) => `pb:riverstyx:${round}`;
const key = riverStyxKey;

export function subscribeRiverStyx(gameId, round, onChange) {
  return subscribeGameState(gameId, key(round), onChange);
}

const HAND_SIZE = 3;

function drawTiles(state, count) {
  const drawn = [];
  while (drawn.length < count && state.deck.length > 0) {
    drawn.push(state.deck.shift());
  }
  return drawn;
}

export async function initRiverStyx(gameId, round, participants, now, db) {
  const set = db?.set || storageSet;
  const participantIds = participants.map((p) => p.id);
  const startSlots = pickStartSlots(participantIds.length);

  const positions = {};
  participantIds.forEach((id, i) => {
    positions[id] = { cell: startSlots[i].cell, point: startSlots[i].point, status: "active" };
  });

  // Enough tiles for a full hand each, plus a healthy shared draw pile
  // — the real game's deck (35, one copy each) minus what everyone's
  // dealt, same ratio.
  const deckWrapper = { deck: shuffledIndexes(ALL_TILE_DESIGNS.length) };
  const hands = {};
  participantIds.forEach((id) => { hands[id] = drawTiles(deckWrapper, HAND_SIZE); });

  await set(gameId, key(round), {
    participantIds,
    turnOrder: [...participantIds],
    turnIndex: 0,
    positions,
    tilesByCell: {},
    deck: deckWrapper.deck,
    hands,
    dragonHolderId: null,
    log: [`The crossing begins — ${participantIds.length} shades approach the Styx.`],
    turnStartedAt: now,
    gameEnded: false,
    winnerIds: [],
    finishOrder: [], // eliminated players in the order they fell, oldest first
  });
}

export function turnWindowMs(settings) {
  const totalSec = settings?.challengeDurationSec || 720;
  const perTurnSec = Math.max(20, Math.min(90, totalSec / 12));
  return perTurnSec * 1000;
}

function nextActiveIndex(turnOrder, positions, fromIndex) {
  for (let step = 1; step <= turnOrder.length; step++) {
    const idx = (fromIndex + step) % turnOrder.length;
    if (positions[turnOrder[idx]]?.status === "active") return idx;
  }
  return -1; // nobody active left
}

function refillHand(state, playerId) {
  const hand = state.hands[playerId] || [];
  while (hand.length < HAND_SIZE && state.deck.length > 0) {
    hand.push(state.deck.shift());
  }
  state.hands[playerId] = hand;
  // Dragon-tile edge case: truly nothing left anywhere for this player.
  if (hand.length === 0 && state.deck.length === 0 && !state.dragonHolderId) {
    state.dragonHolderId = playerId;
    state.turnOrder = [playerId, ...state.turnOrder.filter((id) => id !== playerId)];
    state.log = [...state.log, `🐉 The deck runs dry — the Dragon Tile passes to the front of the line.`];
  }
}

function recirculateEliminatedHand(state, playerId) {
  const leftover = state.hands[playerId] || [];
  if (leftover.length > 0) {
    state.deck = [...state.deck, ...leftover];
    // Reshuffle so recirculated tiles don't just sit predictably on top.
    for (let i = state.deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [state.deck[i], state.deck[j]] = [state.deck[j], state.deck[i]];
    }
  }
  state.hands[playerId] = [];
}

function checkGameEnd(state) {
  const activeIds = state.participantIds.filter((id) => state.positions[id].status === "active");
  if (activeIds.length === 1) {
    return { ...state, gameEnded: true, winnerIds: [activeIds[0]] };
  }
  if (activeIds.length === 0) {
    // Everyone's last shades vanished on the same placement — shared tie.
    const lastStanding = state.finishOrder.length
      ? state.finishOrder.slice(-1) // fallback, shouldn't normally hit
      : state.participantIds;
    return { ...state, gameEnded: true, winnerIds: findSimultaneousLast(state) || lastStanding };
  }
  // Deck AND every hand exhausted with 2+ still on the board: shared tie.
  const anyTilesLeft = state.deck.length > 0 || activeIds.some((id) => (state.hands[id] || []).length > 0);
  if (!anyTilesLeft) {
    return { ...state, gameEnded: true, winnerIds: activeIds };
  }
  return state;
}

// Finds the group of players eliminated in THIS resolution step (they
// share the highest "finishOrder" position reached simultaneously),
// used to award a shared win when the board empties out all at once.
function findSimultaneousLast(state) {
  if (state.finishOrder.length === 0) return null;
  const lastBatchSize = state.lastEliminationBatch || 1;
  return state.finishOrder.slice(-lastBatchSize);
}

export async function submitPlacement(gameId, round, playerId, handIndex, rotation) {
  return storageUpdate(gameId, key(round), (fresh) => {
    if (!fresh || fresh.gameEnded) return fresh;
    if (fresh.turnOrder[fresh.turnIndex] !== playerId) return fresh;
    if (fresh.positions[playerId]?.status !== "active") return fresh;
    const hand = fresh.hands[playerId] || [];
    if (handIndex < 0 || handIndex >= hand.length) return fresh;

    const placedCell = fresh.positions[playerId].cell;
    if (placedCell == null || fresh.tilesByCell[placedCell]) return fresh; // already tiled — shouldn't happen

    const designIndex = hand[handIndex];
    const nextHands = { ...fresh.hands, [playerId]: hand.filter((_, i) => i !== handIndex) };
    const nextTilesByCell = { ...fresh.tilesByCell, [placedCell]: { designIndex, rotation: ((rotation % 4) + 4) % 4, ownerId: playerId } };

    const { positions: nextPositions, eliminatedIds } = resolveMovement(fresh.positions, nextTilesByCell, placedCell);

    let next = {
      ...fresh,
      positions: nextPositions,
      tilesByCell: nextTilesByCell,
      hands: nextHands,
      finishOrder: [...fresh.finishOrder, ...eliminatedIds],
      lastEliminationBatch: eliminatedIds.length,
      log: [
        ...fresh.log,
        eliminatedIds.length > 0
          ? `⚔️ A tile is placed — ${eliminatedIds.length} shade${eliminatedIds.length === 1 ? "" : "s"} lost to the river.`
          : `A tile is placed.`,
      ].slice(-20),
    };

    eliminatedIds.forEach((id) => recirculateEliminatedHand(next, id));
    if (next.positions[playerId]?.status === "active") refillHand(next, playerId);

    next = checkGameEnd(next);
    if (next.gameEnded) return next;

    const nextIdx = nextActiveIndex(next.turnOrder, next.positions, next.turnOrder.indexOf(playerId));
    if (nextIdx === -1) return checkGameEnd({ ...next, positions: next.positions });
    return { ...next, turnIndex: nextIdx, turnStartedAt: Date.now() };
  });
}

// Housekeeping tick — called on a poll interval by the TV, every
// active phone, and lib/roundEngine.js's own server housekeeping pass
// (same belt-and-suspenders redundancy as tickGoldenFleece). For a
// turn-based game this is mostly a stall-safety net: if the player
// whose turn it is has gone idle past a generous per-turn timeout, it
// auto-plays a random legal tile from their hand at rotation 0 on
// their behalf, so the room never gets stuck waiting on an AFK phone.
export async function tickRiverStyx(gameId, round, settings, db) {
  const update = db?.update || storageUpdate;
  return update(gameId, key(round), (fresh) => {
    if (!fresh || fresh.gameEnded) return fresh;
    if (Date.now() - fresh.turnStartedAt < turnWindowMs(settings)) return fresh;
    const playerId = fresh.turnOrder[fresh.turnIndex];
    const hand = fresh.hands[playerId] || [];
    if (hand.length === 0) {
      // Nothing to auto-play — just refill/advance so the game doesn't
      // stall forever on a hand-less idle player.
      const next = { ...fresh };
      refillHand(next, playerId);
      if ((next.hands[playerId] || []).length === 0) {
        const nextIdx = nextActiveIndex(next.turnOrder, next.positions, next.turnIndex);
        if (nextIdx === -1) return checkGameEnd(next);
        return checkGameEnd({ ...next, turnIndex: nextIdx, turnStartedAt: Date.now() });
      }
      return { ...next, turnStartedAt: Date.now() };
    }
    return autoPlayFirstTile(fresh, playerId);
  });
}

function autoPlayFirstTile(fresh, playerId) {
  const hand = fresh.hands[playerId];
  const placedCell = fresh.positions[playerId].cell;
  const designIndex = hand[0];
  const nextHands = { ...fresh.hands, [playerId]: hand.slice(1) };
  const nextTilesByCell = { ...fresh.tilesByCell, [placedCell]: { designIndex, rotation: 0, ownerId: playerId } };
  const { positions: nextPositions, eliminatedIds } = resolveMovement(fresh.positions, nextTilesByCell, placedCell);
  let next = {
    ...fresh,
    positions: nextPositions,
    tilesByCell: nextTilesByCell,
    hands: nextHands,
    finishOrder: [...fresh.finishOrder, ...eliminatedIds],
    lastEliminationBatch: eliminatedIds.length,
    log: [...fresh.log, `⏱️ ${playerId} took too long — a tile was placed for them.`].slice(-20),
  };
  eliminatedIds.forEach((id) => recirculateEliminatedHand(next, id));
  if (next.positions[playerId]?.status === "active") refillHand(next, playerId);
  next = checkGameEnd(next);
  if (next.gameEnded) return next;
  const nextIdx = nextActiveIndex(next.turnOrder, next.positions, next.turnOrder.indexOf(playerId));
  if (nextIdx === -1) return checkGameEnd(next);
  return { ...next, turnIndex: nextIdx, turnStartedAt: Date.now() };
}

// Placement-based scoring, same shape as Golden Fleece's own
// placementValue (see that file's comment): the winner scores highest,
// everyone else scores according to how long they survived (their
// position in finishOrder — earlier elimination = lower score), and a
// shared-win/shared-tie group all score the same, above everyone who
// fell before them.
export function placementValue(state, playerId) {
  if (!state) return 0;
  const totalPlayers = state.participantIds.length;
  if (state.winnerIds?.includes(playerId)) return totalPlayers + 1;
  const fellAt = state.finishOrder.indexOf(playerId);
  if (fellAt === -1) return totalPlayers; // still active, game not over yet — provisional top score
  // Survived longer (higher index in finishOrder) = higher score, but
  // always strictly below every winner's score above.
  return fellAt + 1;
}
