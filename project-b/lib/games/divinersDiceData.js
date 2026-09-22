import { storageSet, storageUpdate, subscribeGameState } from "../gameStorage";

// ─── The Diviner's Dice — Big Screen ───
// A Greek-mythology reskin of Qwixx (boardgamegeek.com/boardgame/63268),
// same credit-the-source approach this app already takes with Spyfall
// and The Golden Fleece — faithful to the real rules (verified against
// https://officialgamerules.org/game-rules/qwixx/ and
// https://www.geekyhobbies.com/qwixx-dice-game-review-and-rules/, the
// same source the design brief itself already cited), just reskinned:
// four omen-tracks, one per god, instead of four plain colors. Unlike
// the physical game (which caps out around 2-5 players because there's
// only one physical scoresheet each and one shared set of dice to pass
// around), this digital version has no such constraint — the shared
// dice roll is broadcast to everyone's phone at once, so any number of
// alive participants can play the exact same turn simultaneously.
//
// ─── Rules, exactly as verified ───
// Four rows (red/Ares, yellow/Apollo ascend 2→12 left to right; green/
// Demeter, blue/Poseidon descend 12→2 left to right), 11 numbers each.
// 2 white dice + 1 die per still-in-play color, 6 total at the start.
// On the active player's turn: they roll all live dice. EVERY player
// (including the active one) may then mark the SUM OF THE TWO WHITE
// DICE in any one of their own rows, in that row's direction, or pass.
// ONLY the active player gets one more optional mark: one white die +
// one colored die, marked in the row matching that die's color. A mark
// must always sit strictly to the right of (never left of/equal to)
// anything already marked in that row — once skipped, a number is gone
// for good. The rightmost number in a row can only be marked once at
// least 5 numbers earlier in that row are already marked; marking it
// simultaneously "locks" that row (for that player) and removes that
// color's die from the shared pool for EVERYONE, permanently. If the
// active player marks nothing at all — neither the shared white-sum
// mark nor their own bonus — they take a 5-point penalty. The game
// ends the instant a single player reaches 4 penalties, or as soon as
// two different colors have been locked (by anyone, cumulatively).
// A locked (or otherwise cooling-off) player keeps taking their turn
// in the shared white-sum mark for the rest of the game — locking is
// per-row, never a per-player elimination.
//
// Verified scoring table (officialgamerules.org, matching the widely
// cited official Qwixx table): marks-in-a-row → points below. The
// table runs 0-12 because a locked row's rightmost cell counts as one
// extra mark on top of its 11 numbers.
export const SCORE_TABLE = [0, 1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 66, 78];

// Light thematic tie-in per the task brief — a clean, legible board
// matters far more than deep lore for a game this rules-dense, so this
// is as far as the theming goes: four gods, four omen-colors.
export const ROW_COLORS = [
  { id: "red", label: "Ares", icon: "⚔️", hex: "#ff3860", direction: "asc" },
  { id: "yellow", label: "Apollo", icon: "☀️", hex: "#ffd700", direction: "asc" },
  { id: "green", label: "Demeter", icon: "🌾", hex: "#00ff9d", direction: "desc" },
  { id: "blue", label: "Poseidon", icon: "🌊", hex: "#4fc3f7", direction: "desc" },
];
export const COLOR_IDS = ROW_COLORS.map((c) => c.id);

// The board-order sequence of values for each row, left to right —
// exactly what's rendered, and what index arithmetic below is done
// against. Ascending rows: 2..12. Descending rows: 12..2.
export const ROW_SEQUENCE = Object.fromEntries(
  ROW_COLORS.map(({ id, direction }) => [
    id,
    direction === "asc" ? Array.from({ length: 11 }, (_, i) => i + 2) : Array.from({ length: 11 }, (_, i) => 12 - i),
  ])
);

export const divinersDiceKey = (round) => `pb:divinersdice:${round}`;
const key = divinersDiceKey;

export function subscribeDivinersDice(gameId, round, onChange) {
  return subscribeGameState(gameId, key(round), onChange);
}

function roll6() {
  return 1 + Math.floor(Math.random() * 6);
}

function freshSheet() {
  const sheet = { penalties: 0 };
  ROW_COLORS.forEach(({ id }) => { sheet[id] = { marks: Array(11).fill(false) }; });
  return sheet;
}

