import { storageSet, storageUpdate, storageGet, subscribeGameState } from "../gameStorage";
import { KEY_CHALLENGE } from "../gameState";
import { reportScore } from "../challenges/scores";
import { buildQuestionSet } from "./majorityRulesShared";

// ─── Majority Rules (regular mode) ───
// Every alive player gets the SAME 8 forced-choice questions (see
// lib/games/majorityRulesShared.js for the bank + pairing algorithm,
// each question pitting two currently-alive players against each
// other), all sent at once — a player answers all 8 privately on their
// own phone, then locks the whole set in as a single action. Nobody
// sees any tally or majority result at the time; the whole point is
// that everyone's guessing blind at what the ROOM thinks, not reacting
// to each other. The reveal — who the majority actually picked for each
// question, and how each player did against it — only ever shows up
// later, on the History tab (see lib/roundEngine.js's own comment on
// where that reveal payload gets attached to the standard challenge-
// history entry, and components/CeremonyCards.jsx's ChallengeResultsCard
// for where it renders).
//
// Same phase-driven, finalize-once shape as every other shared-state
// battle here (see lib/games/wagerTriviaTvData.js's own header comment)
// — just with a single "everyone locks in, then finalize" step instead
// of a phase machine, since there's no sequential reveal in this mode.
export const majorityRulesKey = (round) => `pb:majorityrules:${round}`;
const key = majorityRulesKey;

export function subscribeMajorityRules(gameId, round, onChange) {
  return subscribeGameState(gameId, key(round), onChange);
}

export const QUESTIONS_PER_ROUND = 8;

export async function initMajorityRules(gameId, round, participants, now, db) {
  const set = db?.set || storageSet;
  const participantIds = participants.map((p) => p.id);
  const participantNames = {};
  participants.forEach((p) => { participantNames[p.id] = p.name; });
  const questions = buildQuestionSet(participants, QUESTIONS_PER_ROUND);
  await set(gameId, key(round), {
    participantIds,
    participantNames,
    questions,
    answers: {}, // playerId -> ["A"|"B", ...] (length === questions.length), only ever set all at once
    locked: {}, // playerId -> Date.now() they locked in
    finalized: false,
    results: null, // { perQuestion: [{ majoritySide, tallyA, tallyB }], pointsByPlayer: { [playerId]: number } }
    startedAt: now,
  });
}

// A player locks in their whole answer set in one action — no partial
// submits, no double-submit (checked via `locked`, same "silent no-op
// once already decided" convention every other blind-choice game here
// uses, e.g. lib/games/goldenFleeceData.js's submitChoice).
export async function submitMajorityRulesAnswers(gameId, round, playerId, answersArray) {
  return storageUpdate(gameId, key(round), (fresh) => {
    if (!fresh || fresh.finalized) return fresh;
    if (!fresh.participantIds.includes(playerId)) return fresh;
    if (fresh.locked[playerId]) return fresh;
    if (!Array.isArray(answersArray) || answersArray.length !== fresh.questions.length) return fresh;
    if (!answersArray.every((a) => a === "A" || a === "B")) return fresh;
    return {
      ...fresh,
      answers: { ...fresh.answers, [playerId]: answersArray },
      locked: { ...fresh.locked, [playerId]: Date.now() },
    };
  });
}

// Pure function of the current state — tallies each question among only
// the players who actually locked in (never-locked players score 0 and
// aren't counted toward any question's majority), and a tie in a given
// question's tally means NO majority for it that round (nobody scores a
// point for it, matching-wise, since there's no majority side to match).
function finalizeMajorityRules(fresh) {
  const lockedIds = fresh.participantIds.filter((id) => !!fresh.locked[id]);

  const perQuestion = fresh.questions.map((q, i) => {
    let tallyA = 0;
    let tallyB = 0;
    lockedIds.forEach((id) => {
      const ans = fresh.answers[id]?.[i];
      if (ans === "A") tallyA += 1;
      else if (ans === "B") tallyB += 1;
    });
    const majoritySide = tallyA > tallyB ? "A" : tallyB > tallyA ? "B" : null;
    return { majoritySide, tallyA, tallyB };
  });

  const pointsByPlayer = {};
  fresh.participantIds.forEach((id) => {
    if (!fresh.locked[id]) { pointsByPlayer[id] = 0; return; }
    let points = 0;
    fresh.questions.forEach((q, i) => {
      const majoritySide = perQuestion[i].majoritySide;
      if (majoritySide && fresh.answers[id]?.[i] === majoritySide) points += 1;
    });
    pointsByPlayer[id] = points;
  });

  return { ...fresh, results: { perQuestion, pointsByPlayer }, finalized: true };
}

// The authoritative tick — called on its own short interval by the
// player's own phone AND from lib/roundEngine.js's housekeeping pass
// (same belt-and-suspenders redundancy as every other shared timed
// battle here — see lib/games/wagerTriviaTvData.js's own header
// comment). Finalizes the instant every alive participant has locked
// in, or once the outer challenge's own endsAt has passed, whichever
// comes first — reads KEY_CHALLENGE directly for that deadline rather
// than threading it through every caller's own settings object, the
// same way this function's own caller threads `db` through for the
// server-side housekeeping path. Calling this after it's already
// finalized is a safe, cheap no-op.
export async function tickMajorityRules(gameId, round, settings, db) {
  const update = db?.update || storageUpdate;
  const get = db?.get || storageGet;
  const challenge = await get(gameId, KEY_CHALLENGE);
  const now = Date.now();

  let justFinalized = false;
  const res = await update(gameId, key(round), (fresh) => {
    if (!fresh || fresh.finalized) return fresh;
    const allLocked = fresh.participantIds.length > 0 && fresh.participantIds.every((id) => !!fresh.locked[id]);
    const timedOut = !!challenge?.endsAt && now >= challenge.endsAt;
    if (!allLocked && !timedOut) return fresh;
    justFinalized = true;
    return finalizeMajorityRules(fresh);
  });

  // Report every participant's final score in the same write that
  // finalized the round — not on every later tick call (finalized is
  // sticky, so a repeat tick would otherwise re-run this loop forever,
  // harmlessly but pointlessly, since reportScore's own `locked` guard
  // already makes each individual call idempotent).
  if (justFinalized && res.ok) {
    const state = res.value;
    for (const playerId of state.participantIds) {
      const points = state.results.pointsByPlayer[playerId] || 0;
      await reportScore(gameId, round, playerId, state.participantNames?.[playerId] || "?", points, { final: true });
    }
  }

  return res;
}

// Chat/DM gate (see components/ChatPanel.jsx) — a player who hasn't
// locked in their 8 answers yet can't chat, so nobody can fish for
// hints about how the room's leaning before committing. Once they've
// locked in (or the round's finalized entirely), chat opens back up for
// them regardless of what anyone else has done.
export function isMajorityRulesChatLocked(state, playerId) {
  if (!state) return false;
  if (state.finalized) return false;
  if (!state.participantIds?.includes(playerId)) return false;
  return !state.locked?.[playerId];
}
