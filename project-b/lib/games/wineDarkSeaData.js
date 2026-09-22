import { storageSet, storageUpdate, subscribeGameState } from "../gameStorage";
import { ALL_TILE_DESIGNS, CELL_COUNT, BOARD_SIZE, cellRowCol, cellIndex, shuffledIndexes, pickStartSlots, resolveMovement } from "./tsuroCore";

// ─── The Wine-Dark Sea — Big Screen ───
// A Greek-mythology reskin of Tsuro of the Seas
// (boardgamegeek.com/boardgame/79066), the expansion to Tsuro — see
// lib/games/tsuroCore.js's own header for the shared board/tile engine
// this reuses wholesale (same 6x6 grid, same 8-point tile matchings),
// and lib/games/riverStyxData.js for the base-game sibling this mirrors
// turn-for-turn. The two real differences from River Styx: a much
// larger "wake tile" pool (~55 tiles here, built from the same 35
// rotationally-distinct designs — see tsuroCore.js's header for why
// there are only 35 truly distinct ones — cycled with deliberate
// duplicates to reach the expansion's real card count, same honest
// procedural-generation note as that file), and Charybdis: a handful
// of roaming whirlpools that can drag a ship under with no warning.
//
// ─── Charybdis, at the fidelity the task calls for ───
// After a player's own boat finishes resolving on their turn, a d8
// roll (1-8, via Math.random — no physical dice, this is automated):
// on a 6, 7, or 8 (3/8, "roughly 3/8 chance" as specified), ONE active
// whirlpool is chosen at random and dragged one cell in a random
// grid direction (clamped to stay on the board — a whirlpool pinned
// against an edge just tries a different direction that turn rather
// than leaving the board, since it isn't a marker and was never meant
// to exit). If its new cell is the same as, or 8-directionally
// adjacent to, any boat's current cell, that boat is destroyed
// (eliminated) on the spot — no path logic, just grid adjacency, per
// the confirmed research notes for this game. This is a simplified,
// clearly-flagged interpretation of a monster whose full physical
// rules (which involve a rulebook not sourceable here) were never the
// goal — a real, present threat that meaningfully favors caution near
// the coastline, without over-engineering the ocean.
export const wineDarkSeaKey = (round) => `pb:winedarksea:${round}`;
const key = wineDarkSeaKey;

export function subscribeWineDarkSea(gameId, round, onChange) {
  return subscribeGameState(gameId, key(round), onChange);
}

const HAND_SIZE = 3;
// ~55 "wake tiles", cycling back through the 35 rotationally-distinct
// designs — see this file's own header for why that duplication is an
// honest, documented choice rather than a gap.
const WAKE_TILE_COUNT = 55;

function drawTiles(wrapper, count) {
  const drawn = [];
  while (drawn.length < count && wrapper.deck.length > 0) drawn.push(wrapper.deck.shift());
  return drawn;
}

function monsterCountFor(playerCount) {
  return Math.max(3, Math.min(6, playerCount + 2));
}

function randomEmptyCell(occupiedCells) {
  let cell;
  let guard = 0;
  do {
    cell = Math.floor(Math.random() * CELL_COUNT);
    guard++;
  } while (occupiedCells.has(cell) && guard < 200);
  return cell;
}

export async function initWineDarkSea(gameId, round, participants, now, db) {
  const set = db?.set || storageSet;
  const participantIds = participants.map((p) => p.id);
  const startSlots = pickStartSlots(participantIds.length);

  const positions = {};
  const occupied = new Set();
  participantIds.forEach((id, i) => {
    positions[id] = { cell: startSlots[i].cell, point: startSlots[i].point, status: "active" };
    occupied.add(startSlots[i].cell);
  });

  const monsterCount = monsterCountFor(participantIds.length);
  const monsters = [];
  for (let i = 0; i < monsterCount; i++) {
    const cell = randomEmptyCell(occupied);
    occupied.add(cell);
    monsters.push(cell);
  }

  const deckWrapper = { deck: shuffledIndexes(WAKE_TILE_COUNT) };
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
    monsters, // array of cell indexes — Charybdis's whirlpools
    dragonHolderId: null,
    log: [`Anchors up — ${participantIds.length} ships put out onto the wine-dark sea, and Charybdis is already circling.`],
    turnStartedAt: now,
    gameEnded: false,
    winnerIds: [],
    finishOrder: [],
  });
}

export function turnWindowMs(settings) {
  const totalSec = settings?.challengeDurationSec || 780;
  const perTurnSec = Math.max(20, Math.min(90, totalSec / 12));
  return perTurnSec * 1000;
}

