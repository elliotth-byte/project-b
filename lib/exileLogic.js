// ============================================================
// Pure logic for the Exile Vote. No storage dependency.
//
// Two modes:
//  - "eliminate" (the normal round): everyone votes to eliminate one of
//    the fate nominees. Power of Khaos nullifies all votes AGAINST its
//    chosen nominee (i.e. that nominee can't be exiled this round no
//    matter how many votes they got). Most votes among the rest = exiled.
//    Ties broken by the Power of Khaos holder.
//  - "save" (a double-elimination round, triggered by a successful
//    re-entry that same round): everyone votes to SAVE one of the fate
//    nominees instead. Power of Khaos nullifies all of its chosen
//    nominee's save-votes outright (0 counted, guaranteeing elimination).
//    The nominee with the FEWEST counted save-votes among the rest is
//    ALSO eliminated — two exiled this round. Ties for fewest broken by
//    the Power of Khaos holder.
//
// voteRows: [{ voterId, voterName, targetId, targetName }]
// nomineeIds: the (up to 3) fate nominees this round, as an array of ids.
// ============================================================

function tally(voteRows, nomineeIds) {
  const counts = {};
  nomineeIds.forEach((id) => (counts[id] = 0));
  (voteRows || []).forEach((r) => {
    if (counts[r.targetId] !== undefined) counts[r.targetId] += 1;
  });
  return counts;
}

