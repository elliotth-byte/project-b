// "Battle winner" here means has won AT LEAST ONE battle this season
// (cumulative, from KEY_CHALLENGE_HISTORY), not just the most recent —
// immunity from an earlier win doesn't carry forward to later rounds, so
// a past winner can absolutely be nominated again later. That's exactly
// what makes the combined "orange" case reachable at all; if "winner"
// only meant "most recent," a current immunity holder could never
// simultaneously be a current nominee (except the Final Four's
// automatic-nominate-everyone-else case, which excludes the winner
// themselves anyway).
//
// "Nominee" means named in the CURRENT round's exile state, whatever its
// stage (still voting or already revealed) — scoped to the live round so
// it naturally goes stale once that round's exile resolves and the next
// round begins.
export function computeWinnerAndNomineeIds(challengeHistory, exile, currentRound) {
  const winnerIds = new Set();
  (challengeHistory || []).forEach((entry) => {
    if (entry.winnerId) winnerIds.add(entry.winnerId);
  });

  const nomineeIds = new Set();
  if (exile && exile.round === currentRound) {
    (exile.nominees || []).forEach((n) => nomineeIds.add(n.playerId));
  }

  return { winnerIds, nomineeIds };
}
