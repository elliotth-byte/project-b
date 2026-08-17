import { storageSet, storageUpdate, subscribeGameState } from "../gameStorage";

// ─── Torched ───
// A shared/communal grid — everyone's marker lives on the SAME board,
// not separate boards per player like classic Battleship. Each player
// secretly places a 3-cell marker (one straight run, horizontal or
// vertical) somewhere on the grid without seeing where anyone else has
// placed. Once everyone's placed, turn order is set at random and play
// proceeds round-robin: on your turn, call one coordinate. If it lands
// on any part of a living opponent's marker, their WHOLE marker is
// destroyed and they're eliminated immediately (no partial damage, no
// "hit but still afloat" — one hit is fatal here). Last marker standing
// wins.
//
// Placement is blind and simultaneous (same shared-CAS-update pattern as
// The Agora's blind offers — see pitData.js) — collisions are resolved
// by rejecting whichever placement attempt loses the race for a
// contested cell, letting that player re-pick.
//
// No auto-skip for a turn nobody takes and no rescue for a player who
// never places at all — same accepted tradeoff Murder at the Masquerade
// already documents for turn-based games in this app: targeting waits
// indefinitely for the actual player to act, never decided on their
// behalf. A player who never places simply isn't part of the turn
// order once it's set, and is ranked at the bottom alongside anyone
// else who didn't participate.
//
// Scoring integrates with the standard pipeline the same way every
// other custom game here does — see placementValue.

const MARKER_LENGTH = 3;

const key = (round) => `pb:torched:${round}`;

export function subscribeTorched(gameId, round, onChange) {
  return subscribeGameState(gameId, key(round), onChange);
}

