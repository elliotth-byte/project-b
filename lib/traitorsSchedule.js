import { storageGet, storageSet, storageUpdate, subscribeGameState } from "./gameStorage";

// ─── Traitors: Schedule ───
// A reusable, host-editable day-by-day calendar — NOT a fixed repeating
// cycle. A real 4-week schedule for this format turned out to be
// genuinely irregular: some days are Mission + Roundtable, some are
// just a Murder, some are a Double Murder, Pandora's Box appears five
// times on no fixed interval, and one day ("Murder in Plain Sight") is
// deliberately tied to a real external event rather than a game
// mechanic at all. A rigid Murder→Mission→Roundtable rotation
// couldn't represent that, so this is a genuinely ordered LIST of day
// entries instead — add, edit, reorder, delete — with
// TEMPLATE_26_PLAYER below as a one-click starting point for the
// specific 26-player, 4-week plan this was built from, not the only
// schedule this can ever represent.
//
// Deliberately decoupled from real calendar dates — each entry is
// dayIndex (1, 2, 3...), a GAME day, not a specific October date. The
// actual calendar date a given dayIndex falls on is computed later by
// the work-day engine (see lib/traitorsWorkDayEngine.js) from the
// season's own configured start date, skipping weekends — that's what
// makes this schedule reusable for a season starting on any date, not
// just one that happens to start the same Monday this template did.
//
// Stored under the shared game_state table (same as
// lib/traitorsFinale.js's KEY_TRAITORS_FINALE, not the separate
// traitor_state table lib/traitorStorage.js defines) — that's the
// storage layer Traitors' OWN existing state actually uses day to day
// (see lib/wordGameData.js's own comment confirming its
// STORAGE_KEY_WORDS goes through the same shared game_state
// storageGet/storageSet Project B uses), so this stays consistent with
// where the rest of Traitors' real data already lives rather than
// introducing a second storage convention.
export const KEY_TRAITORS_SCHEDULE = "traitors:schedule";

// One entry per game day. `missionKey` maps to an existing mini-game's
// own STORAGE_KEY_* constant (see components/TraitorsAdminHost.jsx's
// own CHALLENGE_KEYS list for the full set that actually exists) when
// one genuinely exists for that slot; missionLabel is always the
// human-readable name shown to the host regardless, since two of this
// specific template's own missions ("Double Turret", "Eulogy Hangman")
// don't yet have a real implementation to map to — those are marked
// missionKey: null on purpose rather than guessed at or invented here,
// so a host running this schedule sees exactly which days still need a
// real mission substituted in, instead of the schedule silently
// pointing at the wrong game or a fabricated one.
//
// `events` is an ordered list of what actually happens that day —
// "mission" | "roundtable" | "murder" | "pandoras-box" |
// "traitor-selection" | "instant-murder" | "endgame" — read by the
// phase engine (stage 3 of this build) to decide what's actually live
// on a given day; `murderCount` distinguishes a normal murder day from
// a double-murder day without needing two separate event entries.
function day(dayIndex, label, { missionKey = null, missionLabel = null, events = [], murderCount = 0, pandorasBoxNumber = null, notes = "" } = {}) {
  return { dayIndex, label, missionKey, missionLabel, events, murderCount, pandorasBoxNumber, notes };
}

