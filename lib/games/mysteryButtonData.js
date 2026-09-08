import { storageSet, storageUpdate, subscribeGameState } from "../gameStorage";

// ─── Mystery Button ───
// A single button. Nobody knows what pressing it does — that's the
// entire point — because the actual scenario is picked secretly at
// init, before anyone can act, and never surfaces in any player- or
// host-facing text (see lib/challenges/registry.js's blurb for this
// game: literally "[REDACTED]", by explicit request — the rules page
// itself must not give this away). Same trust model as every other
// secret-until-reveal mechanic in this app (see sql/schema.sql: any
// player in a game can already read this entire row) — the SCENARIO
// FIELD ITSELF is a UI-convention secret, not a technically enforced
// one; nothing here tries to hide it from a technically curious
// player inspecting network traffic, same as Chains/Masquerade/
// Pandora's Boxes never have.
//
// Two scenarios, chosen 50/50, both triggered by the exact same first
// press so there's no tell beforehand:
//   Scenario A — a straight race. First 3 distinct players to press
//   the (now-revealed-as-a-race) button finish 1st/2nd/3rd.
//   Scenario B — "Passing the Bug," modeled on the real Big Brother
//   Over the Top HOH competition of the same name: whoever presses
//   first is "infected" and must pass it to someone who's never been
//   infected; passing clears the passer (safe, but out of contention)
//   and infects the recipient, who must do the same. This repeats
//   until whoever's currently infected has nobody left to pass to —
//   THAT person wins. Ranked worst-to-best by clear order, exactly
//   the same "one elimination event ordering the whole field" shape
//   lib/games/musicalChairsData.js already uses.
//
// One reading worth stating plainly, since the real show's own
// description of this competition is genuinely a little
// self-contradictory (the last person tagged is called both
// "infected" AND "the final uninfected houseguest" who won): this
// build treats "infected" as "already had a turn, no longer eligible
// to win," and the winner as whoever ends up holding it with nobody
// left to pass to — a clean, well-defined rule, and the one that
// actually matches "Alex was tagged last... and won."

export const mysteryButtonKey = (round) => `pb:mysterybutton:${round}`;
const key = mysteryButtonKey;

export function subscribeMysteryButton(gameId, round, onChange) {
  return subscribeGameState(gameId, key(round), onChange);
}

const MIN_PARTICIPANTS = 2;

// Scenario B's forced-pass timeout — same dynamic-scaling reasoning as
// lib/games/floorData.js's computeActionTimeoutMs: this app's
// challenges range from a few live minutes to many async hours, so a
// flat timeout that's fine for one is unworkable for the other. Sized
// off the average time available per LIKELY pass (worst case,
// everyone gets infected once — n-1 passes for n participants, same
// invariant Musical Chairs' own rounds have).
const MIN_ACTION_MS = 15000;
const MAX_ACTION_MS = 15 * 60 * 1000;
const ACTION_FRACTION = 0.4;