export async function initDivinersDice(gameId, round, participants, now, db) {
  const set = db?.set || storageSet;
  const participantIds = participants.map((p) => p.id);
  const turnOrder = [...participantIds];
  await set(gameId, key(round), {
    participantIds,
    turnOrder,
    turnIndex: 0,
    activePlayerId: turnOrder[0] || null,
    sheets: Object.fromEntries(participantIds.map((id) => [id, freshSheet()])),
    lockedColors: [],
    dice: null,
    phase: turnOrder.length > 0 ? "awaiting-roll" : "ended",
    turnStartedAt: now,
    pendingWhite: {},
    coloredResolved: false,
    turnEvents: [],
    log: [{ ts: now, kind: "start" }],
    gameEnded: turnOrder.length === 0,
    endReason: turnOrder.length === 0 ? "noPlayers" : null,
  });
}

// How long the active player has to actually tap "Roll Dice" before
// the housekeeping tick rolls on their behalf — short, since it's a
// single tap with nothing to weigh.
export function rollWindowMs(settings) {
  const totalSec = settings?.challengeDurationSec || 900;
  const per = Math.max(8, Math.min(25, totalSec / 45));
  return per * 1000;
}

// How long everyone (all live players, every single roll — see this
// file's header) has to respond with their white-sum mark, and the
// active player their extra colored one, before the tick force-passes
// whoever hasn't answered and resolves the turn. Same
// settings-scaled-window shape as lib/games/goldenFleeceData.js's own
// decisionWindowMs.
export function decisionWindowMs(settings) {
  const totalSec = settings?.challengeDurationSec || 900;
  const per = Math.max(12, Math.min(40, totalSec / 30));
  return per * 1000;
}

// Pure validity check, safe to call from a client for instant
// grey-out feedback AND from the real server-side submit functions
// below (which are the actual source of truth — see this file's own
// header note on why the client never gets to silently bypass this).
export function isValidMark(state, playerId, color, number) {
  if (!state || !color || number == null) return false;
  if (state.lockedColors?.includes(color)) return false;
  const seq = ROW_SEQUENCE[color];
  if (!seq) return false;
  const idx = seq.indexOf(number);
  if (idx === -1) return false;
  const sheet = state.sheets?.[playerId]?.[color];
  if (!sheet) return false;
  const marks = sheet.marks;
  if (marks[idx]) return false;
  const maxMarked = marks.reduce((max, v, i) => (v ? i : max), -1);
  if (idx <= maxMarked) return false;
  if (idx === seq.length - 1) {
    const priorCount = marks.filter(Boolean).length;
    if (priorCount < 5) return false;
  }
  return true;
}

// Applies an already-validated mark. Returns a new state — locking
// (and removing the die from the shared pool for good) happens right
// here, the instant the rightmost cell is legally marked, not deferred
// to end-of-turn, matching the real rule that the game can end
// mid-turn the moment a second color locks.
function applyMark(state, playerId, color, number) {
  const seq = ROW_SEQUENCE[color];
  const idx = seq.indexOf(number);
  const prevSheet = state.sheets[playerId][color];
  const marks = [...prevSheet.marks];
  marks[idx] = true;
  const sheets = { ...state.sheets, [playerId]: { ...state.sheets[playerId], [color]: { marks } } };
  const justLocked = idx === seq.length - 1;
  const lockedColors = justLocked && !state.lockedColors.includes(color) ? [...state.lockedColors, color] : state.lockedColors;
  return { ...state, sheets, lockedColors, justLocked };
}

function currentWhiteSum(state) {
  const white = state.dice?.white;
  if (!white) return null;
  return white[0] + white[1];
}

function allResponded(state) {
  const whiteDone = state.turnOrder.every((id) => state.pendingWhite[id] !== undefined);
  return whiteDone && state.coloredResolved === true;
}

function endIfTwoColorsLocked(state) {
  if (state.lockedColors.length >= 2) {
    return { ...state, gameEnded: true, endReason: "colorsLocked", phase: "ended" };
  }
  return state;
}

