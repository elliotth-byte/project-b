import { storageSet, storageUpdate, subscribeGameState } from "../gameStorage";

// ─── Spyfall ───
// https://boardgamegeek.com/boardgame/166384/spyfall — played live, in
// person, exactly like the real board game: everyone in the remaining
// pool gets the same secret location card except one random player,
// who gets SPY. Conversation happens out loud in the room, not through
// this app — the app's only job is dealing secret roles, showing the
// (purely informational — see below) 60-second countdown, and
// refereeing accusations and the spy's own location guess.
//
// This is a genuinely different shape of Battle from anything else in
// this app: every other game is a deterministic mini-game the app
// fully drives. Spyfall's actual gameplay (the questions, the
// suspicion, the bluffing) happens off-screen; this module only models
// the parts that need a shared, tamper-proof source of truth — who the
// spy is, what the location is, and whether an accusation or a self-
// guess actually succeeded.
//
// Deliberate simplifications from the literal tabletop rule, chosen
// for what's actually implementable as a fast in-app referee rather
// than a full simultaneous-pointing floor vote:
//   - An accusation names ONE specific suspect (not a "let's vote"
//     motion) and needs every other eligible player (everyone except
//     the accuser and the accused) to actively confirm it. A single
//     reject — or anyone just not responding before the vote window
//     closes — fails it immediately. This is "if there is a
//     consensus... otherwise the spy wins", made concrete: anything
//     short of full, active agreement is not a consensus.
//   - The 60-second round timer (ROUND_TIMER_SEC) is purely
//     informational, shown to create real pressure exactly like the
//     physical game's sand timer — it does not force any resolution
//     on its own. Running past it is fine; the room is still talking.
//   - Multi-round structure ("repeat until three winners or three
//     players left"): a caught spy, a failed accusation, or a spy who
//     self-guesses wrong each remove exactly one player from the
//     REMAINING POOL (not from the season — this is a self-contained
//     Battle, its outcome feeds the normal placementValue/Battle
//     ranking like any other game, nothing more). A spy who correctly
//     self-guesses the location wins that sub-round outright with no
//     elimination at all — a clean escape, nobody pays for it. Once
//     the pool bottoms out at exactly MIN_POOL_TO_CONTINUE (3) players,
//     the Battle ends and those three are the winners, tied for first.

export const SPYFALL_LOCATIONS = [
  "Mount Olympus Throne Room", "The Oracle's Temple at Delphi", "The Labyrinth of the Minotaur",
  "Poseidon's Trireme", "The Ferry Across the Styx", "Ares' Battlefield Camp",
  "The Vineyard of Dionysus", "The Forge of Hephaestus", "The Amazons' War Camp",
  "The Belly of the Trojan Horse", "Circe's Island", "The Sirens' Cove",
  "Hades' Underworld Court", "The Garden of the Hesperides", "Icarus's Workshop",
  "The Pythia's Cave", "Mount Etna's Foundry", "The Colosseum Floor",
  "Aphrodite's Bathhouse", "The Argo's Deck",
];

const ROUND_TIMER_SEC = 60; // informational only — see header comment
const VOTE_WINDOW_MS = 20000;
const MIN_POOL_TO_CONTINUE = 3;

function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const spyfallKey = (round) => `pb:spyfall:${round}`;

export function subscribeSpyfall(gameId, round, onChange) {
  return subscribeGameState(gameId, spyfallKey(round), onChange);
}

// Picks a fresh spy (random from the pool) and a fresh location
// (avoiding recent repeats, same reset-when-exhausted approach as
// lib/games/wagerTriviaTvData.js's own pickRound), and clears
// everything that belongs to the previous sub-round.
function dealNewSubRound(state, rng, now) {
  const spyId = state.remainingPool[Math.floor(rng() * state.remainingPool.length)];
  let pool = SPYFALL_LOCATIONS.filter((loc) => !state.usedLocations.includes(loc));
  let usedLocations = state.usedLocations;
  if (pool.length === 0) { pool = SPYFALL_LOCATIONS; usedLocations = []; }
  const location = pool[Math.floor(rng() * pool.length)];
  return {
    ...state,
    subRound: state.subRound + 1,
    spyId,
    location,
    usedLocations: [...usedLocations, location],
    subRoundStartedAt: now,
    pendingAccusation: null,
  };
}

