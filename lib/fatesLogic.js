// ============================================================
// Pure logic for the Fates Ceremony — the top-3 finishers each nominate
// one player for potential exile.
//
// Rules encoded here:
//   - A nominator cannot nominate themselves.
//   - A nominator cannot nominate the challenge winner (1st place) — the
//     winner has immunity from nomination as well as the vote.
//   - Nominations happen in finishing order: 1st-place-finisher-among-the-
//     top-3 nominates first, then 2nd, then 3rd.
//   - Nominees must be distinct — nominators can see each other's already-
//     submitted picks live, and can't choose someone another nominator has
//     already locked in. (Previously nominees didn't have to be distinct;
//     this was changed so all three nominations put a different player at
//     risk each round.)
// ============================================================

export function isValidNomination(nominatorId, nomineeId, winnerId, takenIds) {
  if (!nomineeId) return { ok: false, error: "Choose a nominee." };
  if (nomineeId === nominatorId) return { ok: false, error: "You can't nominate yourself." };
  if (nomineeId === winnerId) return { ok: false, error: "You can't nominate the battle winner — they're immune." };
  if (takenIds && takenIds.has(nomineeId)) return { ok: false, error: "Already nominated by someone else." };
  return { ok: true };
}

// nominations: { [nominatorId]: nomineeId }
export function nominationsComplete(nominatorOrder, nominations) {
  return (nominatorOrder || []).every((n) => !!nominations?.[n.playerId]);
}

// Nominee ids already locked in by nominators OTHER than the given one —
// used so nominators see each other's picks live and can't duplicate one
// another's choice. Excludes the given nominator's own pick (if they've
// already submitted), since re-selecting your own choice isn't a conflict.
export function takenNomineeIds(nominations, excludeNominatorId) {
  const ids = new Set();
  Object.entries(nominations || {}).forEach(([nominatorId, nomineeId]) => {
    if (nominatorId !== excludeNominatorId && nomineeId) ids.add(nomineeId);
  });
  return ids;
}

// Returns the distinct set of nominees, in the order they were first
// nominated (nominatorOrder is already in finishing-place order).
export function distinctNominees(nominatorOrder, nominations, playersById) {
  const seen = [];
  (nominatorOrder || []).forEach((n) => {
    const nomineeId = nominations?.[n.playerId];
    if (nomineeId && !seen.some((x) => x.playerId === nomineeId)) {
      seen.push({ playerId: nomineeId, name: playersById?.[nomineeId] || "?" });
    }
  });
  return seen;
}