// Every player (including the active one) submits at most one
// response per decision window: `color` + `number` to mark the shared
// white-sum in one of their own rows, or a falsy `color` to pass.
// Silently rejected (a no-op, same convention as every other blind-
// submit game in this app) on anything invalid — wrong phase, already
// responded, or a mark that doesn't actually check out.
export async function submitWhiteMark(gameId, round, playerId, color, number) {
  return storageUpdate(gameId, key(round), (fresh) => {
    if (!fresh || fresh.gameEnded) return fresh;
    if (fresh.phase !== "deciding") return fresh;
    if (!fresh.turnOrder.includes(playerId)) return fresh;
    if (fresh.pendingWhite[playerId] !== undefined) return fresh;

    let next = fresh;
    if (color) {
      const sum = currentWhiteSum(fresh);
      if (sum == null || number !== sum) return fresh;
      if (!isValidMark(fresh, playerId, color, number)) return fresh;
      next = applyMark(fresh, playerId, color, number);
      const log = [...fresh.log, { ts: Date.now(), kind: "white-mark", playerId, color, number }];
      if (next.justLocked) log.push({ ts: Date.now(), kind: "lock", playerId, color });
      next = { ...next, log: log.slice(-40) };
    } else {
      next = { ...fresh, log: [...fresh.log, { ts: Date.now(), kind: "white-pass", playerId }].slice(-40) };
    }
    next = { ...next, pendingWhite: { ...next.pendingWhite, [playerId]: true } };
    next = endIfTwoColorsLocked(next);
    if (next.gameEnded) return next;
    return allResponded(next) ? resolveTurn(next) : next;
  });
}

// Only the active player may call this, and only once per turn — their
// exclusive bonus mark, combining ONE white die (whichever face value
// they choose, since both are visible on the shared roll) with ONE
// still-live colored die, marked in the matching row. A falsy `color`
// passes on the bonus without marking.
export async function submitColoredMark(gameId, round, playerId, whiteDieValue, color, number) {
  return storageUpdate(gameId, key(round), (fresh) => {
    if (!fresh || fresh.gameEnded) return fresh;
    if (fresh.phase !== "deciding") return fresh;
    if (fresh.activePlayerId !== playerId) return fresh;
    if (fresh.coloredResolved) return fresh;

    let next = fresh;
    if (color) {
      if (fresh.lockedColors.includes(color)) return fresh;
      const dieVal = fresh.dice?.[color];
      if (dieVal == null) return fresh;
      const whites = fresh.dice?.white || [];
      if (!whites.includes(whiteDieValue)) return fresh;
      if (number !== whiteDieValue + dieVal) return fresh;
      if (!isValidMark(fresh, playerId, color, number)) return fresh;
      next = applyMark(fresh, playerId, color, number);
      const log = [...fresh.log, { ts: Date.now(), kind: "colored-mark", playerId, color, number }];
      if (next.justLocked) log.push({ ts: Date.now(), kind: "lock", playerId, color });
      next = { ...next, log: log.slice(-40) };
    } else {
      next = { ...fresh, log: [...fresh.log, { ts: Date.now(), kind: "colored-pass", playerId }].slice(-40) };
    }
    next = { ...next, coloredResolved: true };
    next = endIfTwoColorsLocked(next);
    if (next.gameEnded) return next;
    return allResponded(next) ? resolveTurn(next) : next;
  });
}

// Active player taps "Roll Dice" — only legal during their own
// "awaiting-roll" phase. Rolls the 2 white dice plus one die per color
// NOT yet locked out of the shared pool (a locked color's die is
// simply absent, forever, per the real rule).
export async function rollDice(gameId, round, activePlayerId) {
  return storageUpdate(gameId, key(round), (fresh) => {
    if (!fresh || fresh.gameEnded) return fresh;
    if (fresh.phase !== "awaiting-roll") return fresh;
    if (fresh.activePlayerId !== activePlayerId) return fresh;
    return performRoll(fresh, false);
  });
}

function performRoll(state, auto) {
  const w1 = roll6();
  const w2 = roll6();
  const dice = { white: [w1, w2] };
  ROW_COLORS.forEach(({ id }) => { dice[id] = state.lockedColors.includes(id) ? null : roll6(); });
  const log = [
    ...state.log,
    { ts: Date.now(), kind: auto ? "auto-roll" : "roll", playerId: state.activePlayerId, whiteSum: w1 + w2 },
  ].slice(-40);
  return {
    ...state, dice, phase: "deciding", turnStartedAt: Date.now(),
    pendingWhite: {}, coloredResolved: false, turnEvents: [], log,
  };
}