function seededRandom(seed) {
  let s = seed || 1;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

// Grid grows with the player count so a full lobby doesn't make
// placement impossible near the end (each marker occupies 3 cells) —
// clamped to a sane playable range either way.
function gridSizeFor(playerCount) {
  const targetArea = playerCount * MARKER_LENGTH * 5; // markers occupy ~20% of the board at most
  const size = Math.ceil(Math.sqrt(targetArea));
  return Math.max(7, Math.min(12, size));
}

export async function initTorched(gameId, round, participants, seed) {
  if (participants.length < 2) return; // degenerate case, handled client-side
  const gridSize = gridSizeFor(participants.length);
  await storageSet(gameId, key(round), {
    gridSize,
    markers: {}, // playerId -> { cells: [[r,c],[r,c],[r,c]], alive: true }
    placedIds: [],
    turnOrder: null, // set once everyone still eligible has placed
    currentTurnIndex: 0,
    shotsLog: [], // [{ by, at: [r,c], hitPlayerId: string|null, turnNum }]
    eliminationOrder: [], // playerId, in order eliminated — first out, first in this list
    winnerId: null,
    finalized: false,
  });
}

function cellsForPlacement(row, col, orientation, length) {
  const cells = [];
  for (let i = 0; i < length; i++) {
    cells.push(orientation === "horizontal" ? [row, col + i] : [row + i, col]);
  }
  return cells;
}

export function isValidPlacement(gridSize, cells) {
  return cells.every(([r, c]) => r >= 0 && r < gridSize && c >= 0 && c < gridSize);
}

function cellsOverlap(a, b) {
  return a.some(([r1, c1]) => b.some(([r2, c2]) => r1 === r2 && c1 === c2));
}

// Places a player's marker — rejected (no-op, caller sees no state
// change) if it's out of bounds, already occupied by another player's
// locked-in marker, or this player already placed. The race-safety here
// mirrors The Agora's blind-offer matching: two players attempting
// overlapping cells "simultaneously" resolve based on whichever
// storageUpdate CAS actually lands first — the loser sees their
// placement silently rejected and can just try again with a different
// spot.
export async function placeMarker(gameId, round, playerId, row, col, orientation) {
  return storageUpdate(gameId, key(round), (fresh) => {
    if (!fresh || fresh.turnOrder) return fresh; // placement phase already closed
    if (fresh.markers[playerId]) return fresh; // already placed
    const cells = cellsForPlacement(row, col, orientation, MARKER_LENGTH);
    if (!isValidPlacement(fresh.gridSize, cells)) return fresh;
    const occupied = Object.values(fresh.markers).some((m) => cellsOverlap(m.cells, cells));
    if (occupied) return fresh;
    return {
      ...fresh,
      markers: { ...fresh.markers, [playerId]: { cells, alive: true } },
      placedIds: [...fresh.placedIds, playerId],
    };
  });
}

// Called once the host (or any client — same "anyone can nudge shared
// state forward" pattern used elsewhere) decides placement's done and
// it's time to start shooting. Locks in turn order at random from
// whoever actually placed; anyone who didn't simply isn't included.
export async function startShootingPhase(gameId, round, seed) {
  return storageUpdate(gameId, key(round), (fresh) => {
    if (!fresh || fresh.turnOrder) return fresh; // already started
    if (fresh.placedIds.length < 2) return fresh; // need at least 2 markers on the board for this to mean anything
    const rand = seededRandom(seed || Date.now());
    const order = [...fresh.placedIds].sort(() => rand() - 0.5);
    return { ...fresh, turnOrder: order, currentTurnIndex: 0 };
  });
}

function nextAliveTurnIndex(torched, fromIndex) {
  const { turnOrder, markers } = torched;
  for (let step = 1; step <= turnOrder.length; step++) {
    const idx = (fromIndex + step) % turnOrder.length;
    if (markers[turnOrder[idx]]?.alive) return idx;
  }
  return fromIndex; // shouldn't happen — means everyone's eliminated
}

function aliveCount(markers) {
  return Object.values(markers).filter((m) => m.alive).length;
}

// The active player calls one coordinate. A hit destroys that whole
// marker and eliminates its owner immediately; a miss just passes the
// turn. Rejected as a no-op if it's not this player's turn, the cell's
// already been called, or the game's already decided.
export async function fireShot(gameId, round, playerId, row, col) {
  return storageUpdate(gameId, key(round), (fresh) => {
    if (!fresh || !fresh.turnOrder || fresh.winnerId) return fresh;
    const activeId = fresh.turnOrder[fresh.currentTurnIndex];
    if (activeId !== playerId) return fresh;
    if (!fresh.markers[playerId]?.alive) return fresh; // eliminated players can't act
    if (fresh.shotsLog.some((s) => s.at[0] === row && s.at[1] === col)) return fresh; // already called

    let hitPlayerId = null;
    const nextMarkers = { ...fresh.markers };
    Object.entries(fresh.markers).forEach(([pid, m]) => {
      if (pid === playerId || !m.alive) return;
      if (m.cells.some(([r, c]) => r === row && c === col)) {
        hitPlayerId = pid;
        nextMarkers[pid] = { ...m, alive: false };
      }
    });

    const turnNum = fresh.shotsLog.length + 1;
    const nextShotsLog = [...fresh.shotsLog, { by: playerId, at: [row, col], hitPlayerId, turnNum }];
    const nextElimination = hitPlayerId ? [...fresh.eliminationOrder, hitPlayerId] : fresh.eliminationOrder;

    const survivors = aliveCount(nextMarkers);
    const winnerId = survivors === 1 ? Object.entries(nextMarkers).find(([, m]) => m.alive)?.[0] || null : null;

    return {
      ...fresh,
      markers: nextMarkers,
      shotsLog: nextShotsLog,
      eliminationOrder: nextElimination,
      winnerId,
      currentTurnIndex: winnerId ? fresh.currentTurnIndex : nextAliveTurnIndex({ ...fresh, markers: nextMarkers }, fresh.currentTurnIndex),
    };
  });
}

// The value reported via reportScore for this challenge — same tiered
// approach as every other custom game here (see pitData.js's matching
// comment): the winner occupies the top tier, everyone eliminated is
// ranked by SURVIVAL — later elimination is strictly better than
// earlier, since it means they outlasted more opponents — and anyone
// who never placed a marker at all sits at the very bottom.
export function placementValue(torched, playerId) {
  if (torched.winnerId === playerId) return 100000;
  const elimIdx = torched.eliminationOrder.indexOf(playerId);
  if (elimIdx !== -1) {
    // Later elimination (bigger index) = better = higher value.
    return 1000 + elimIdx;
  }
  if (torched.markers[playerId]) return 500; // placed but the game ended before they were ever eliminated or won (shouldn't really happen once shooting starts, but handled honestly)
  return 0; // never placed at all
}
