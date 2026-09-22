import { storageSet, storageUpdate, subscribeGameState } from "../gameStorage";
import { pickQuestionTexts, pairQuestions, buildQuestionSet } from "./majorityRulesShared";

// ─── Majority Rules — Big Screen ───
// Same forced-choice-between-two-alive-players mechanic as the regular
// mode (see lib/games/majorityRulesData.js and lib/games/
// majorityRulesShared.js for the bank + pairing algorithm both modes
// share), but sequential and live instead of all-at-once-then-reveal-
// later: one question at a time on the shared TV, everyone answers on
// their own phone, the majority and every player's pick reveal
// immediately, then it moves on. Same phase-driven shape as
// lib/games/wagerTriviaTvData.js ("answering" -> "revealed" -> next) and
// the same simultaneous-secret-choice/decision-window pattern as
// lib/games/goldenFleeceData.js (submitChoice/tickMajorityRulesTv,
// belt-and-suspenders polling from the TV, every phone, AND
// lib/roundEngine.js's own housekeeping tick).
//
// After the initial 8 questions, ties at the top go to sudden death:
// one extra question at a time, drawn from whatever's left of the
// 23-question bank (falling back to reusing already-asked prompts with
// a fresh pairing once that runs out — see
// majorityRulesShared.js's pickQuestionTexts for why that's a safe,
// explicitly-allowed simplification rather than something to guard
// harder against). EVERY player keeps answering sudden-death questions
// (there's no reason to leave anyone out of the fun just because
// they're not in contention), but only the still-tied leaders' points
// count toward breaking the actual tie.
export const majorityRulesTvKey = (round) => `pb:majorityrulestv:${round}`;
const key = majorityRulesTvKey;

export function subscribeMajorityRulesTv(gameId, round, onChange) {
  return subscribeGameState(gameId, key(round), onChange);
}

export const INITIAL_QUESTIONS = 8;
const REVEAL_DISPLAY_MS = 7000;
const MAX_SUDDEN_DEATH_QUESTIONS = 5;

// Same target-turns-into-a-window approach as
// lib/games/goldenFleeceData.js's own decisionWindowMs — sized so a
// typical battle length lands on a readable per-question window without
// needing a host to babysit anyone's phone. This battle runs roughly
// 8-13 questions total (8 initial + up to 5 sudden-death, each also
// followed by a reveal pause — see REVEAL_DISPLAY_MS above), so the
// divisor here is smaller than Golden Fleece's own (which budgets for
// many more, shorter decisions per chamber).
export function decisionWindowMs(settings) {
  const totalSec = settings?.challengeDurationSec || 600;
  const perQuestionSec = Math.max(15, Math.min(30, totalSec / 10));
  return perQuestionSec * 1000;
}

export async function initMajorityRulesTv(gameId, round, participants, now, db) {
  const set = db?.set || storageSet;
  const participantIds = participants.map((p) => p.id);
  const participantNames = {};
  participants.forEach((p) => { participantNames[p.id] = p.name; });
  const questions = buildQuestionSet(participants, INITIAL_QUESTIONS);
  const scores = {};
  participantIds.forEach((id) => { scores[id] = 0; });

  await set(gameId, key(round), {
    participantIds,
    participantNames,
    questions, // the 8 initial questions, in play order
    usedTexts: questions.map((q) => q.text), // grows with each sudden-death draw too, so a later draw doesn't immediately repeat one already asked this battle
    questionIndex: 0,
    question: questions[0],
    phase: "answering", // "answering" | "revealed"
    phaseStartedAt: now,
    answers: {}, // playerId -> "A"|"B", THIS question only — reset every question
    scores, // cumulative, 1 point per question where a player's answer matched that question's majority
    history: [], // resolved questions in order — { id, text, playerAId, playerBId, playerAName, playerBName, majoritySide, tallyA, tallyB, answers }
    suddenDeath: false,
    tiedLeaderIds: [], // fixed for the duration of a given sudden-death run — see advanceAfterReveal below
    tiebreakScores: {}, // only ever populated for tiedLeaderIds
    suddenDeathCount: 0,
    gameEnded: false,
    winnerIds: [],
  });
}