function nextActiveIndex(turnOrder, positions, fromIndex) {
  for (let step = 1; step <= turnOrder.length; step++) {
    const idx = (fromIndex + step) % turnOrder.length;
    if (positions[turnOrder[idx]]?.status === "active") return idx;
  }
  return -1;
}

function refillHand(state, playerId) {
  const hand = state.hands[playerId] || [];
  while (hand.length < HAND_SIZE && state.deck.length > 0) hand.push(state.deck.shift());
  state.hands[playerId] = hand;
  if (hand.length === 0 && state.deck.length === 0 && !state.dragonHolderId) {
    state.dragonHolderId = playerId;
    state.turnOrder = [playerId, ...state.turnOrder.filter((id) => id !== playerId)];
    state.log = [...state.log, `🐉 The wake-tile stock runs dry — the turn marker passes to the front of the line.`];
  }
}

function recirculateEliminatedHand(state, playerId) {
  const leftover = state.hands[playerId] || [];
  if (leftover.length > 0) {
    state.deck = [...state.deck, ...leftover];
    for (let i = state.deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [state.deck[i], state.deck[j]] = [state.deck[j], state.deck[i]];
    }
  }
  state.hands[playerId] = [];
}

// One d8 roll — on a 6+, one active whirlpool lurches a cell and takes
// out anything adjacent to (or on top of) where it lands.
function rollCharybdis(state) {
  const roll = 1 + Math.floor(Math.random() * 8);
  if (roll < 6 || state.monsters.length === 0) return { moved: false };

  const idx = Math.floor(Math.random() * state.monsters.length);
  const { row, col } = cellRowCol(state.monsters[idx]);
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];
  for (let i = dirs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
  }
  let newCell = state.monsters[idx];
  for (const [dr, dc] of dirs) {
    const nrow = row + dr, ncol = col + dc;
    if (nrow >= 0 && nrow < BOARD_SIZE && ncol >= 0 && ncol < BOARD_SIZE) {
      newCell = cellIndex(nrow, ncol);
      break;
    }
  }
  state.monsters = state.monsters.map((c, i) => (i === idx ? newCell : c));

  const { row: mr, col: mc } = cellRowCol(newCell);
  const drowned = [];
  state.participantIds.forEach((id) => {
    const pos = state.positions[id];
    if (pos.status !== "active" || pos.cell == null) return;
    const { row: pr, col: pc } = cellRowCol(pos.cell);
    if (Math.abs(pr - mr) <= 1 && Math.abs(pc - mc) <= 1) drowned.push(id);
  });
  return { moved: true, newCell, drowned };
}

function checkGameEnd(state) {
  const activeIds = state.participantIds.filter((id) => state.positions[id].status === "active");
  if (activeIds.length === 1) return { ...state, gameEnded: true, winnerIds: [activeIds[0]] };
  if (activeIds.length === 0) {
    const lastBatchSize = state.lastEliminationBatch || 1;
    const winnerIds = state.finishOrder.slice(-lastBatchSize);
    return { ...state, gameEnded: true, winnerIds: winnerIds.length ? winnerIds : state.participantIds };
  }
  const anyTilesLeft = state.deck.length > 0 || activeIds.some((id) => (state.hands[id] || []).length > 0);
  if (!anyTilesLeft) return { ...state, gameEnded: true, winnerIds: activeIds };
  return state;
}

