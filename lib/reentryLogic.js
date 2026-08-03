// ============================================================
// Exile & Re-Entry — pure logic, no storage dependency.
//
// Rules encoded here:
//   - Every exiled player gets exactly ONE re-entry attempt, ever — they
//     can opt into any single challenge that happens after their exile.
//   - If they come in 1st in that challenge, they return to the game.
//     If not, they're eliminated forever (no further attempts).
//   - A successful return makes THAT SAME ROUND a double-elimination
//     Exile Vote (see lib/exileLogic.js "save" mode).
// ============================================================

export const REENTRY_STATUS = {
  PENDING: "pending", // exiled, hasn't used their one shot yet
  COMPETING: "competing", // opted into the challenge currently running
  RETURNED: "returned", // won a challenge, back in the game
  ELIMINATED_FOREVER: "eliminated_forever", // used their shot and lost
};

export function canAttemptReentry(entry) {
  return entry && entry.status === REENTRY_STATUS.PENDING;
}

// Called once a challenge with a re-entry attempt finishes.
// placements: this round's challenge placements, including the attempting
// exile mixed in with the regular alive-player field.
export function resolveReentryAttempt(entry, placements) {
  const mine = (placements || []).find((p) => p.playerId === entry.playerId);
  if (!mine) return { ...entry, status: REENTRY_STATUS.ELIMINATED_FOREVER };
  if (mine.place === 1) return { ...entry, status: REENTRY_STATUS.RETURNED };
  return { ...entry, status: REENTRY_STATUS.ELIMINATED_FOREVER };
}