function rankDesc(counts) {
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

// ─── "eliminate" mode ───
export function computeEliminateOutcome(voteRows, nullifiedNomineeId, nomineeIds) {
  const raw = tally(voteRows, nomineeIds);
  // A nullified nominee's votes are voided — they simply can't be chosen,
  // regardless of count, so drop them from contention entirely.
  const contenders = nomineeIds.filter((id) => id !== nullifiedNomineeId);
  const counts = {};
  contenders.forEach((id) => (counts[id] = raw[id] || 0));
  const ranked = rankDesc(counts);

  if (ranked.length === 0) {
    return { tally: raw, contenders, ranked, topCount: 0, tied: [], needsTieBreak: false, exiledId: null };
  }

  const topCount = ranked[0][1];
  const tied = ranked.filter(([, c]) => c === topCount).map(([id]) => id);

  return {
    tally: raw,
    contenders,
    ranked,
    topCount,
    tied,
    needsTieBreak: tied.length > 1,
    exiledId: tied.length === 1 ? tied[0] : null,
  };
}

export function resolveEliminateTie(tiedIds, chaosHolderChoiceId) {
  if (!tiedIds.includes(chaosHolderChoiceId)) return null;
  return chaosHolderChoiceId;
}

// ─── "save" mode (double elimination) ───
export function computeSaveOutcome(voteRows, nullifiedNomineeId, nomineeIds) {
  const raw = tally(voteRows, nomineeIds);
  const nonNullified = nomineeIds.filter((id) => id !== nullifiedNomineeId);
  const counts = {};
  nonNullified.forEach((id) => (counts[id] = raw[id] || 0));
  const rankedAsc = Object.entries(counts).sort((a, b) => a[1] - b[1]);

  if (rankedAsc.length === 0) {
    // Only one distinct nominee existed and they were the nullified one —
    // both "eliminations" collapse onto that single person.
    return {
      tally: raw, nonNullified, rankedAsc, lowestCount: null, tied: [],
      needsTieBreak: false,
      exiledIds: nullifiedNomineeId ? [nullifiedNomineeId] : [],
      savedId: null,
    };
  }

  const lowestCount = rankedAsc[0][1];
  const tied = rankedAsc.filter(([, c]) => c === lowestCount).map(([id]) => id);
  const savedId = rankedAsc.length > 1 ? rankedAsc[rankedAsc.length - 1][0] : null;

  return {
    tally: raw,
    nonNullified,
    rankedAsc,
    lowestCount,
    tied,
    needsTieBreak: tied.length > 1,
    exiledIds: tied.length === 1 ? [nullifiedNomineeId, tied[0]].filter(Boolean) : [nullifiedNomineeId].filter(Boolean),
    savedId: tied.length === 1 ? savedId : null,
  };
}

export function resolveSaveTie(tiedIds, chaosHolderChoiceId, nullifiedNomineeId) {
  if (!tiedIds.includes(chaosHolderChoiceId)) return null;
  return [nullifiedNomineeId, chaosHolderChoiceId].filter(Boolean);
}

// ─── Dramatic reveal ordering ───
// Every vote gets read — nothing is ever skipped once it's clear who's
// safe, unlike some real-show conventions. What's randomized is HOW they
// get there: votes are grouped by target only to guarantee the actual
// outcome (whichever target ended up with the most votes) is the very
// last group revealed — that's the one structural rule that can't move,
// or the "reveal" wouldn't build to anything. Everything else is
// shuffled and interleaved across different targets, specifically so a
// player can't just mentally tally "3 for Alex, 1 for Sam" as each
// target's votes come out as an obvious consecutive block — the whole
// point is nobody should be able to call the result with several votes
// still unread.
// Running vote count for the ceremony's tally board — based ONLY on
// the votes revealed so far (a prefix of the full reveal order), not
// the final result. Every nominee is included from the start, even at
// zero, so the board is a fixed set of rows filling in as the reveal
// goes, not new rows appearing only once someone gets their first
// vote — that's what makes it read as a running tally rather than a
// list of votes-so-far.
export function tallySoFar(revealedRows, nomineeIds) {
  const counts = {};
  (nomineeIds || []).forEach((id) => { counts[id] = 0; });
  (revealedRows || []).forEach((r) => {
    if (counts[r.targetId] !== undefined) counts[r.targetId] += 1;
  });
  return counts;
}

export function buildRevealOrder(voteRows) {
  const rows = [...(voteRows || [])];
  if (rows.length === 0) return [];

  const byTarget = {};
  rows.forEach((r) => { (byTarget[r.targetId] = byTarget[r.targetId] || []).push(r); });
  const maxCount = Math.max(...Object.values(byTarget).map((arr) => arr.length));

  const finalGroup = [];
  const earlierGroup = [];
  Object.values(byTarget).forEach((arr) => {
    (arr.length === maxCount ? finalGroup : earlierGroup).push(...arr);
  });

  return [...shuffle(earlierGroup), ...shuffle(finalGroup)];
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Finale: vote FOR a winner among the final 3 ───
// voteRows here are votes cast by EXILED players (not the finalists),
// each voting for which finalist should win. The chaos-nullified finalist
// can never win no matter how many votes they got; the winner is whichever
// of the remaining two finalists has more counted votes. A tie between
// those two is broken by the exiled Power of Khaos holder's own choice.
export function computeFinaleOutcome(voteRows, nullifiedFinalistId, finalistIds, tieBreakChoiceId) {
  const raw = tally(voteRows, finalistIds);
  const contenders = finalistIds.filter((id) => id !== nullifiedFinalistId);
  const counts = {};
  contenders.forEach((id) => (counts[id] = raw[id] || 0));
  const ranked = rankDesc(counts);
  const topCount = ranked[0]?.[1] ?? 0;
  const tied = ranked.filter(([, c]) => c === topCount).map(([id]) => id);
  // needsTieBreak stays a pure function of the tally alone, same as
  // before — callers that need "is this STILL actually unresolved"
  // still combine it with their own "...&& !tieBreakChoiceId" check
  // (see FinaleHost.jsx's tieBreakUnresolved), unchanged.
  const needsTieBreak = tied.length > 1;
  const winnerId = !needsTieBreak ? (tied[0] || null) : (tieBreakChoiceId && tied.includes(tieBreakChoiceId) ? tieBreakChoiceId : null);

  // Full 1st/2nd/3rd — only resolvable once there's an actual winner
  // (no tie, or the tie's been broken). The nullified finalist, if any,
  // is ALWAYS placed 3rd regardless of their actual vote count —
  // "cancelling their votes" means wiping their own standing entirely,
  // not just blocking them from winning; they can't back into 2nd just
  // because they out-polled the other non-winning finalist.
  let placements = null;
  if (winnerId) {
    const runnerUpId = contenders.find((id) => id !== winnerId) || null;
    placements = [
      { playerId: winnerId, place: 1 },
      ...(runnerUpId ? [{ playerId: runnerUpId, place: 2 }] : []),
      ...(nullifiedFinalistId ? [{ playerId: nullifiedFinalistId, place: 3 }] : []),
    ];
  }

  return { tally: raw, contenders, ranked, tied, needsTieBreak, winnerId, placements };
}