export async function submitPlacement(gameId, round, playerId, handIndex, rotation) {
  return storageUpdate(gameId, key(round), (fresh) => {
    if (!fresh || fresh.gameEnded) return fresh;
    if (fresh.turnOrder[fresh.turnIndex] !== playerId) return fresh;
    if (fresh.positions[playerId]?.status !== "active") return fresh;
    const hand = fresh.hands[playerId] || [];
    if (handIndex < 0 || handIndex >= hand.length) return fresh;

    const placedCell = fresh.positions[playerId].cell;
    if (placedCell == null || fresh.tilesByCell[placedCell]) return fresh;

    const designIndex = hand[handIndex];
    const nextHands = { ...fresh.hands, [playerId]: hand.filter((_, i) => i !== handIndex) };
    const nextTilesByCell = { ...fresh.tilesByCell, [placedCell]: { designIndex, rotation: ((rotation % 4) + 4) % 4, ownerId: playerId } };

    const { positions: afterMovement, eliminatedIds } = resolveMovement(fresh.positions, nextTilesByCell, placedCell);

    let next = {
      ...fresh, positions: afterMovement, tilesByCell: nextTilesByCell, hands: nextHands,
      finishOrder: [...fresh.finishOrder, ...eliminatedIds],
      log: [...fresh.log, eliminatedIds.length > 0 ? `⚔️ A wake tile is laid — ${eliminatedIds.length} ship${eliminatedIds.length === 1 ? "" : "s"} lost.` : `A wake tile is laid.`],
    };

    // Charybdis rolls after the mover's own boat is done resolving —
    // her drowning victims are on top of, not instead of, any
    // collisions/edge-exits movement itself just caused.
    const charybdis = rollCharybdis(next);
    let extraEliminated = [];
    if (charybdis.moved) {
      extraEliminated = (charybdis.drowned || []).filter((id) => next.positions[id].status === "active");
      if (extraEliminated.length > 0) {
        const positions = { ...next.positions };
        extraEliminated.forEach((id) => { positions[id] = { cell: null, point: null, status: "eliminated" }; });
        next = { ...next, positions, finishOrder: [...next.finishOrder, ...extraEliminated] };
        next.log = [...next.log, `🌀 Charybdis lurches and drags ${extraEliminated.length} ship${extraEliminated.length === 1 ? "" : "s"} under!`];
      } else {
        next.log = [...next.log, `🌀 Charybdis stirs and shifts to a new stretch of sea.`];
      }
    }
    next.log = next.log.slice(-20);
    next.lastEliminationBatch = eliminatedIds.length + extraEliminated.length;

    [...eliminatedIds, ...extraEliminated].forEach((id) => recirculateEliminatedHand(next, id));
    if (next.positions[playerId]?.status === "active") refillHand(next, playerId);

    next = checkGameEnd(next);
    if (next.gameEnded) return next;

    const nextIdx = nextActiveIndex(next.turnOrder, next.positions, next.turnOrder.indexOf(playerId));
    if (nextIdx === -1) return checkGameEnd(next);
    return { ...next, turnIndex: nextIdx, turnStartedAt: Date.now() };
  });
}

// Same stall-safety shape as tickRiverStyx — see that file's own
// comment on why this is mostly a no-op safety net for a turn-based
// game, not a live-timer mechanic.
export async function tickWineDarkSea(gameId, round, settings, db) {
  const update = db?.update || storageUpdate;
  return update(gameId, key(round), (fresh) => {
    if (!fresh || fresh.gameEnded) return fresh;
    if (Date.now() - fresh.turnStartedAt < turnWindowMs(settings)) return fresh;
    const playerId = fresh.turnOrder[fresh.turnIndex];
    const hand = fresh.hands[playerId] || [];
    if (hand.length === 0) {
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
  const { positions: afterMovement, eliminatedIds } = resolveMovement(fresh.positions, nextTilesByCell, placedCell);
  let next = {
    ...fresh, positions: afterMovement, tilesByCell: nextTilesByCell, hands: nextHands,
    finishOrder: [...fresh.finishOrder, ...eliminatedIds],
    log: [...fresh.log, `⏱️ A ship's captain took too long — a wake tile was laid for them.`],
  };
  const charybdis = rollCharybdis(next);
  let extraEliminated = [];
  if (charybdis.moved) {
    extraEliminated = (charybdis.drowned || []).filter((id) => next.positions[id].status === "active");
    if (extraEliminated.length > 0) {
      const positions = { ...next.positions };
      extraEliminated.forEach((id) => { positions[id] = { cell: null, point: null, status: "eliminated" }; });
      next = { ...next, positions, finishOrder: [...next.finishOrder, ...extraEliminated] };
      next.log = [...next.log, `🌀 Charybdis drags ${extraEliminated.length} ship${extraEliminated.length === 1 ? "" : "s"} under!`];
    }
  }
  next.log = next.log.slice(-20);
  next.lastEliminationBatch = eliminatedIds.length + extraEliminated.length;
  [...eliminatedIds, ...extraEliminated].forEach((id) => recirculateEliminatedHand(next, id));
  if (next.positions[playerId]?.status === "active") refillHand(next, playerId);
  next = checkGameEnd(next);
  if (next.gameEnded) return next;
  const nextIdx = nextActiveIndex(next.turnOrder, next.positions, next.turnOrder.indexOf(playerId));
  if (nextIdx === -1) return checkGameEnd(next);
  return { ...next, turnIndex: nextIdx, turnStartedAt: Date.now() };
}

// Same placement-based shape as riverStyxData.js's own placementValue.
export function placementValue(state, playerId) {
  if (!state) return 0;
  const totalPlayers = state.participantIds.length;
  if (state.winnerIds?.includes(playerId)) return totalPlayers + 1;
  const fellAt = state.finishOrder.indexOf(playerId);
  if (fellAt === -1) return totalPlayers;
  return fellAt + 1;
}