// Draws exactly one fresh question against every current participant
// (not just the tied leaders — everyone keeps playing sudden death, see
// this file's own header comment) from whatever the bank has left
// unused this battle.
function drawSuddenDeathQuestion(fresh) {
  const alivePlayers = fresh.participantIds.map((id) => ({ id }));
  const [text] = pickQuestionTexts(1, Math.random, fresh.usedTexts);
  const [question] = pairQuestions([text], alivePlayers, Math.random);
  return question;
}

// Fast-path resolve like lib/games/goldenFleeceData.js's own
// submitChoice — if this was the last participant's answer, resolve
// immediately in this same write instead of waiting for the next poll.
export async function submitChoice(gameId, round, playerId, choice) {
  return storageUpdate(gameId, key(round), (fresh) => {
    if (!fresh || fresh.gameEnded) return fresh;
    if (fresh.phase !== "answering") return fresh;
    if (!fresh.participantIds.includes(playerId)) return fresh;
    if (fresh.answers[playerId]) return fresh;
    if (choice !== "A" && choice !== "B") return fresh;
    const next = { ...fresh, answers: { ...fresh.answers, [playerId]: choice } };
    const everyoneIn = fresh.participantIds.every((id) => !!next.answers[id]);
    return everyoneIn ? resolveQuestion(next) : next;
  });
}

// Pure function of the current state — tallies the CURRENT question
// among whoever actually answered it (a player who never answered
// simply isn't counted either way, same "not deciding costs you
// nothing, but earns you nothing either" shape as the regular mode's
// own finalize step). A tie in the tally means no majority side, so
// nobody scores a point for that question.
function resolveQuestion(fresh) {
  const q = fresh.question;
  const answers = fresh.answers;
  let tallyA = 0;
  let tallyB = 0;
  fresh.participantIds.forEach((id) => {
    if (answers[id] === "A") tallyA += 1;
    else if (answers[id] === "B") tallyB += 1;
  });
  const majoritySide = tallyA > tallyB ? "A" : tallyB > tallyA ? "B" : null;

  const nextScores = { ...fresh.scores };
  const nextTiebreak = { ...fresh.tiebreakScores };
  fresh.participantIds.forEach((id) => {
    const matched = !!majoritySide && answers[id] === majoritySide;
    if (matched) {
      nextScores[id] = (nextScores[id] || 0) + 1;
      if (fresh.suddenDeath && fresh.tiedLeaderIds.includes(id)) {
        nextTiebreak[id] = (nextTiebreak[id] || 0) + 1;
      }
    }
  });

  const historyEntry = {
    id: q.id, text: q.text,
    playerAId: q.playerAId, playerBId: q.playerBId,
    playerAName: fresh.participantNames[q.playerAId] || "?",
    playerBName: fresh.participantNames[q.playerBId] || "?",
    majoritySide, tallyA, tallyB,
    answers: { ...answers },
    suddenDeath: fresh.suddenDeath,
  };

  return {
    ...fresh,
    scores: nextScores,
    tiebreakScores: nextTiebreak,
    history: [...fresh.history, historyEntry],
    phase: "revealed",
    phaseStartedAt: Date.now(),
  };
}

