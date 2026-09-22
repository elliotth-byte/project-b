import { storageGet, storageSet, subscribeGameState } from "./gameStorage";

// ─── Traitors: Work-Day Window (stage 4) ───
// 8am Eastern to 6pm Pacific, Monday-Friday only — a long window (6pm
// Pacific IS 9pm Eastern, not the same clock-time as 8am Eastern in a
// single timezone) meant to span a full US business day across both
// coasts. Outside it, the whole game pauses — no murders, no mission
// access, no roundtable/traitor-selection access, timers effectively
// frozen since nothing can progress — except confessionals, which are
// deliberately never touched by this anywhere they're wired in,
// because confessionals are a private, personal reflection space, not
// a shared game mechanic other players are waiting on.
//
// Computed against a real IANA timezone (America/New_York), not a
// fixed UTC offset — this is what makes the window correctly account
// for Daylight Saving Time on its own, the same way any of the ET/PT
// clock times a host actually says out loud already do, without this
// needing to know or care which offset applies on a given date.
const TIMEZONE = "America/New_York";
const WINDOW_START_MINUTES = 8 * 60; // 8:00am ET
const WINDOW_END_MINUTES = 21 * 60; // 9:00pm ET (== 6:00pm PT)

function easternPartsFor(date) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE, weekday: "short", hour: "numeric", minute: "numeric", hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  // Intl can return "24" for midnight with hour12:false in some
  // environments instead of "00" — normalized here so downstream
  // minutesSinceMidnight math is never off by a full day for that one
  // hour. Doesn't actually change this feature's own correctness
  // either way (midnight is never inside an 8am-9pm window under
  // either representation), but worth not leaving as a landmine for
  // whatever next reads this file and assumes "hour" is always 0-23.
  let hour = parseInt(get("hour"), 10);
  if (hour === 24) hour = 0;
  return { weekday: get("weekday"), hour, minute: parseInt(get("minute"), 10) };
}

// Pure function, no I/O — takes any Date (defaults to now) and answers
// whether that moment falls inside the work-day window. Kept pure and
// exported on its own specifically so it's directly unit-testable
// without needing a database round-trip, given how easy timezone math
// is to get subtly wrong.
export function isWithinWorkDayWindow(date = new Date()) {
  const { weekday, hour, minute } = easternPartsFor(date);
  const isWeekday = !["Sat", "Sun"].includes(weekday);
  const minutesSinceMidnight = hour * 60 + minute;
  return isWeekday && minutesSinceMidnight >= WINDOW_START_MINUTES && minutesSinceMidnight < WINDOW_END_MINUTES;
}

// Human-readable "when does this reopen" for the paused banner — walks
// forward day by day (never more than a week, structurally can't loop
// forever) until it finds the next weekday, then describes 8am ET on
// that date. Deliberately a description, not a literal Date object a
// caller might be tempted to build a live countdown against — this is
// meant to orient a host or player glancing at a paused screen, not to
// drive a precise timer.
export function describeNextWindowOpen(date = new Date()) {
  const cursor = new Date(date);
  for (let i = 0; i < 8; i++) {
    cursor.setDate(cursor.getDate() + (i === 0 ? 0 : 1));
    const { weekday, hour, minute } = easternPartsFor(cursor);
    const minutesSinceMidnight = hour * 60 + minute;
    const isWeekday = !["Sat", "Sun"].includes(weekday);
    if (isWeekday && (i > 0 || minutesSinceMidnight < WINDOW_START_MINUTES)) {
      const dayLabel = i === 0 ? "today" : i === 1 ? "tomorrow" : cursor.toLocaleDateString("en-US", { weekday: "long", timeZone: TIMEZONE });
      return `Reopens ${dayLabel} at 8:00am ET`;
    }
  }
  return "Reopens next business day at 8:00am ET";
}

// ─── Per-season toggle ───
// Not every Traitors season wants this restriction — stored per game,
// defaulting to off, so this stage is purely additive: a season that
// never enables work-day mode behaves exactly as it did before this
// stage existed.
const KEY_WORK_DAY_MODE = "traitors:work-day-mode";

export async function isWorkDayModeEnabled(gameId) {
  const v = await storageGet(gameId, KEY_WORK_DAY_MODE);
  return !!v?.enabled;
}

export function subscribeWorkDayModeEnabled(gameId, onChange) {
  return subscribeGameState(gameId, KEY_WORK_DAY_MODE, (v) => onChange(!!v?.enabled));
}

export async function setWorkDayModeEnabled(gameId, enabled) {
  return storageSet(gameId, KEY_WORK_DAY_MODE, { enabled, updatedAt: Date.now() });
}
