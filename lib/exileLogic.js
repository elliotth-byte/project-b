// ============================================================
// Pure logic for the Exile Vote. No storage dependency.
//
// Two modes:
//  - "eliminate" (the normal round): everyone votes to eliminate one of
//    the fate nominees. Power of Chaos nullifies all votes AGAINST its
//    chosen nominee (i.e. that nominee can't be exiled this round no
//    matter how many votes they got). Most votes among the rest = exiled.
//    Ties broken by the Power of Chaos holder.
//  - "save" (a double-elimination round, triggered by a successful
//    re-entry that same round): everyone votes to SAVE one of the fate
//    nominees instead. Power of Chaos nullifies all of its chosen
//    nominee's save-votes outright (0 counted, guaranteeing elimination).
//    The nominee with the FEWEST counted save-votes among the rest is
//    ALSO eliminated — two exiled this round. Ties for fewest broken by
//    the Power of Chaos holder.
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
// Simple, suspenseful order: shuffle within same-target groups, singleton
// votes revealed first, the decisive/last vote against the eventual
// outcome revealed last. Lighter-weight than the original Traitors reveal
// algorithm since exile votes are simpler (no reasons attached).
export function buildRevealOrder(voteRows) {
  const rows = [...(voteRows || [])];
  const byTarget = {};
  rows.forEach((r) => { (byTarget[r.targetId] = byTarget[r.targetId] || []).push(r); });
  const counts = Object.entries(byTarget).map(([id, arr]) => [id, arr.length]).sort((a, b) => a[1] - b[1]);
  const order = [];
  counts.forEach(([id]) => order.push(...byTarget[id]));
  return order;
}

// ─── Finale: vote FOR a winner among the final 3 ───
// voteRows here are votes cast by EXILED players (not the finalists),
// each voting for which finalist should win. The chaos-nullified finalist
// can never win no matter how many votes they got; the winner is whichever
// of the remaining two finalists has more counted votes. A tie between
// those two is broken by the exiled Power of Chaos holder's own choice.
export function computeFinaleOutcome(voteRows, nullifiedFinalistId, finalistIds) {
  const raw = tally(voteRows, finalistIds);
  const contenders = finalistIds.filter((id) => id !== nullifiedFinalistId);
  const counts = {};
  contenders.forEach((id) => (counts[id] = raw[id] || 0));
  const ranked = rankDesc(counts);
  const topCount = ranked[0]?.[1] ?? 0;
  const tied = ranked.filter(([, c]) => c === topCount).map(([id]) => id);
  return {
    tally: raw,
    contenders,
    ranked,
    tied,
    needsTieBreak: tied.length > 1,
    winnerId: tied.length === 1 ? tied[0] : null,
  };
}
