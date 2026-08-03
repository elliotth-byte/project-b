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
//   - (Nominees do NOT have to be distinct — the rules never say a nominee
//     can't be nominated twice by two different nominators; if that
//     happens there are simply fewer than 3 people at risk this round.)
// ============================================================

export function isValidNomination(nominatorId, nomineeId, winnerId) {
  if (!nomineeId) return { ok: false, error: "Choose a nominee." };
  if (nomineeId === nominatorId) return { ok: false, error: "You can't nominate yourself." };
  if (nomineeId === winnerId) return { ok: false, error: "You can't nominate the challenge winner — they're immune." };
  return { ok: true };
}

// nominations: { [nominatorId]: nomineeId }
export function nominationsComplete(nominatorOrder, nominations) {
  return (nominatorOrder || []).every((n) => !!nominations?.[n.playerId]);
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