function seededRandom(seed) {
  let s = seed || 1;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

export function computeActionTimeoutMs(challengeDurationSec, totalPasses) {
  if (totalPasses <= 0) return MIN_ACTION_MS;
  const totalMs = (challengeDurationSec || 300) * 1000;
  const avgMs = totalMs / totalPasses;
  return Math.round(Math.max(MIN_ACTION_MS, Math.min(MAX_ACTION_MS, avgMs * ACTION_FRACTION)));
}

// db: optional override — see lib/games/plinkoBracketData.js's
// initPlinkoBracket for why.
export async function initMysteryButton(gameId, round, participants, now, challengeDurationSec, db) {
  const set = db?.set || storageSet;
  if (participants.length < MIN_PARTICIPANTS) return; // degenerate case, handled client-side

  const participantIds = participants.map((p) => p.id);
  const rand = seededRandom(now);
  const scenario = rand() < 0.5 ? "A" : "B";
  const actionTimeoutMs = computeActionTimeoutMs(challengeDurationSec, Math.max(1, participantIds.length - 1));

  await set(gameId, key(round), {
    participantIds,
    scenario,
    phase: "waiting", // "waiting" | "active" | "revealed" — identical on-screen at "waiting" regardless of scenario, on purpose
    actionTimeoutMs,
    // Scenario A
    pressOrder: [],
    // Scenario B
    holderId: null,
    clearOrder: [],
    passDeadline: null,
    // Shared
    winnerId: null,
    results: null,
    timedOut: false,
  });
}

// storageUpdate resolves to dbAdapter.js's own actual return shape —
// { ok, value, aborted? } — never the raw next state directly.
async function updateState(gameId, k, updater) {
  const result = await storageUpdate(gameId, k, updater);
  return result?.value ?? null;
}

function targetsCount(fresh) {
  const require3 = Math.min(3, fresh.participantIds.length);
  return require3;
}

function resolveScenarioA(fresh) {
  const n = targetsCount(fresh);
  const winners = fresh.pressOrder.slice(0, n); // best..worst (1st, 2nd, 3rd)
  const results = {};
  fresh.participantIds.forEach((id) => { results[id] = { points: 0, placement: null }; });
  winners.forEach((id, i) => {
    results[id] = { points: n - i, placement: i + 1 };
  });
  return { ...fresh, phase: "revealed", winnerId: winners[0] || null, results };
}

function eligibleTargetsB(fresh, holderId) {
  return fresh.participantIds.filter((id) => id !== holderId && !fresh.clearOrder.includes(id));
}

function resolveScenarioBIfDone(fresh) {
  const eligible = eligibleTargetsB(fresh, fresh.holderId);
  if (eligible.length > 0) return fresh; // still more to pass to — not done
  const ranking = [...fresh.clearOrder, fresh.holderId]; // worst..best
  const results = {};
  ranking.forEach((id, i) => { results[id] = { points: i + 1, placement: ranking.length - i }; });
  return { ...fresh, phase: "revealed", winnerId: fresh.holderId, results };
}

// The single entry point for the FIRST press only — both scenarios
// react to it, which is exactly what makes it a mystery: the action a
// player takes is identical either way, only the game's own response
// differs.
export async function pressButton(gameId, round, playerId) {
  return updateState(gameId, key(round), (fresh) => {
    if (!fresh) return fresh;

    if (fresh.scenario === "A") {
      if (fresh.phase === "revealed") return fresh;
      if (fresh.pressOrder.includes(playerId)) return fresh;
      const nextPressOrder = [...fresh.pressOrder, playerId];
      const withPress = { ...fresh, phase: "active", pressOrder: nextPressOrder };
      if (nextPressOrder.length >= targetsCount(fresh)) return resolveScenarioA(withPress);
      return withPress;
    }

    // Scenario B: only the very FIRST press does anything — it's the
    // one that infects the initial holder. Every subsequent action
    // goes through submitPass below instead, not this function again.
    if (fresh.phase !== "waiting") return fresh;
    return { ...fresh, phase: "active", holderId: playerId, passDeadline: Date.now() + fresh.actionTimeoutMs };
  });
}

// Scenario B only — the current holder passing to a chosen, still-
// eligible (never-before-infected) target. Rejected outright (no-op)
// if it isn't actually this player's turn, the target isn't a valid
// choice, or the whole thing's already resolved — same silent-reject
// convention as every other multiplayer submission in this app.
export async function submitPass(gameId, round, holderId, targetId) {
  return updateState(gameId, key(round), (fresh) => {
    if (!fresh || fresh.scenario !== "B" || fresh.phase !== "active") return fresh;
    if (fresh.holderId !== holderId) return fresh;
    if (targetId === holderId || fresh.clearOrder.includes(targetId) || !fresh.participantIds.includes(targetId)) return fresh;

    const withPass = { ...fresh, clearOrder: [...fresh.clearOrder, holderId], holderId: targetId, passDeadline: Date.now() + fresh.actionTimeoutMs };
    return resolveScenarioBIfDone(withPass);
  });
}

// Scenario B's holder went quiet — auto-passes to a random eligible
// target so one inactive player can't stall the whole chain forever.
// Called on an interval by every player's own client AND, as a safety
// net for when nobody's tab happens to be active, by
// lib/roundEngine.js's poll (see musicalChairsData.js's identical
// reasoning for why both matter).
export async function autoPassIfDue(gameId, round) {
  return updateState(gameId, key(round), (fresh) => {
    if (!fresh || fresh.scenario !== "B" || fresh.phase !== "active" || !fresh.holderId) return fresh;
    if (Date.now() < fresh.passDeadline) return fresh;
    const eligible = eligibleTargetsB(fresh, fresh.holderId);
    if (eligible.length === 0) return resolveScenarioBIfDone(fresh); // shouldn't normally happen (would already have resolved), defensive
    const rand = seededRandom(fresh.passDeadline);
    const targetId = eligible[Math.floor(rand() * eligible.length)];
    const withPass = { ...fresh, clearOrder: [...fresh.clearOrder, fresh.holderId], holderId: targetId, passDeadline: Date.now() + fresh.actionTimeoutMs };
    return resolveScenarioBIfDone(withPass);
  });
}

// Challenge-level safety net (see lib/roundEngine.js's
// autoFinalizeMysteryButtonOnTimeout) — the season's configured
// challenge duration ran out before anything naturally resolved: for
// Scenario A, that means fewer than 3 people ever pressed at all; for
// Scenario B, an unlucky run of stalls outlasted even the per-pass
// timeout's own safety net. Same shape as
// lib/games/musicalChairsData.js's own finalizeOnTimeout: whoever's
// already secured a real placement keeps it, and anyone left
// unresolved (never pressed, at all, for either scenario) just gets
// nothing — there's no real signal to rank them by relative to each
// other, so 0 for everyone in that bucket is the honest answer, not
// an arbitrary tiebreak.
export function finalizeMysteryButtonOnTimeout(fresh) {
  if (!fresh || fresh.phase === "revealed") return fresh;

  if (fresh.scenario === "A") {
    const results = {};
    fresh.participantIds.forEach((id) => { results[id] = { points: 0, placement: null }; });
    fresh.pressOrder.forEach((id, i) => {
      results[id] = { points: fresh.pressOrder.length - i, placement: i + 1 };
    });
    return { ...fresh, phase: "revealed", timedOut: true, winnerId: fresh.pressOrder[0] || null, results };
  }

  // Scenario B: if it never even got past "waiting" (nobody pressed at
  // all), there's nothing to rank — everyone gets nothing. If it's
  // mid-chain, whoever's currently holding it and everyone already
  // cleared get ranked normally; the CURRENT holder just doesn't get
  // credit for "winning" (they didn't actually run out of targets —
  // time did), so they're folded into the ranking as if they were
  // "cleared" too, one better than whoever was cleared right before
  // them, since being currently infected when time ran out is still
  // better than having been cleared earlier.
  if (!fresh.holderId) {
    const results = {};
    fresh.participantIds.forEach((id) => { results[id] = { points: 0, placement: null }; });
    return { ...fresh, phase: "revealed", timedOut: true, winnerId: null, results };
  }
  const ranking = [...fresh.clearOrder, fresh.holderId];
  const results = {};
  ranking.forEach((id, i) => { results[id] = { points: i + 1, placement: ranking.length - i }; });
  return { ...fresh, phase: "revealed", timedOut: true, winnerId: null, results };
}

export function placementValue(state, playerId) {
  if (state.phase !== "revealed") return 0;
  return state.results?.[playerId]?.points || 0;
}
