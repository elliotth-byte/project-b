import { storageSet, storageUpdate, subscribeGameState } from "../gameStorage";

// storageUpdate resolves to dbAdapter.js's own actual return shape —
// { ok, value, aborted? } — never the raw next state directly. Every
// mutation function below that needs to hand its caller the resulting
// state (so `state = await someMutation(...)` gets the state itself,
// not a wrapper object) goes through this instead of calling
// storageUpdate directly.
async function updateState(gameId, key, updater) {
  const result = await storageUpdate(gameId, key, updater);
  return result?.value ?? null;
}

import { TRIVIA_CATEGORIES } from "./triviaData";

// ─── The Floor ───
// Reskinned from the game show of the same name. Every participant
// starts on their own single square of a grid, having already chosen
// their own area of expertise (see sql/add-floor-specialty.sql) —
// reusing this app's existing 90+ curated trivia categories
// (lib/games/triviaData.js) rather than inventing a whole separate
// content bank, since "pick a category, then get asked about it" is
// already exactly what that data supports.
//
// Flow:
//   - Two adjacent players duel over a fixed set of 3 questions (one
//     easy, one medium, one hard) drawn from ONE of their two
//     specialties — a coin flip, once per duel. Deliberately built so
//     neither duelist has to be online at the same moment as the
//     other: each answers their own copy of the same 3 questions
//     whenever they get to it, in their own time. Once BOTH have
//     answered all 3, whoever got more correct wins the duel; a tie on
//     correctness is broken by whoever took less of their OWN elapsed
//     time (measured from when THEY personally started answering, not
//     from when the duel itself was created — see beginFloorDuelIfNeeded
//     — so checking in 6 hours later never penalizes someone for the
//     other player's head start).
//   - The loser is eliminated outright; their ENTIRE current territory
//     (however many squares they'd already accumulated) transfers to
//     the winner.
//   - The winner becomes the reigning champion and picks their next
//     opponent from whoever currently owns a square touching their
//     now-larger territory — real strategic choice, same as the show.
//   - Once the champion has no eligible opponent left (their territory
//     already touches everyone remaining, or there's nobody left),
//     they've won the whole floor.
//
// Two deliberate simplifications, stated plainly rather than silently
// approximated:
//   - The real show lets a big territory-holder draw a question from
//     ANY category they've ever absorbed by defeating its owner, not
//     just their own original specialty. This build keeps every
//     surviving player's OWN original specialty as the only category
//     they ever represent in a duel, win or lose — still captures
//     "your chosen expertise matters," without tracking an
//     ever-growing pool of absorbed categories per player.
//   - The real show is a live head-to-head buzzer race — whoever
//     answers first, on the spot, wins. That's fundamentally
//     incompatible with two people never needing to be online
//     together, so this build trades the live race for "most correct,
//     tie broken by your own time" — the closest equivalent that
//     still rewards both knowledge and speed without requiring
//     simultaneous presence.
//
// n participants → exactly n-1 duels total, regardless of path through
// the board — every duel permanently removes exactly one player, same
// invariant as lib/games/musicalChairsData.js.

export const floorKey = (round) => `pb:floor:${round}`;
const key = floorKey;

export function subscribeFloor(gameId, round, onChange) {
  return subscribeGameState(gameId, key(round), onChange);
}

const MIN_PARTICIPANTS = 2;
const DIFFICULTY_ORDER = ["easy", "medium", "hard"];

// One timeout, used for both "champion hasn't picked an opponent yet"
// and "this duel's gone quiet" — dynamic rather than a flat constant,
// same reasoning lib/games/musicalChairsData.js's seat window has:
// this app's challenges range from a few live minutes to many async
// hours, and a fixed short timeout that's reasonable for the former is
// unworkable for the latter. Sized off this game's own average
// per-duel time budget, clamped so it's never so short a normal
// decision gets rushed, and never so long a single stall can eat a
// short battle's entire runtime.
const MIN_ACTION_MS = 20000; // 20s — reading a question and answering, or reading the board and picking, both take a moment even in a fast live game
const MAX_ACTION_MS = 20 * 60 * 1000; // 20 minutes — generous for an async check-in
const ACTION_FRACTION = 0.35;

