import { storageSet, storageUpdate, subscribeGameState } from "../gameStorage";
import { distributeRelicIds, shuffleWithRand, countCorrect } from "./triggerHappyData";

// ─── Trigger Happy — Big Screen ───
// Duel format: two players face off at a time on a shared grid shown
// on the TV, everyone else spectates. This is a genuinely open-ended,
// live-scored battle governed by the outer challenge timer — same
// shape as lib/games/wagerTriviaTvData.js (see its own header
// comment), NOT Golden Fleece's own "resolve early, then lock" shape —
// duels just keep happening back-to-back, live win counts keep
// reporting, until the round's own timer ends it for everyone. There's
// no separate "game over" state of its own, so this never calls
// autoLockResolvedScores (see lib/roundEngine.js) — nothing to lock
// early.
export const GRID_ROWS_TV = 3;
export const GRID_COLS_TV = 5;
export const TOTAL_CELLS_TV = GRID_ROWS_TV * GRID_COLS_TV; // 15 — 3 of each of the 5 relics

// Simpler than Golden Fleece's own target-turns-into-a-window formula
// (see lib/games/goldenFleeceData.js's decisionWindowMs) — there's no
// fixed number of duels to divide a battle's length across here, so a
// flat cap is all this needs.
const LEVER_TIMEOUT_MS = 40000; // cap on the blank_replicating phase before a non-responding duelist is defaulted to a loss
const REVEAL_PAUSE_MS = 7000; // how long the comparison sits on screen before moving to picking_next
const PICK_TIMEOUT_MS = 25000; // how long the winner gets to pick the next pair before it's auto-picked

export const triggerHappyTvKey = (round) => `pb:triggerhappytv:${round}`;

export function subscribeTriggerHappyTv(gameId, round, onChange) {
  return subscribeGameState(gameId, triggerHappyTvKey(round), onChange);
}

function shuffledArr(arr) {
  return shuffleWithRand(arr, Math.random);
}

// A fresh 15-cell layout for a new duel — plain Math.random, not the
// seeded stream lib/games/triggerHappyData.js's own generateLayout
// uses. There's no fairness need for independent derivation here (this
// IS the single shared, server-authoritative value everyone reads),
// same reasoning as lib/games/goldenFleeceData.js's own buildDeck.
function buildTvLayout() {
  return shuffledArr(distributeRelicIds(TOTAL_CELLS_TV));
}

// Picks 2 duelists from `participantIds`, excluding `excludeId` (the
// just-won player) UNLESS fewer than 2 OTHER alive players exist, in
// which case they're included anyway — the fallback this file's
// callers below rely on so the room never stalls just because a
// 2-player battle only ever has one possible "other" pair.
function pickPair(participantIds, excludeId) {
  const others = excludeId ? participantIds.filter((id) => id !== excludeId) : participantIds;
  const pool = others.length >= 2 ? others : participantIds;
  const shuffled = shuffledArr(pool);
  return [shuffled[0], shuffled[1]];
}

export async function initTriggerHappyTv(gameId, round, participants, now, db) {
  const set = db?.set || storageSet;
  const participantIds = participants.map((p) => p.id);
  const wins = Object.fromEntries(participantIds.map((id) => [id, 0]));
  await set(gameId, triggerHappyTvKey(round), {
    participantIds,
    currentPair: pickPair(participantIds, null),
    layout: buildTvLayout(),
    phase: "memorize", // "memorize" | "blank_replicating" | "revealed" | "picking_next"
    leverPulledAt: null,
    leverPulledBy: null,
    submissions: {}, // playerId -> { grid, accuracy, replicationMs, submittedAt }
    wins,
    pendingPickerId: null,
    lastResult: null, // set on resolveDuel: { aId, bId, winnerId, loserId, tie, aAccuracy, bAccuracy, aMs, bMs }
    log: [],
    phaseStartedAt: now || Date.now(),
  });
}

// Either duelist pulls the lever — only valid for one of currentPair,
// during "memorize". Blanks the grid for everyone and starts both
// duelists' own replication clock from this exact moment.
export async function submitLeverPull(gameId, round, playerId) {
  return storageUpdate(gameId, triggerHappyTvKey(round), (fresh) => {
    if (!fresh || fresh.phase !== "memorize") return fresh;
    if (!fresh.currentPair.includes(playerId)) return fresh;
    return { ...fresh, phase: "blank_replicating", leverPulledAt: Date.now(), leverPulledBy: playerId };
  });
}

// Pure resolution of a fully-submitted duel (both currentPair entries
// present in submissions) — winner = higher accuracy; tie on accuracy
// -> lower replicationMs wins; tie on BOTH (only realistically reached
// via the timeout defaulting below, where both duelists get identical
// defaulted values) -> the FIRST id in currentPair wins, arbitrarily
// but consistently, exactly as this file's own header/task notes call
// for.
function resolveDuel(state) {
  const [aId, bId] = state.currentPair;
  const a = state.submissions[aId];
  const b = state.submissions[bId];
  let winnerId;
  let tie = false;
  if (a.accuracy !== b.accuracy) {
    winnerId = a.accuracy > b.accuracy ? aId : bId;
  } else if (a.replicationMs !== b.replicationMs) {
    winnerId = a.replicationMs < b.replicationMs ? aId : bId;
  } else {
    winnerId = aId;
    tie = true;
  }
  const loserId = winnerId === aId ? bId : aId;
  const lastResult = {
    aId, bId, winnerId, loserId, tie,
    aAccuracy: a.accuracy, bAccuracy: b.accuracy, aMs: a.replicationMs, bMs: b.replicationMs,
  };
  return {
    ...state,
    phase: "revealed",
    phaseStartedAt: Date.now(),
    wins: { ...state.wins, [winnerId]: (state.wins[winnerId] || 0) + 1 },
    lastResult,
    log: [...state.log, { ...lastResult, at: Date.now() }],
  };
}