export async function initSpyfall(gameId, round, participants, seed, db) {
  const set = db?.set || storageSet;
  const rng = mulberry32(seed || Date.now());
  const remainingPool = participants.map((p) => p.id);
  let state = {
    participantIds: remainingPool.slice(),
    remainingPool,
    eliminatedOrder: [], // [{ playerId, reason }] in elimination order — later removal ranks higher, same convention as every other Battle here
    subRound: 0,
    location: null,
    spyId: null,
    usedLocations: [],
    subRoundStartedAt: Date.now(),
    pendingAccusation: null,
    nextAccusationId: 1,
    ended: false,
    winnerIds: [],
    rngState: Math.floor(rng() * 1e9),
  };
  if (remainingPool.length <= MIN_POOL_TO_CONTINUE) {
    // Too few players for a real game — everyone's already a "winner" by the stated stopping condition.
    state = { ...state, ended: true, winnerIds: remainingPool.slice() };
  } else {
    state = dealNewSubRound(state, rng, Date.now());
    state.rngState = Math.floor(rng() * 1e9);
  }
  await set(gameId, spyfallKey(round), state);
}

// Removes one player from the pool, records why, then either deals a
// fresh sub-round or ends the Battle if that was the removal that
// finally brought the pool down to MIN_POOL_TO_CONTINUE. Shared by
// every path that can eliminate someone (a caught spy, a failed
// accusation's own accuser, a spy's wrong self-guess) so "what happens
// after someone's removed" only has one implementation.
function removeFromPoolAndAdvance(state, playerId, reason, rng, now) {
  const remainingPool = state.remainingPool.filter((id) => id !== playerId);
  const eliminatedOrder = [...state.eliminatedOrder, { playerId, reason }];
  let next = { ...state, remainingPool, eliminatedOrder, pendingAccusation: null };
  if (remainingPool.length <= MIN_POOL_TO_CONTINUE) {
    next = { ...next, ended: true, winnerIds: remainingPool.slice(), spyId: null, location: null };
  } else {
    next = dealNewSubRound(next, rng, now);
  }
  return next;
}

// A spy win with no elimination at all (a correct self-guess) — the
// pool doesn't shrink, so there's nothing to check against
// MIN_POOL_TO_CONTINUE; just redeal among the same pool.
function redealSamePool(state, rng, now) {
  return dealNewSubRound(state, rng, now);
}

// Pure move logic, pulled out for the same reason every other game's
// mutating actions here get a pure core (see e.g.
// lib/games/tartarusTreadmillData.js's own applyMove) — a standalone
// test can drive the whole accuse/vote/guess flow with zero storage
// mocking, only ever passing `now` in explicitly.
export function applySubmitAccusation(fresh, accuserId, accusedId, now) {
  if (!fresh || fresh.ended || fresh.pendingAccusation) return fresh;
  if (accuserId === accusedId) return fresh;
  if (!fresh.remainingPool.includes(accuserId) || !fresh.remainingPool.includes(accusedId)) return fresh;
  return {
    ...fresh,
    pendingAccusation: { id: fresh.nextAccusationId, accuserId, accusedId, createdAt: now, votes: {} },
    nextAccusationId: fresh.nextAccusationId + 1,
  };
}

function eligibleVoters(fresh) {
  const { accuserId, accusedId } = fresh.pendingAccusation;
  return fresh.remainingPool.filter((id) => id !== accuserId && id !== accusedId);
}

// Pure resolution logic for a pending accusation once every eligible
// voter has weighed in (or the vote window has closed) — pulled out
// separately from the storageUpdate wrapper so it's directly testable,
// same pattern as every other pure transition in this app's games.
function resolveAccusation(fresh, rng, now) {
  const { accusedId } = fresh.pendingAccusation;
  const voters = eligibleVoters(fresh);
  const allConfirmed = voters.length > 0 && voters.every((id) => fresh.pendingAccusation.votes[id] === "confirm");
  if (allConfirmed && accusedId === fresh.spyId) {
    // Full consensus AND correctly identified — the spy is caught.
    return removeFromPoolAndAdvance(fresh, accusedId, "caught", rng, now);
  }
  // Anything short of that (a reject, a timeout with unanswered
  // voters, or full consensus on the WRONG person) is not a consensus
  // that correctly identified the spy — per the source rule, the spy
  // wins, and the accuser pays for the failed accusation.
  return removeFromPoolAndAdvance(fresh, fresh.pendingAccusation.accuserId, "wrong-accusation", rng, now);
}

