import { storageSet, storageUpdate, subscribeGameState } from "../gameStorage";

// ─── Acrophobia — Big Screen ───
// A clone of the classic web party game: every round a random string
// of letters shows up (the "acronym"), everyone privately writes a
// phrase whose words start with those letters in order, then all the
// phrases go up anonymously — on the shared screen, the whole point is
// the room reading them together — for everyone to vote for their
// favorite. Whoever wrote the most-voted phrase gets a bonus on top of
// a point for every vote their own phrase received, and the game deals
// a fresh acronym and keeps going for as many rounds as the Battle's
// timer allows — continuous, like lib/games/wagerTriviaTvData.js,
// which this file's phase shape (submitting -> voting -> resolved) is
// deliberately modeled after.
//
// The anonymization is the one place this needs to be careful:
// whichever order the submissions get shown in during voting has to be
// IDENTICAL across every phone and the TV, or the "A/B/C" labels would
// point at different phrases on different screens. That's why the
// shuffled voting order is computed once, server-side, the moment
// voting opens (see beginVotingPhase below) and stored directly in
// state as `votingOrder` — every client just renders that same array,
// never reshuffling it themselves.

const LETTER_POOL = "ABCDEFGHIJKLMNOPRSTUVWY".split(""); // Q, X, Z excluded — too punishing for a fast party game
const MIN_LETTERS = 3;
const MAX_LETTERS = 5;
const SUBMIT_WINDOW_MS = 45000;
const VOTE_WINDOW_MS = 25000;
const RESOLVED_DISPLAY_MS = 6000;
const WINNER_BONUS = 10;

function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(array, rng) {
  const out = [...array];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function rollLetters(rng) {
  const count = MIN_LETTERS + Math.floor(rng() * (MAX_LETTERS - MIN_LETTERS + 1));
  return Array.from({ length: count }, () => LETTER_POOL[Math.floor(rng() * LETTER_POOL.length)]);
}

// A phrase is valid if it has exactly one word per letter and each
// word's own first letter (case-insensitive) matches, in order.
// Exported so the phone's own submit button can validate before ever
// hitting the network, with the exact same rule enforced again
// server-side as the real gate (see applySubmitPhrase) — a client
// check is a UX nicety, not the actual boundary.
export function isValidPhrase(text, letters) {
  if (typeof text !== "string") return false;
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length !== letters.length) return false;
  return words.every((word, i) => word[0]?.toUpperCase() === letters[i]);
}

export const acrophobiaKey = (round) => `pb:acrophobia:${round}`;

export function subscribeAcrophobia(gameId, round, onChange) {
  return subscribeGameState(gameId, acrophobiaKey(round), onChange);
}

function dealNewRound(state, rng, now) {
  return {
    ...state,
    subRound: state.subRound + 1,
    letters: rollLetters(rng),
    phase: "submitting",
    phaseStartedAt: now,
    submissions: {},
    votingOrder: [],
    votes: {},
    lastOutcome: null,
  };
}

export async function initAcrophobia(gameId, round, participants, seed, db) {
  const set = db?.set || storageSet;
  const rng = mulberry32(seed || Date.now());
  const scores = {};
  participants.forEach((p) => { scores[p.id] = 0; });
  let state = {
    participantIds: participants.map((p) => p.id),
    scores,
    subRound: 0,
    letters: [],
    phase: "submitting",
    phaseStartedAt: Date.now(),
    submissions: {},
    votingOrder: [],
    votes: {},
    lastOutcome: null,
    rngState: Math.floor(rng() * 1e9),
  };
  state = dealNewRound(state, rng, Date.now());
  state.rngState = Math.floor(rng() * 1e9);
  await set(gameId, acrophobiaKey(round), state);
}

export function applySubmitPhrase(fresh, playerId, text) {
  if (!fresh || fresh.phase !== "submitting") return fresh;
  if (fresh.submissions[playerId]) return fresh; // already submitted this round
  if (!isValidPhrase(text, fresh.letters)) return fresh;
  return { ...fresh, submissions: { ...fresh.submissions, [playerId]: text.trim() } };
}

export function applySubmitVote(fresh, playerId, votedForAuthorId) {
  if (!fresh || fresh.phase !== "voting") return fresh;
  if (fresh.votes[playerId]) return fresh; // already voted
  if (votedForAuthorId === playerId) return fresh; // can't vote for your own phrase
  if (!fresh.submissions[votedForAuthorId]) return fresh; // not a real submission this round
  return { ...fresh, votes: { ...fresh.votes, [playerId]: votedForAuthorId } };
}

// A participant can only meaningfully vote if there's at least one
// submission that ISN'T their own — someone who's the sole submitter
// (or didn't submit and everyone else also didn't) has nothing valid
// to vote for and is excluded from the "has everyone voted" check
// entirely, the same way a player who never opted in isn't counted
// against Wager Trivia's own "has everyone decided" check.
function votersWithAValidChoice(fresh) {
  const authorIds = Object.keys(fresh.submissions);
  return fresh.participantIds.filter((id) => authorIds.some((authorId) => authorId !== id));
}

