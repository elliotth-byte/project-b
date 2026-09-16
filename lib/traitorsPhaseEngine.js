import { storageGet, storageSet, storageUpdate, subscribeGameState } from "./gameStorage";
import { getPreEliminationStatus } from "./traitorsMasqueradeGate";

// ─── Traitors: Phase Engine (stage 3) ───
// The actual schedule-driven layer this whole build was requested for
// — see lib/traitorsSchedule.js's own header for why the schedule
// itself is a genuinely ordered list, not a fixed cycle. This is what
// turns that static list into something a season actually RUNS on:
// which day the season is currently on, and what that means is live
// right now.
//
// Honest about its own scope: this tracks and enforces WHICH day it
// is and surfaces what's scheduled for it (see TraitorsToday.jsx,
// which embeds the actual existing mission/Roundtable/Murder Vote/
// Traitor Selection components based on today's own events list,
// rather than requiring any of those components to be rebuilt). It
// does NOT yet include automatic, timer-driven advancement between
// days — advancing is host-triggered here ("Advance to Next Day"),
// the same deliberate choice this build is being staged around: full
// automatic advancement is tightly coupled to the work-day pause
// window (stage 4 — 8am ET to 6pm PT, Monday-Friday only), and trying
// to build automatic day-advancement before that window logic exists
// would mean building it twice. The OLD tab-based access (Roundtable,
// Missions, Challenges as always-open tabs) still exists underneath
// this and isn't removed by this stage — this is the new, intended way
// to run a scheduled season, not yet a hard lock against the old one.
export const KEY_CURRENT_DAY = "traitors:current-day";

export async function getCurrentDayIndex(gameId) {
  const v = await storageGet(gameId, KEY_CURRENT_DAY);
  return v?.dayIndex || 0; // 0 = the schedule hasn't started yet
}

export function subscribeCurrentDay(gameId, onChange) {
  return subscribeGameState(gameId, KEY_CURRENT_DAY, (v) => onChange(v?.dayIndex || 0));
}

// Gated on the Masquerade pre-elimination gate having actually been
// applied first (see lib/traitorsMasqueradeGate.js) — day 1 of the
// numbered schedule assumes that roster cut has already happened
// (day 1 is "Traitors Selected", which shouldn't be reachable with
// players still on the roster who were supposed to be eliminated in
// Week 0). Returns a reason string on rejection so the host UI can
// explain why, rather than the button just silently failing.
export async function startSchedule(gameId) {
  const status = await getPreEliminationStatus(gameId);
  if (!status?.applied) return { ok: false, reason: "masquerade-not-applied" };
  const existing = await getCurrentDayIndex(gameId);
  if (existing > 0) return { ok: false, reason: "already-started" };
  await storageSet(gameId, KEY_CURRENT_DAY, { dayIndex: 1, startedAt: Date.now() });
  return { ok: true };
}

export async function advanceToNextDay(gameId, maxDayIndex) {
  return storageUpdate(gameId, KEY_CURRENT_DAY, (fresh) => {
    const current = fresh?.dayIndex || 0;
    if (current === 0) return fresh; // hasn't started — use startSchedule instead
    if (maxDayIndex != null && current >= maxDayIndex) return fresh; // already on the last scheduled day
    return { ...fresh, dayIndex: current + 1, advancedAt: Date.now() };
  });
}

// A host-only override for correcting a mistaken advance, or skipping
// back to re-run something — always available, never gated the way
// startSchedule is, since a host adjusting an already-running
// schedule isn't the same situation as one trying to skip the
// pre-elimination gate entirely.
export async function jumpToDay(gameId, dayIndex) {
  return storageSet(gameId, KEY_CURRENT_DAY, { dayIndex, startedAt: Date.now() });
}