export function applySubmitAccusationVote(fresh, playerId, vote, now) {
  if (!fresh || fresh.ended || !fresh.pendingAccusation) return fresh;
  if (vote !== "confirm" && vote !== "reject") return fresh;
  const voters = eligibleVoters(fresh);
  if (!voters.includes(playerId)) return fresh;
  if (fresh.pendingAccusation.votes[playerId]) return fresh; // already voted

  const rng = mulberry32(fresh.rngState);
  const withVote = { ...fresh, pendingAccusation: { ...fresh.pendingAccusation, votes: { ...fresh.pendingAccusation.votes, [playerId]: vote } } };

  // A single reject fails the accusation immediately — no need to
  // wait out the rest of the vote once consensus is already
  // impossible.
  if (vote === "reject") {
    const resolved = resolveAccusation(withVote, rng, now);
    return { ...resolved, rngState: Math.floor(rng() * 1e9) };
  }
  const stillWaiting = voters.some((id) => !withVote.pendingAccusation.votes[id]);
  if (stillWaiting) return withVote;
  const resolved = resolveAccusation(withVote, rng, now);
  return { ...resolved, rngState: Math.floor(rng() * 1e9) };
}

export function applySpyGuess(fresh, spyId, guessedLocation, now) {
  if (!fresh || fresh.ended || fresh.spyId !== spyId) return fresh;
  const rng = mulberry32(fresh.rngState);
  const correct = guessedLocation === fresh.location;
  const next = correct
    ? redealSamePool(fresh, rng, now)
    : removeFromPoolAndAdvance(fresh, spyId, "wrong-self-guess", rng, now);
  return { ...next, rngState: Math.floor(rng() * 1e9) };
}

export async function submitAccusation(gameId, round, accuserId, accusedId) {
  return storageUpdate(gameId, spyfallKey(round), (fresh) => applySubmitAccusation(fresh, accuserId, accusedId, Date.now()));
}

export async function submitAccusationVote(gameId, round, playerId, vote) {
  return storageUpdate(gameId, spyfallKey(round), (fresh) => applySubmitAccusationVote(fresh, playerId, vote, Date.now()));
}

export async function submitSpyGuess(gameId, round, spyId, guessedLocation) {
  return storageUpdate(gameId, spyfallKey(round), (fresh) => applySpyGuess(fresh, spyId, guessedLocation, Date.now()));
}

// Pure, testable transition — the only time-driven state change in
// this whole module: an accusation vote that's still short of full
// consensus once its window closes fails exactly like an explicit
// reject would (see this file's header comment on why anything short
// of full active agreement isn't a consensus).
export function spyfallTransition(fresh, now) {
  if (!fresh || fresh.ended || !fresh.pendingAccusation) return fresh;
  if (now - fresh.pendingAccusation.createdAt < VOTE_WINDOW_MS) return fresh;
  const rng = mulberry32(fresh.rngState);
  const resolved = resolveAccusation(fresh, rng, now);
  return { ...resolved, rngState: Math.floor(rng() * 1e9) };
}

export async function tickSpyfall(gameId, round, db) {
  const update = db?.update || storageUpdate;
  const now = Date.now();
  return update(gameId, spyfallKey(round), (fresh) => spyfallTransition(fresh, now));
}

// Same "later removal ranks higher, winners top everyone" convention
// as every other elimination Battle here (see e.g.
// lib/games/tartarusTreadmillData.js's own placementValue) — the three
// final survivors tie for first (a genuine three-way tie is the
// intended, stated stopping condition, not an edge case to break),
// and anyone removed earlier ranks below anyone removed later.
export function placementValue(state, playerId) {
  if (state.winnerIds?.includes(playerId)) return 100000;
  const idx = state.eliminatedOrder?.findIndex((e) => e.playerId === playerId);
  if (idx != null && idx >= 0) return 1000 + idx;
  if (state.remainingPool?.includes(playerId)) return 1000 + (state.eliminatedOrder?.length || 0);
  return 0;
}

export const SPYFALL_ROUND_TIMER_SEC = ROUND_TIMER_SEC;
export const SPYFALL_VOTE_WINDOW_MS = VOTE_WINDOW_MS;
export const SPYFALL_MIN_POOL_TO_CONTINUE = MIN_POOL_TO_CONTINUE;