function seededRandom(seed) {
  let s = seed || 1;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

export function computeActionTimeoutMs(challengeDurationSec, totalDuels) {
  if (totalDuels <= 0) return MIN_ACTION_MS;
  const totalMs = (challengeDurationSec || 600) * 1000;
  const avgDuelMs = totalMs / totalDuels;
  return Math.round(Math.max(MIN_ACTION_MS, Math.min(MAX_ACTION_MS, avgDuelMs * ACTION_FRACTION)));
}

// ─── Grid ───
// Near-square, filled row-major; if n isn't a perfect rectangle the
// last row is simply short (its trailing cells stay null forever —
// "pads," never owned, never adjacent-eligible to anyone since
// eligibleOpponents only ever looks at REAL owners).
function buildGrid(n) {
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  return { cols, rows, cellOwnerOf: new Array(cols * rows).fill(null) };
}

function neighborsOfCell(cellIndex, cols, rows) {
  const row = Math.floor(cellIndex / cols);
  const col = cellIndex % cols;
  const neighbors = [];
  if (col > 0) neighbors.push(cellIndex - 1);
  if (col < cols - 1) neighbors.push(cellIndex + 1);
  if (row > 0) neighbors.push(cellIndex - cols);
  if (row < rows - 1) neighbors.push(cellIndex + cols);
  return neighbors.filter((i) => i >= 0 && i < cols * rows);
}

function eligibleOpponents(cellOwnerOf, cols, rows, myCells, myId) {
  const owners = new Set();
  myCells.forEach((cellIndex) => {
    neighborsOfCell(cellIndex, cols, rows).forEach((n) => {
      const owner = cellOwnerOf[n];
      if (owner && owner !== myId) owners.add(owner);
    });
  });
  return [...owners];
}

// ─── Specialties ───
// Honors each participant's own pre-chosen category
// (players.floor_specialty), falling back to a random unused one for
// anyone who never picked, picked something no longer valid, or
// collided with someone who chose the same thing first (categories are
// unique per battle, first-claimed wins — see components/OptionsPanel.jsx's
// picker for the live version of that same rule). Nobody's ever unable
// to play just because they forgot to set something ahead of time —
// same spirit as lib/games/torchedData.js's own preset fallback.
function resolveSpecialties(participants, seed) {
  const rand = seededRandom(seed);
  const allNames = TRIVIA_CATEGORIES.map((c) => c.category);
  const taken = new Set();
  const specialties = {};

  participants.forEach((p) => {
    const chosen = p.floor_specialty;
    if (chosen && allNames.includes(chosen) && !taken.has(chosen)) {
      specialties[p.id] = chosen;
      taken.add(chosen);
    }
  });

  participants.forEach((p) => {
    if (specialties[p.id]) return;
    const pool = allNames.filter((c) => !taken.has(c));
    const choice = pool.length > 0 ? pool[Math.floor(rand() * pool.length)] : allNames[Math.floor(rand() * allNames.length)];
    specialties[p.id] = choice;
    taken.add(choice);
  });

  return specialties;
}

// ─── Questions ───
function categoryByName(name) {
  return TRIVIA_CATEGORIES.find((c) => c.category === name) || TRIVIA_CATEGORIES[0];
}

// Same option-shuffle lib/games/triviaData.js's own pickTriviaCategories
// does — kept local since it's one small pure function and importing a
// shared helper for it would be more coupling than it's worth.
function shuffledQuestion(q, seed) {
  const rand = seededRandom(seed);
  const order = q.options.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { q: q.q, options: order.map((i) => q.options[i]), answer: order.indexOf(q.answer) };
}

// Cycles easy -> medium -> hard — a category's full 3-question set,
// shuffled once per duel and shared as-is by both duelists (same
// questions, same option order, for a fair head-to-head comparison).
function questionsForDuel(categoryName, seed) {
  const rand = seededRandom(seed);
  return DIFFICULTY_ORDER.map((tier) => shuffledQuestion(categoryByName(categoryName)[tier], Math.floor(rand() * 0x7fffffff)));
}

function startDuel(fresh, a, b, seed) {
  const rand = seededRandom(seed);
  const categoryOwnerId = rand() < 0.5 ? a : b;
  const now = Date.now();
  return {
    ...fresh,
    gamePhase: "dueling",
    duelistIds: [a, b],
    duelCategoryPlayerId: categoryOwnerId,
    duelQuestions: questionsForDuel(fresh.specialties[categoryOwnerId], seed + 1),
    // duelStartedAt anchors the OUTER timeout only (see
    // autoResolveFloorDuelIfDue) — each duelist's own fairness clock is
    // tracked separately, per-player, in duelProgress below, precisely
    // so neither of these two purposes contaminates the other.
    duelStartedAt: now,
    duelProgress: {
      [a]: { startedAt: null, answers: [], correctCount: 0, finishedAt: null },
      [b]: { startedAt: null, answers: [], correctCount: 0, finishedAt: null },
    },
    championId: null,
    eligibleOpponentIds: null,
    choosingStartedAt: null,
  };
}

// db: optional override — see lib/games/plinkoBracketData.js's
// initPlinkoBracket for why.
export async function initFloor(gameId, round, participants, now, challengeDurationSec, db) {
  const set = db?.set || storageSet;
  if (participants.length < MIN_PARTICIPANTS) return; // degenerate case, handled client-side

  const participantIds = participants.map((p) => p.id);
  const totalDuels = participantIds.length - 1;
  const { cols, rows, cellOwnerOf } = buildGrid(participantIds.length);
  participantIds.forEach((id, i) => { cellOwnerOf[i] = id; });
  const territoryOf = {};
  participantIds.forEach((id, i) => { territoryOf[id] = [i]; });
  const specialties = resolveSpecialties(participants, now);
  const actionTimeoutMs = computeActionTimeoutMs(challengeDurationSec, totalDuels);

  // Opening matchup: any adjacent pair of REAL players, picked at
  // random — a real episode's very first duel has no reigning champion
  // yet to have picked anyone either. Filtered to cellOwnerOf[i] &&
  // cellOwnerOf[n] specifically because neighborsOfCell only bounds-
  // checks against the full grid rectangle, not against how many real
  // participants actually exist — for a player count that doesn't fill
  // the grid exactly (7 players on a 3x3 grid, say), the last row's
  // real cells can be grid-adjacent to an empty "pad" cell, and without
  // this filter the very first duel could occasionally get started
  // against nobody at all.
  const edges = [];
  for (let i = 0; i < participantIds.length; i++) {
    neighborsOfCell(i, cols, rows).forEach((n) => { if (n > i && cellOwnerOf[i] && cellOwnerOf[n]) edges.push([i, n]); });
  }
  const rand = seededRandom(now);
  const [aCell, bCell] = edges[Math.floor(rand() * edges.length)];

  const base = {
    participantIds,
    gridCols: cols,
    gridRows: rows,
    cellOwnerOf,
    territoryOf,
    specialties,
    actionTimeoutMs,
    eliminatedOrder: [],
    winnerId: null,
    timedOut: false,
    results: null,
  };
  await set(gameId, key(round), startDuel(base, cellOwnerOf[aCell], cellOwnerOf[bCell], now + 1));
}

export async function chooseFloorOpponent(gameId, round, championId, opponentId) {
  return updateState(gameId, key(round), (fresh) => {
    if (!fresh || fresh.gamePhase !== "choosing") return fresh;
    if (fresh.championId !== championId) return fresh;
    if (!fresh.eligibleOpponentIds?.includes(opponentId)) return fresh;
    return startDuel(fresh, championId, opponentId, Date.now());
  });
}

// Shared by a genuine head-to-head win and both timeout fallbacks
// below — pure function of its inputs, same reasoning
// lib/games/musicalChairsData.js's own resolveRound documents (only
// one call's write ever actually lands; it doesn't matter which
// client's browser happened to compute it).
function resolveDuel(fresh, winnerId) {
  const loserId = fresh.duelistIds.find((id) => id !== winnerId);
  const loserCells = fresh.territoryOf[loserId] || [];
  const nextTerritoryOf = { ...fresh.territoryOf };
  nextTerritoryOf[winnerId] = [...(nextTerritoryOf[winnerId] || []), ...loserCells];
  delete nextTerritoryOf[loserId];
  const nextCellOwnerOf = [...fresh.cellOwnerOf];
  loserCells.forEach((c) => { nextCellOwnerOf[c] = winnerId; });
  const eliminatedOrder = [...fresh.eliminatedOrder, loserId];

  const eligible = eligibleOpponents(nextCellOwnerOf, fresh.gridCols, fresh.gridRows, nextTerritoryOf[winnerId], winnerId);

  if (eligible.length === 0) {
    const ranking = [...eliminatedOrder, winnerId]; // worst..best
    const results = {};
    ranking.forEach((id, i) => { results[id] = { points: i + 1, placement: ranking.length - i }; });
    return {
      ...fresh, gamePhase: "revealed", cellOwnerOf: nextCellOwnerOf, territoryOf: nextTerritoryOf,
      eliminatedOrder, winnerId, results,
      duelistIds: [], duelQuestions: null, duelProgress: null, championId: null, eligibleOpponentIds: null,
    };
  }

  return {
    ...fresh,
    cellOwnerOf: nextCellOwnerOf,
    territoryOf: nextTerritoryOf,
    eliminatedOrder,
    gamePhase: "choosing",
    championId: winnerId,
    eligibleOpponentIds: eligible,
    choosingStartedAt: Date.now(),
    duelistIds: [],
    duelQuestions: null,
    duelProgress: null,
  };
}

// Higher correctCount wins; a tie is broken by whichever duelist's OWN
// elapsed time (their personal finishedAt minus their personal
// startedAt — see beginFloorDuelIfNeeded) was shorter. A duelist who
// never even started counts as 0 correct and effectively infinite
// time, so they always lose to anyone who engaged at all; if genuinely
// neither duelist ever did anything (the rare full-stall case the
// outer timeout below exists for), there's no real signal left to
// compare — broken by a deterministic pick seeded from the duel's own
// state, so every client watching converges on the same answer.
function pickDuelWinner(duelistIds, progress, seed) {
  const [a, b] = duelistIds;
  const pa = progress[a];
  const pb = progress[b];
  if (pa.correctCount !== pb.correctCount) return pa.correctCount > pb.correctCount ? a : b;
  const durationOf = (p) => (p.startedAt == null ? Infinity : (p.finishedAt ?? Infinity) - p.startedAt);
  const durA = durationOf(pa);
  const durB = durationOf(pb);
  if (durA !== durB) return durA < durB ? a : b;
  const rand = seededRandom(seed);
  return rand() < 0.5 ? a : b;
}

// Marks the moment THIS specific duelist personally began answering —
// called once by their own client, the first time it renders the duel
// screen for them (see components/games/FloorPlayer.jsx). This is what
// makes the "tie broken by time" comparison fair across two people who
// were never online at the same time: each duelist's clock only ever
// measures their OWN engagement, never how long the duel itself has
// existed or how long the other person took to show up.
export async function beginFloorDuelIfNeeded(gameId, round, playerId) {
  return updateState(gameId, key(round), (fresh) => {
    if (!fresh || fresh.gamePhase !== "dueling") return fresh;
    if (!fresh.duelistIds.includes(playerId)) return fresh;
    if (fresh.duelProgress[playerId].startedAt) return fresh; // already started
    return { ...fresh, duelProgress: { ...fresh.duelProgress, [playerId]: { ...fresh.duelProgress[playerId], startedAt: Date.now() } } };
  });
}

// One answer, for whichever of THIS duelist's own 3 questions they
// haven't answered yet — entirely independent of what the other
// duelist has or hasn't done. Rejected outright (no-op) if the duel
// isn't live, this player isn't in it, or they've already answered all
// 3 of their own — same silent-reject convention as every other
// multiplayer submission in this app. Self-heals a missing startedAt
// (sets it to now) rather than rejecting the answer outright, in case
// this ever runs before beginFloorDuelIfNeeded's own write has landed —
// it just means that one edge case's very first question doesn't get
// its thinking time measured, which is a far smaller cost than losing
// a legitimate answer to a race condition.
export async function submitFloorDuelAnswer(gameId, round, playerId, answerIndex) {
  return updateState(gameId, key(round), (fresh) => {
    if (!fresh || fresh.gamePhase !== "dueling") return fresh;
    if (!fresh.duelistIds.includes(playerId)) return fresh;
    const mine = fresh.duelProgress[playerId];
    if (!mine || mine.finishedAt) return fresh;
    const qIndex = mine.answers.length;
    if (qIndex >= fresh.duelQuestions.length) return fresh;

    const correct = answerIndex === fresh.duelQuestions[qIndex].answer;
    const nextAnswers = [...mine.answers, answerIndex];
    const isDone = nextAnswers.length >= fresh.duelQuestions.length;
    const nextMine = {
      startedAt: mine.startedAt ?? Date.now(),
      answers: nextAnswers,
      correctCount: mine.correctCount + (correct ? 1 : 0),
      finishedAt: isDone ? Date.now() : null,
    };
    const nextProgress = { ...fresh.duelProgress, [playerId]: nextMine };

    const otherId = fresh.duelistIds.find((id) => id !== playerId);
    if (isDone && nextProgress[otherId]?.finishedAt) {
      const winnerId = pickDuelWinner(fresh.duelistIds, nextProgress, fresh.duelStartedAt);
      return resolveDuel({ ...fresh, duelProgress: nextProgress }, winnerId);
    }
    return { ...fresh, duelProgress: nextProgress };
  });
}

// Champion took too long to pick — auto-picks a random eligible
// opponent so one inactive champion can't stall the entire bracket.
// Called on an interval by every player's own client AND, as a safety
// net for when nobody's tab happens to be active, by
// lib/roundEngine.js's poll (see musicalChairsData.js's identical
// reasoning for why both matter).
export async function autoChooseFloorOpponentIfDue(gameId, round) {
  return updateState(gameId, key(round), (fresh) => {
    if (!fresh || fresh.gamePhase !== "choosing") return fresh;
    if (Date.now() < fresh.choosingStartedAt + fresh.actionTimeoutMs) return fresh;
    const rand = seededRandom(fresh.choosingStartedAt);
    const opponentId = fresh.eligibleOpponentIds[Math.floor(rand() * fresh.eligibleOpponentIds.length)];
    return startDuel(fresh, fresh.championId, opponentId, fresh.choosingStartedAt + 1);
  });
}

// A duel that's sat open too long without BOTH duelists finishing —
// resolved on whatever progress exists rather than left stuck forever.
// Measured from duelStartedAt (when this pairing was created), which
// is deliberately a DIFFERENT clock than the one that decides who wins
// (see pickDuelWinner and beginFloorDuelIfNeeded) — this one only ever
// answers "has this duel been open too long," never "who was faster,"
// so it can't undermine the fairness the personal-clock design exists
// for. Genuinely meant as a last resort — actionTimeoutMs already
// scales up to a generous window for a long async battle (see
// computeActionTimeoutMs) — for when one or both duelists simply never
// engage at all. Chains, Masquerade, and Torched all accept an
// equivalent "someone has to come out of this, even on partial
// information" fallback for their own stalls, so this isn't a new kind
// of compromise.
export async function autoResolveFloorDuelIfDue(gameId, round) {
  return updateState(gameId, key(round), (fresh) => {
    if (!fresh || fresh.gamePhase !== "dueling") return fresh;
    if (Date.now() < fresh.duelStartedAt + fresh.actionTimeoutMs) return fresh;
    const winnerId = pickDuelWinner(fresh.duelistIds, fresh.duelProgress, fresh.duelStartedAt);
    return resolveDuel(fresh, winnerId);
  });
}

// Challenge-level safety net (see lib/roundEngine.js's
// autoFinalizeFloorOnTimeout) — same shape as
// lib/games/musicalChairsData.js's own finalizeOnTimeout: whoever's
// still standing when the season's configured challenge duration runs
// out didn't lose, so they're not ranked below anyone already
// eliminated, but the game can't say which of them would have gone on
// to win the whole floor — so they tie for the best remaining
// placement rather than being arbitrarily ordered.
export function finalizeFloorOnTimeout(fresh) {
  if (!fresh || fresh.gamePhase === "revealed") return fresh;
  const remainingPlayerIds = fresh.participantIds.filter((id) => !fresh.eliminatedOrder.includes(id));
  const ranking = fresh.eliminatedOrder; // worst..best, NOT including whoever's left
  const results = {};
  ranking.forEach((id, i) => { results[id] = { points: i + 1, placement: ranking.length + remainingPlayerIds.length - i }; });
  const survivorPoints = ranking.length + 1;
  const survivorPlacement = remainingPlayerIds.length;
  remainingPlayerIds.forEach((id) => { results[id] = { points: survivorPoints, placement: survivorPlacement }; });
  return { ...fresh, gamePhase: "revealed", timedOut: true, results };
}

export function placementValue(state, playerId) {
  if (state.gamePhase !== "revealed") return 0;
  return state.results?.[playerId]?.points || 0;
}