function tallyAndScore(fresh) {
  const voteCounts = {};
  Object.keys(fresh.submissions).forEach((authorId) => { voteCounts[authorId] = 0; });
  Object.values(fresh.votes).forEach((authorId) => { voteCounts[authorId] = (voteCounts[authorId] || 0) + 1; });

  const maxVotes = Object.values(voteCounts).reduce((m, v) => Math.max(m, v), 0);
  const topAuthorIds = maxVotes > 0 ? Object.keys(voteCounts).filter((id) => voteCounts[id] === maxVotes) : [];

  const scores = { ...fresh.scores };
  const pointsAwarded = {};
  Object.keys(fresh.submissions).forEach((authorId) => {
    const delta = (voteCounts[authorId] || 0) + (topAuthorIds.includes(authorId) ? WINNER_BONUS : 0);
    scores[authorId] = (scores[authorId] || 0) + delta;
    pointsAwarded[authorId] = delta;
  });

  return {
    scores,
    lastOutcome: {
      letters: fresh.letters,
      submissions: fresh.submissions,
      votingOrder: fresh.votingOrder,
      voteCounts,
      topAuthorIds,
      pointsAwarded,
    },
  };
}

// Pure, testable phase-transition logic — see
// lib/games/wagerTriviaTvData.js's own wagerTriviaTransition for the
// identical shape this is deliberately modeled after.
export function acrophobiaTransition(fresh, now) {
  if (!fresh) return fresh;

  if (fresh.phase === "submitting") {
    const allIds = fresh.participantIds || [];
    const everyoneSubmitted = allIds.length > 0 && allIds.every((id) => fresh.submissions[id] != null);
    const timedOut = now - fresh.phaseStartedAt >= SUBMIT_WINDOW_MS;
    if (!everyoneSubmitted && !timedOut) return fresh;

    if (Object.keys(fresh.submissions).length === 0) {
      // Nobody wrote anything at all — nothing to vote on, deal a
      // fresh acronym rather than sitting on an empty voting phase.
      const rng = mulberry32(fresh.rngState);
      const next = dealNewRound(fresh, rng, now);
      return { ...next, rngState: Math.floor(rng() * 1e9) };
    }

    const rng = mulberry32(fresh.rngState);
    const votingOrder = shuffle(Object.keys(fresh.submissions), rng);
    return { ...fresh, phase: "voting", phaseStartedAt: now, votingOrder, rngState: Math.floor(rng() * 1e9) };
  }

  if (fresh.phase === "voting") {
    const eligibleVoters = votersWithAValidChoice(fresh);
    const everyoneVoted = eligibleVoters.every((id) => fresh.votes[id] != null);
    const timedOut = now - fresh.phaseStartedAt >= VOTE_WINDOW_MS;
    if (!everyoneVoted && !timedOut) return fresh;

    const { scores, lastOutcome } = tallyAndScore(fresh);
    return { ...fresh, scores, lastOutcome, phase: "resolved", phaseStartedAt: now };
  }

  if (fresh.phase === "resolved") {
    if (now - fresh.phaseStartedAt < RESOLVED_DISPLAY_MS) return fresh;
    const rng = mulberry32(fresh.rngState);
    const next = dealNewRound(fresh, rng, now);
    return { ...next, rngState: Math.floor(rng() * 1e9) };
  }

  return fresh;
}

export async function submitPhrase(gameId, round, playerId, text) {
  return storageUpdate(gameId, acrophobiaKey(round), (fresh) => applySubmitPhrase(fresh, playerId, text));
}

export async function submitVote(gameId, round, playerId, votedForAuthorId) {
  return storageUpdate(gameId, acrophobiaKey(round), (fresh) => applySubmitVote(fresh, playerId, votedForAuthorId));
}

export async function tickAcrophobia(gameId, round, db) {
  const update = db?.update || storageUpdate;
  const now = Date.now();
  return update(gameId, acrophobiaKey(round), (fresh) => acrophobiaTransition(fresh, now));
}

// Continuous, no elimination — same shape as
// lib/games/wagerTriviaTvData.js's own placementValue (a plain running
// score, floor-free, since a phrase can never lose points here the way
// a wrong Wager Trivia answer can).
export function placementValue(state, playerId) {
  return state.scores?.[playerId] || 0;
}

export const ACROPHOBIA_SUBMIT_WINDOW_MS = SUBMIT_WINDOW_MS;
export const ACROPHOBIA_VOTE_WINDOW_MS = VOTE_WINDOW_MS;
export const ACROPHOBIA_RESOLVED_DISPLAY_MS = RESOLVED_DISPLAY_MS;
export const ACROPHOBIA_WINNER_BONUS = WINNER_BONUS;