// A duelist submits their replicated grid — CAS, ignored (silent
// no-op) if they're not currently one of currentPair, the phase has
// moved on, or they've already submitted once (no double submit).
// Fast-path resolves the instant BOTH duelists are in, same
// last-mover-resolves-inline optimization as
// lib/games/goldenFleeceData.js's own submitChoice.
export async function submitDuelAnswer(gameId, round, playerId, grid) {
  return storageUpdate(gameId, triggerHappyTvKey(round), (fresh) => {
    if (!fresh || fresh.phase !== "blank_replicating") return fresh;
    if (!fresh.currentPair.includes(playerId)) return fresh;
    if (fresh.submissions[playerId]) return fresh;
    const accuracy = countCorrect(fresh.layout, grid);
    const replicationMs = Math.max(0, Date.now() - (fresh.leverPulledAt || Date.now()));
    const submissions = { ...fresh.submissions, [playerId]: { grid, accuracy, replicationMs, submittedAt: Date.now() } };
    const next = { ...fresh, submissions };
    const bothIn = fresh.currentPair.every((id) => !!submissions[id]);
    return bothIn ? resolveDuel(next) : next;
  });
}

// The winner (and only the winner, only during "picking_next") starts
// the next duel by choosing exactly 2 alive participants — mirrors
// lib/games/eyesInTheSystemTvData.js's own chooseNextMatch shape.
export async function submitNextPair(gameId, round, winnerId, pickedIds) {
  return storageUpdate(gameId, triggerHappyTvKey(round), (fresh) => {
    if (!fresh || fresh.phase !== "picking_next") return fresh;
    if (fresh.pendingPickerId !== winnerId) return fresh;
    if (!Array.isArray(pickedIds) || pickedIds.length !== 2) return fresh;
    const [p1, p2] = pickedIds;
    if (p1 === p2) return fresh;
    const validIds = new Set(fresh.participantIds);
    if (!validIds.has(p1) || !validIds.has(p2)) return fresh;
    return {
      ...fresh,
      currentPair: [p1, p2],
      layout: buildTvLayout(),
      phase: "memorize",
      leverPulledAt: null,
      leverPulledBy: null,
      submissions: {},
      pendingPickerId: null,
      phaseStartedAt: Date.now(),
    };
  });
}

// The authoritative tick — called redundantly from the TV's own poll,
// both duelists' phones, and lib/roundEngine.js's server housekeeping
// pass, exactly the same three-way belt-and-suspenders redundancy as
// Golden Fleece's tickGoldenFleece. Handles every timeout this game
// has: a non-responding duelist during replication, the reveal's own
// short pause, and an AFK winner during picking_next.
export async function tickTriggerHappyTv(gameId, round, settings, db) {
  const update = db?.update || storageUpdate;
  const now = Date.now();
  return update(gameId, triggerHappyTvKey(round), (fresh) => {
    if (!fresh) return fresh;

    if (fresh.phase === "blank_replicating") {
      const timedOut = now - (fresh.leverPulledAt || now) >= LEVER_TIMEOUT_MS;
      if (!timedOut) return fresh;
      const submissions = { ...fresh.submissions };
      let changed = false;
      fresh.currentPair.forEach((id) => {
        if (!submissions[id]) {
          // Defaulted to a guaranteed loss — 0 correct, a replicationMs
          // far past anything a real submission could produce. If BOTH
          // duelists time out, they end up with identical defaulted
          // values and resolveDuel's own tie rule (first of currentPair)
          // decides it, exactly as this file's own header notes.
          submissions[id] = { grid: [], accuracy: 0, replicationMs: 9999999, submittedAt: now };
          changed = true;
        }
      });
      if (!changed) return fresh; // both already in somehow — let the normal submit path's own fast-resolve handle it
      return resolveDuel({ ...fresh, submissions });
    }

    if (fresh.phase === "revealed") {
      if (now - fresh.phaseStartedAt < REVEAL_PAUSE_MS) return fresh;
      return { ...fresh, phase: "picking_next", phaseStartedAt: now, pendingPickerId: fresh.lastResult?.winnerId ?? fresh.currentPair[0] };
    }

    if (fresh.phase === "picking_next") {
      const timedOut = now - fresh.phaseStartedAt >= PICK_TIMEOUT_MS;
      if (!timedOut) return fresh;
      const pair = pickPair(fresh.participantIds, fresh.pendingPickerId);
      return {
        ...fresh,
        currentPair: pair,
        layout: buildTvLayout(),
        phase: "memorize",
        leverPulledAt: null,
        leverPulledBy: null,
        submissions: {},
        pendingPickerId: null,
        phaseStartedAt: now,
      };
    }

    return fresh;
  });
}

// Live cumulative duel-win count — this game's whole score, reported
// with final:false throughout (see components/games/
// TriggerHappyTvPlayer.jsx) since there's no separate end state of its
// own; the outer challenge timer running out is what actually ends it.
export function placementValue(state, playerId) {
  return state.wins?.[playerId] || 0;
}