// The exact 20-day, 4-week plan this whole schedule system was built
// from — see the original 26-Player Game Schedule for the source this
// transcribes. Player-remaining-at-start-of-day counts from that
// original document are intentionally NOT stored here — this is a
// schedule of EVENTS, not a prediction of outcomes; how many players
// are actually left each day falls out of what really happens in a
// given season (murders, roundtable results), not a fixed number this
// template can promise in advance.
export const TEMPLATE_26_PLAYER = [
  day(1, "Traitors Selected (1 Black, 2 Red) + Instant Murder", {
    events: ["traitor-selection", "instant-murder"],
    murderCount: 1,
  }),
  day(2, "Hot Potato + Pandora's Box 1", {
    missionKey: "hotpotato", missionLabel: "Hot Potato",
    events: ["mission", "pandoras-box"], pandorasBoxNumber: 1,
  }),
  day(3, "Double Turret (Double Murder)", {
    events: ["murder"], murderCount: 2,
    notes: "\"Double Turret\" — the Traitors get two murders this day, not a mission.",
  }),
  day(4, "Icebreakers + Roundtable / Mission + Traitor Factions Compete for Recruit", {
    missionKey: "icebreaker", missionLabel: "Icebreakers",
    events: ["mission", "roundtable"],
    notes: "Traitor factions (Red/Black) compete for a recruit.",
  }),
  day(5, "Double Murder", { events: ["murder"], murderCount: 2 }),
  day(6, "Attack/Defend + Roundtable / Mission + Pandora's Box 2", {
    missionKey: "attackdefend", missionLabel: "Attack/Defend",
    events: ["mission", "roundtable", "pandoras-box"], pandorasBoxNumber: 2,
  }),
  day(7, "Murder", { events: ["murder"], murderCount: 1 }),
  day(8, "Word Scramble + Roundtable / Mission + Pandora's Box 3", {
    missionKey: "words", missionLabel: "Word Scramble",
    events: ["mission", "roundtable", "pandoras-box"], pandorasBoxNumber: 3,
  }),
  day(9, "Murder in Plain Sight", {
    events: ["murder"], murderCount: 1,
    notes: "Tied to a real external event (the October all-hands) — the murder itself happens during that event, not as a standalone game beat.",
  }),
  day(10, "Eulogy Hangman + Roundtable / Mission", {
    missionKey: "voodoo", missionLabel: "Eulogy Hangman",
    events: ["mission", "roundtable"],
  }),
  day(11, "Murder", { events: ["murder"], murderCount: 1 }),
  day(12, "Coffin Slide + Roundtable / Mission", {
    missionKey: "coffin", missionLabel: "Coffin Slide",
    events: ["mission", "roundtable"],
  }),
  day(13, "Murder + Pandora's Box 4", {
    events: ["murder", "pandoras-box"], murderCount: 1, pandorasBoxNumber: 4,
  }),
  day(14, "Casino + Roundtable / Mission", {
    missionKey: "casino", missionLabel: "Casino",
    events: ["mission", "roundtable"],
  }),
  day(15, "Murder", { events: ["murder"], murderCount: 1 }),
  day(16, "Zombies + Roundtable / Mission", {
    missionKey: "zombie", missionLabel: "Zombies",
    events: ["mission", "roundtable"],
  }),
  day(17, "Murder", { events: ["murder"], murderCount: 1 }),
  day(18, "Piggy Bank + Roundtable / Mission", {
    missionKey: "piggy", missionLabel: "Piggy Bank",
    events: ["mission", "roundtable"],
  }),
  day(19, "Murder + Pandora's Box 5", {
    events: ["murder", "pandoras-box"], murderCount: 1, pandorasBoxNumber: 5,
  }),
  day(20, "Roundtable / Endgame", { events: ["roundtable", "endgame"] }),
];

// The Week 0 pre-elimination mission — deliberately kept SEPARATE from
// TEMPLATE_26_PLAYER's own numbered game days, not day 0 of that list.
// This happens before Traitors are even selected (day 1's own
// "Traitors Selected" event assumes a roster that's already been
// through this cut), and it needs to support MORE than 26 players
// going in, unlike the numbered schedule which assumes a fixed 26 from
// day 1 onward. See lib/traitorsMasqueradeGate.js (stage 2 of this
// build) for the actual elimination logic this config feeds into.
export const MASQUERADE_PRE_ELIMINATION = {
  missionKey: "masquerade",
  missionLabel: "Masquerade",
  notes: "Anyone who loses this mission is eliminated before Traitors are selected. Supports more than 26 players entering.",
};

export async function getSchedule(gameId) {
  const v = await storageGet(gameId, KEY_TRAITORS_SCHEDULE);
  return v?.days || [];
}

export function subscribeSchedule(gameId, onChange) {
  return subscribeGameState(gameId, KEY_TRAITORS_SCHEDULE, (v) => onChange(v?.days || []));
}

// Replaces the whole schedule outright — used both by "load the
// 26-player template" and by a full manual edit (add/reorder/delete),
// since a reordered list can't be expressed as a small patch to what
// was there before anyway. dayIndex values are always renumbered
// sequentially here (1, 2, 3, ... in array order) regardless of
// whatever the caller passed in, so a host reordering or deleting days
// in the builder UI never has to manually renumber anything themselves
// — the array's own order IS the schedule's order.
export async function setSchedule(gameId, days) {
  const renumbered = days.map((d, i) => ({ ...d, dayIndex: i + 1 }));
  return storageSet(gameId, KEY_TRAITORS_SCHEDULE, { days: renumbered, updatedAt: Date.now() });
}

export async function loadTemplate26Player(gameId) {
  return setSchedule(gameId, TEMPLATE_26_PLAYER);
}

export async function clearSchedule(gameId) {
  return setSchedule(gameId, []);
}
