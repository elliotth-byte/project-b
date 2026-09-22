import { storageSet, storageUpdate, subscribeGameState } from "../gameStorage";

// ─── Torched ───
// A shared/communal grid — everyone's marker lives on the SAME board,
// not separate boards per player like classic Battleship. Each player
// secretly places a 3-cell marker (one straight run, horizontal or
// vertical) somewhere on the grid without seeing where anyone else has
// placed. If a called cell lands on any part of a living opponent's
// marker, their WHOLE marker is destroyed and they're eliminated
// immediately (no partial damage, no "hit but still afloat" — one hit
// is fatal here). Last marker standing wins.
//
// Shooting is SIMULTANEOUS, in timed rounds — not turn-based. Every
// living player can submit one coordinate call per round, any time
// during that round's own window; a round resolves once either
// everyone still alive has submitted, or the round's timer runs out,
// whichever comes first (see resolveRound and roundEngine.js's
// autoResolveTorchedRound). A player who doesn't submit in time simply
// doesn't get a shot that round — no other penalty, and they're still
// fully in the next one. This replaced an earlier turn-based version
// (call one coordinate, pass to the next player, round-robin) — see
// git history/this file's own prior header comment for that version's
// reasoning if it's ever worth reviving; the switch to simultaneous
// rounds was a deliberate, requested redesign, not a bug fix.
//
// One real consequence of going simultaneous: MULTIPLE players can now
// be eliminated in the exact same round (two different shooters each
// happen to find a different living marker in the same round). That
// was never possible in the turn-based version, so placementValue now
// has to handle a genuine tie fairly — see its own comment for how.
//
// Placement is blind and simultaneous (same shared-CAS-update pattern as
// The Agora's blind offers — see pitData.js) — collisions are resolved
// by rejecting whichever placement attempt loses the race for a
// contested cell, letting that player re-pick. Placement itself still
// has no per-player deadline of its own beyond the overall battle
// timer — a player who never places simply isn't part of the shooting
// phase once it starts (see startShootingPhase), and is ranked at the
// bottom alongside anyone else who didn't participate.
//
// Every round's own window is scaled to the season's own configured
// challengeDurationSec, same reasoning lib/roundEngine.js's
// autoResolveTorchedRound documents (and Masquerade's own per-turn
// timeout already established the pattern for): an unbounded wait
// inside a now-bounded overall battle would just mean one inactive
// player could burn the whole battle's clock doing nothing.
//
// Scoring integrates with the standard pipeline the same way every
// other custom game here does — see placementValue.

const MARKER_LENGTH = 3;

export const torchedKey = (round) => `pb:torched:${round}`;
const key = torchedKey;

export function subscribeTorched(gameId, round, onChange) {
  return subscribeGameState(gameId, key(round), onChange);
}

// Grid grows with the player count so a full lobby doesn't make
// placement impossible near the end (each marker occupies 3 cells) —
// clamped to a sane playable range either way.
function gridSizeFor(playerCount) {
  const targetArea = playerCount * MARKER_LENGTH * 5; // markers occupy ~20% of the board at most
  const size = Math.ceil(Math.sqrt(targetArea));
  return Math.max(7, Math.min(12, size));
}

// Converts a player's saved fractional preset (see
// sql/add-torched-preset.sql for why it's stored this way) into an
// actual starting cell for THIS battle's specific grid size — always
// produces an in-bounds placement regardless of what grid size a
// preset was originally set against, by clamping the constrained
// dimension (whichever axis the marker's length actually occupies) to
// the valid range rather than just rounding blindly.
function presetToPlacement(preset, gridSize) {
  const maxRow = preset.orientation === "vertical" ? gridSize - MARKER_LENGTH : gridSize - 1;
  const maxCol = preset.orientation === "horizontal" ? gridSize - MARKER_LENGTH : gridSize - 1;
  const row = Math.max(0, Math.min(maxRow, Math.round(preset.rowFrac * (gridSize - 1))));
  const col = Math.max(0, Math.min(maxCol, Math.round(preset.colFrac * (gridSize - 1))));
  return { row, col, orientation: preset.orientation };
}