// Timeout fallback: anyone (including the active player, on the
// shared mark) who hasn't responded by the deadline defaults to
// "pass" — same "not deciding costs you the least" convention this
// app uses everywhere else (see e.g. lib/games/goldenFleeceData.js's
// own resolveStep comment) — a dead phone just forfeits that one
// opportunity rather than risking a bad mark on someone's behalf.
function forceDefaults(state) {
  const pendingWhite = { ...state.pendingWhite };
  const log = [...state.log];
  state.turnOrder.forEach((id) => {
    if (pendingWhite[id] === undefined) {
      pendingWhite[id] = true;
      log.push({ ts: Date.now(), kind: "auto-pass", playerId: id });
    }
  });
  let coloredResolved = state.coloredResolved;
  if (!coloredResolved) {
    coloredResolved = true;
    log.push({ ts: Date.now(), kind: "auto-pass-colored", playerId: state.activePlayerId });
  }
  return { ...state, pendingWhite, coloredResolved, log: log.slice(-40) };
}

// Turn resolution: the active player's own penalty check (did THEY
// mark anything at all this turn — the shared white mark counts too,
// not just their bonus), the 4-penalty game-end check, and advancing
// to the next player in turn order, looping back to the front after
// the last. The two-colors-locked end check already short-circuits
// earlier, inside the submit functions themselves — see their own
// comments — so it isn't re-checked here.
function resolveTurn(state) {
  const activeId = state.activePlayerId;
  const activeMarked = state.turnEvents.some((e) => e.playerId === activeId && (e.kind === "white-mark" || e.kind === "colored-mark"));
  let next = state;
  if (!activeMarked) {
    next = {
      ...state,
      sheets: { ...state.sheets, [activeId]: { ...state.sheets[activeId], penalties: state.sheets[activeId].penalties + 1 } },
      log: [...state.log, { ts: Date.now(), kind: "penalty", playerId: activeId }].slice(-40),
    };
  }
  if (next.sheets[activeId].penalties >= 4) {
    return { ...next, gameEnded: true, endReason: "penalties", phase: "ended" };
  }
  const nextIndex = (state.turnIndex + 1) % state.turnOrder.length;
  return {
    ...next,
    turnIndex: nextIndex,
    activePlayerId: state.turnOrder[nextIndex],
    phase: "awaiting-roll",
    turnStartedAt: Date.now(),
    pendingWhite: {},
    coloredResolved: false,
    turnEvents: [],
  };
}

// The authoritative housekeeping tick — called on its own short
// interval by the TV, every active player's phone, AND from
// lib/roundEngine.js's own housekeeping pass (same three-way
// redundancy as tickGoldenFleece — see that file's own comment). This
// matters more than usual here: unlike almost every other game in this
// app, this one has no fixed round count of its own, so it's entirely
// this tick's job (belt-and-suspenders with the two client polls) to
// keep a stalled decision window or an idle active player's roll from
// running the battle right up against — or past — the outer challenge
// timer with nothing resolved.
export async function tickDivinersDice(gameId, round, settings, db) {
  const update = db?.update || storageUpdate;
  return update(gameId, key(round), (fresh) => {
    if (!fresh || fresh.gameEnded) return fresh;
    const now = Date.now();
    if (fresh.phase === "awaiting-roll") {
      if (now - fresh.turnStartedAt >= rollWindowMs(settings)) return performRoll(fresh, true);
      return fresh;
    }
    if (fresh.phase === "deciding") {
      if (allResponded(fresh)) return resolveTurn(fresh);
      if (now - fresh.turnStartedAt >= decisionWindowMs(settings)) return resolveTurn(forceDefaults(fresh));
      return fresh;
    }
    return fresh;
  });
}

export function marksCount(sheet, colorId) {
  return sheet?.[colorId]?.marks.filter(Boolean).length || 0;
}

export function rowScore(sheet, colorId) {
  return SCORE_TABLE[marksCount(sheet, colorId)] || 0;
}

// The value reported via reportScore/placementValue (rank: "score-desc"
// in the registry) — sum of each row's table score, minus 5 per
// penalty. Safe to read live throughout, same as every other running-
// tally game here (see e.g. lib/games/godsAndGambitsData.js's own
// placementValue), not just once gameEnded.
export function placementValue(state, playerId) {
  const sheet = state?.sheets?.[playerId];
  if (!sheet) return 0;
  let total = 0;
  COLOR_IDS.forEach((id) => { total += rowScore(sheet, id); });
  total -= 5 * (sheet.penalties || 0);
  return total;
}