// Runs once the reveal pause has elapsed — decides whether there's
// another initial question, whether it's time to check for a tie and
// possibly enter sudden death, or whether a sudden-death question just
// broke (or failed to break) the tie.
function advanceAfterReveal(fresh) {
  const now = Date.now();

  if (!fresh.suddenDeath) {
    const nextIndex = fresh.questionIndex + 1;
    if (nextIndex < fresh.questions.length) {
      return {
        ...fresh,
        questionIndex: nextIndex,
        question: fresh.questions[nextIndex],
        phase: "answering",
        phaseStartedAt: now,
        answers: {},
      };
    }

    // All 8 initial questions are done — find the leader(s).
    const maxScore = Math.max(...fresh.participantIds.map((id) => fresh.scores[id] || 0));
    const leaders = fresh.participantIds.filter((id) => (fresh.scores[id] || 0) === maxScore);
    if (leaders.length <= 1) {
      return { ...fresh, gameEnded: true, winnerIds: leaders };
    }

    const tiebreakScores = {};
    leaders.forEach((id) => { tiebreakScores[id] = 0; });
    const sdQuestion = drawSuddenDeathQuestion(fresh);
    return {
      ...fresh,
      suddenDeath: true,
      tiedLeaderIds: leaders,
      tiebreakScores,
      suddenDeathCount: 1,
      usedTexts: [...fresh.usedTexts, sdQuestion.text],
      question: sdQuestion,
      phase: "answering",
      phaseStartedAt: now,
      answers: {},
    };
  }

  // Already in sudden death — tiedLeaderIds is the FIXED original tied
  // group for this whole tiebreaker run (deliberately never narrowed
  // question-to-question — see this file's own header comment): each
  // reveal just re-checks who, among that same group, currently holds
  // the max tiebreakScores.
  const maxTiebreak = Math.max(...fresh.tiedLeaderIds.map((id) => fresh.tiebreakScores[id] || 0));
  const contenders = fresh.tiedLeaderIds.filter((id) => (fresh.tiebreakScores[id] || 0) === maxTiebreak);

  if (contenders.length <= 1) {
    return { ...fresh, gameEnded: true, winnerIds: contenders };
  }
  if (fresh.suddenDeathCount >= MAX_SUDDEN_DEATH_QUESTIONS) {
    // Safety valve: still tied after a generous number of tiebreaker
    // questions — end it tied and let the app's normal
    // reportScore/finishedAt-order fallback (see
    // lib/challenges/scores.js's scoresToPlacements) resolve who's
    // actually listed first, by whoever locked in earliest.
    return { ...fresh, gameEnded: true, winnerIds: contenders };
  }

  const sdQuestion = drawSuddenDeathQuestion(fresh);
  return {
    ...fresh,
    suddenDeathCount: fresh.suddenDeathCount + 1,
    usedTexts: [...fresh.usedTexts, sdQuestion.text],
    question: sdQuestion,
    phase: "answering",
    phaseStartedAt: now,
    answers: {},
  };
}

// The authoritative tick — called on its own short interval by both the
// TV display and every active player's own phone, AND from
// lib/roundEngine.js's housekeeping pass (same three-way redundancy as
// lib/games/goldenFleeceData.js's own tickGoldenFleece). No-ops unless
// the current phase has genuinely either been fully answered or timed
// out — safe to call as often as anyone likes.
export async function tickMajorityRulesTv(gameId, round, settings, db) {
  const update = db?.update || storageUpdate;
  const now = Date.now();
  return update(gameId, key(round), (fresh) => {
    if (!fresh || fresh.gameEnded) return fresh;
    if (fresh.phase === "answering") {
      const everyoneIn = fresh.participantIds.length > 0 && fresh.participantIds.every((id) => !!fresh.answers[id]);
      const timedOut = now - fresh.phaseStartedAt >= decisionWindowMs(settings);
      if (!everyoneIn && !timedOut) return fresh;
      return resolveQuestion(fresh);
    }
    if (fresh.phase === "revealed") {
      if (now - fresh.phaseStartedAt < REVEAL_DISPLAY_MS) return fresh;
      return advanceAfterReveal(fresh);
    }
    return fresh;
  });
}

// The value reported via reportScore (see
// components/games/MajorityRulesTvPlayer.jsx, which self-reports on
// every score change and once more, final, on gameEnded — same pattern
// as lib/games/goldenFleeceData.js's own placementValue/GoldenFleecePlayer
// pairing) — and what lib/roundEngine.js's autoLockResolvedScores safety
// net falls back to computing directly if a player's own phone was never
// open to report it itself.
//
// Outside sudden death (or for anyone not among the tied leaders once
// it starts), this is just the plain cumulative score. For a tied
// leader mid- or post-sudden-death, a small fractional bonus derived
// from their tiebreakScores is folded in — never enough to change their
// ranking relative to anyone OUTSIDE the tied group (whose base scores
// are, by construction, already lower), but exactly enough to correctly
// rank the tied leaders against EACH OTHER once the tiebreaker starts
// separating them. Two tied leaders still exactly tied on
// tiebreakScores (including the safety-valve case where sudden death
// runs out its cap still tied) report equal values here, which is
// exactly right — scoresToPlacements' own finishedAt tiebreak (who
// locked in first) is what decides the final ordering between them at
// that point, not this function.
export function placementValue(state, playerId) {
  const base = state?.scores?.[playerId] || 0;
  if (!state?.suddenDeath || !(state.tiedLeaderIds || []).includes(playerId)) return base;
  const tiebreak = state.tiebreakScores?.[playerId] || 0;
  return base + tiebreak / 1000;
}