// presetsByPlayerId is optional — { playerId: { rowFrac, colFrac,
// orientation } } for whichever participants have saved one (see the
// Help tab). Applied in participant order: if two players' presets
// happen to collide on this specific grid size, the first one to be
// processed gets it and the other one is simply left for manual
// placement — no random reassignment, since silently moving someone
// to a spot they didn't actually choose would defeat the entire point
// of presetting.
// db: optional override (6th param, since presetsByPlayerId already
// occupies 5th) — see lib/games/plinkoBracketData.js's
// initPlinkoBracket for why.
export async function initTorched(gameId, round, participants, seed, presetsByPlayerId, db) {
  const set = db?.set || storageSet;
  if (participants.length < 2) return; // degenerate case, handled client-side
  const gridSize = gridSizeFor(participants.length);

  const markers = {};
  const placedIds = [];
  if (presetsByPlayerId) {
    for (const p of participants) {
      const preset = presetsByPlayerId[p.id];
      if (!preset || !preset.orientation) continue;
      const { row, col, orientation } = presetToPlacement(preset, gridSize);
      const cells = cellsForPlacement(row, col, orientation, MARKER_LENGTH);
      if (!isValidPlacement(gridSize, cells)) continue;
      const occupied = Object.values(markers).some((m) => cellsOverlap(m.cells, cells));
      if (occupied) continue;
      markers[p.id] = { cells, alive: true };
      placedIds.push(p.id);
    }
  }

  await set(gameId, key(round), {
    gridSize,
    markers, // playerId -> { cells: [[r,c],[r,c],[r,c]], alive: true } — pre-populated above from any saved presets
    placedIds,
    shooting: false, // flips true once startShootingPhase runs
    roundNum: 0,
    roundStartedAt: null,
    pendingShots: {}, // playerId -> [row, col] — THIS round's submitted calls, not yet resolved
    shotsLog: [], // [{ round, at: [r,c], hitPlayerId: string|null }] — every resolved call, public to everyone once resolved
    eliminatedInRound: {}, // playerId -> the roundNum they were eliminated in (see placementValue for why round number, not array position)
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
    if (!fresh || fresh.shooting) return fresh; // placement phase already closed
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
// it's time to start shooting. No turn order to set anymore — everyone
// who placed is simply eligible to submit a call every round from here
// on.
//
// db: optional override — see lib/games/plinkoBracketData.js's
// initPlinkoBracket for the full reasoning.
export async function startShootingPhase(gameId, round, seed, db) {
  const update = db?.update || storageUpdate;
  return update(gameId, key(round), (fresh) => {
    if (!fresh || fresh.shooting) return fresh; // already started
    if (fresh.placedIds.length < 2) return fresh; // need at least 2 markers on the board for this to mean anything
    return { ...fresh, shooting: true, roundNum: 1, roundStartedAt: Date.now(), pendingShots: {} };
  });
}

function aliveIds(markers) {
  return Object.entries(markers).filter(([, m]) => m.alive).map(([id]) => id);
}

// A living player submits their one call for the CURRENT round —
// stored, not immediately resolved, since every other living player
// gets to submit their own call for this same round independently and
// blindly (nobody sees anyone else's pick until the round actually
// resolves — see resolveRound). Rejected as a no-op if it's not
// shooting yet, the game's already decided, this player isn't alive,
// they've already submitted this round, or the cell was already called
// in some EARLIER round (still allowed to collide with another
// player's PENDING call this same round — see resolveRound for why
// that's fine and expected, not a bug).
export async function submitShotForRound(gameId, round, playerId, row, col) {
  return storageUpdate(gameId, key(round), (fresh) => {
    if (!fresh || !fresh.shooting || fresh.winnerId) return fresh;
    if (!fresh.markers[playerId]?.alive) return fresh;
    if (fresh.pendingShots[playerId]) return fresh; // already submitted this round
    if (fresh.shotsLog.some((s) => s.at[0] === row && s.at[1] === col)) return fresh; // already called in an earlier round
    return { ...fresh, pendingShots: { ...fresh.pendingShots, [playerId]: [row, col] } };
  });
}

// The actual round resolution — everyone's submitted (or unsubmitted)
// call for the round is processed against the SAME starting snapshot
// of who was alive when the round began, not sequentially one after
// another. That distinction matters: it's what makes "I fired at the
// same moment someone eliminated me" resolve fairly — a player's own
// submitted shot still counts even if they themselves also get hit in
// this same round, since every call in a round genuinely was made
// before anyone knew any of that round's outcomes.
//
// Multiple players calling the exact same cell in the same round is
// allowed and expected (they can't see each other's pending picks) —
// logged once, not once per shooter, since the shot log is about which
// CELLS have been called, not who gets individual credit for finding
// one (this game's own scoring never depended on that — see
// placementValue).
//
// settings is required (not optional) specifically so this can safely
// re-verify its own "is the round actually over yet" condition against
// FRESH data inside its own storageUpdate callback, the same defensive
// pattern used throughout lib/roundEngine.js's own timeout checks —
// this makes it safe to call from both the server poll
// (autoResolveTorchedRound) AND, if this ever gets a client-triggered
// "everyone's in, resolve now" affordance later, directly from a
// player's own client, without either caller needing to duplicate the
// actual resolution-readiness logic.
export async function resolveRound(gameId, round, settings, db) {
  const update = db?.update || storageUpdate;
  return update(gameId, key(round), (fresh) => {
    if (!fresh || !fresh.shooting || fresh.winnerId) return fresh;

    const alive = aliveIds(fresh.markers);
    const everyoneSubmitted = alive.length > 0 && alive.every((id) => !!fresh.pendingShots[id]);
    const totalSec = settings?.challengeDurationSec || 900;
    const perRoundSec = Math.max(TORCHED_MIN_ROUND_SEC, Math.min(TORCHED_MAX_ROUND_SEC, totalSec / TORCHED_TARGET_ROUNDS_ESTIMATE));
    const timedOut = fresh.roundStartedAt != null && Date.now() - fresh.roundStartedAt >= perRoundSec * 1000;
    if (!everyoneSubmitted && !timedOut) return fresh; // not ready to resolve yet

    const startingAliveSnapshot = new Set(alive); // who could legitimately still be hit THIS round
    const eliminatedThisRound = new Set();
    const newLogEntries = [];
    const loggedCellsThisRound = new Set();

    Object.entries(fresh.pendingShots).forEach(([shooterId, [row, col]]) => {
      const cellKey = `${row},${col}`;
      if (loggedCellsThisRound.has(cellKey)) return; // another simultaneous shooter already logged this exact cell
      loggedCellsThisRound.add(cellKey);

      let hitPlayerId = null;
      Object.entries(fresh.markers).forEach(([pid, m]) => {
        if (!startingAliveSnapshot.has(pid) || eliminatedThisRound.has(pid)) return; // already found dead this round by a different simultaneous shooter's different cell
        if (m.cells.some(([r, c]) => r === row && c === col)) hitPlayerId = pid;
      });
      if (hitPlayerId) eliminatedThisRound.add(hitPlayerId);
      newLogEntries.push({ round: fresh.roundNum, at: [row, col], hitPlayerId });
    });

    const nextMarkers = { ...fresh.markers };
    eliminatedThisRound.forEach((pid) => { nextMarkers[pid] = { ...nextMarkers[pid], alive: false }; });

    const nextEliminatedInRound = { ...fresh.eliminatedInRound };
    eliminatedThisRound.forEach((pid) => { nextEliminatedInRound[pid] = fresh.roundNum; });

    const survivors = aliveIds(nextMarkers);
    const winnerId = survivors.length === 1 ? survivors[0] : null;

    return {
      ...fresh,
      markers: nextMarkers,
      shotsLog: [...fresh.shotsLog, ...newLogEntries],
      eliminatedInRound: nextEliminatedInRound,
      winnerId,
      roundNum: winnerId ? fresh.roundNum : fresh.roundNum + 1,
      roundStartedAt: winnerId ? fresh.roundStartedAt : Date.now(),
      pendingShots: {},
    };
  });
}

// Exported so roundEngine.js's autoResolveTorchedRound doesn't need to
// re-derive the same formula independently — see resolveRound's own
// use of these same three constants for the full reasoning (same
// target-turns-into-a-window approach lib/games/scavengerHuntData.js's
// TARGET_ROUNDS already established, chosen so a 16-hour battle lands
// on roughly 30 minutes per round, the concrete example this was
// requested from).
export const TORCHED_TARGET_ROUNDS_ESTIMATE = 32;
export const TORCHED_MIN_ROUND_SEC = 30;
export const TORCHED_MAX_ROUND_SEC = 1800;

// The value reported via reportScore for this challenge — same tiered
// approach as every other custom game here (see pitData.js's matching
// comment): the winner occupies the top tier, everyone eliminated is
// ranked by SURVIVAL — a later elimination round is strictly better
// than an earlier one, since it means they outlasted more of the
// battle — and anyone who never placed a marker at all sits at the
// very bottom.
//
// Uses the ROUND NUMBER a player was eliminated in, not their position
// in an ordered list the way the old turn-based version did — that's
// the real, deliberate change simultaneous rounds require: two players
// eliminated in the very same round genuinely tied for how long they
// survived, and ranking one above the other with no real basis for
// which would have been dishonest. Same round number in
// eliminatedInRound now means the same score, on purpose.
//
// Still-alive players (the game ended some other way — the whole
// challenge's own timer ran out — before a natural winner emerged)
// score 1000 + the CURRENT round number, not a flat constant. That
// flat-constant version was a genuine, if previously harmless, latent
// bug: it scored lower than an elimination in a late enough round
// could reach, meaning a player who was STILL ALIVE and outlasting
// people could rank below someone who'd already been eliminated many
// rounds earlier. That could never actually surface while Torched had
// no overall time limit of its own (the game always ran to a real
// winner eventually), but stopped being safe the moment it got one.
// 1000 + roundNum works with no extra offset needed, provably: roundNum
// only ever advances AFTER a round fully resolves, so any past
// elimination's own round number is always strictly less than the
// CURRENT roundNum a still-alive player is being scored against — a
// still-alive player therefore always outranks every eliminated one,
// while multiple simultaneous survivors correctly tie with each other
// (same roundNum), and everyone stays below the true winner's fixed
// 100000.
export function placementValue(torched, playerId) {
  if (torched.winnerId === playerId) return 100000;
  const elimRound = torched.eliminatedInRound?.[playerId];
  if (elimRound != null) return 1000 + elimRound;
  if (torched.markers[playerId]?.alive) return 1000 + torched.roundNum;
  if (torched.markers[playerId]) return 500; // placed, marker status unclear (defensive fallback — shouldn't really be reachable now that alive is checked explicitly above)
  return 0; // never placed at all
}
