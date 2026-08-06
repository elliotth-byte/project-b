// ============================================================
// Exile & Re-Entry — pure logic, no storage dependency.
//
// Rules encoded here:
//   - Every exiled player gets exactly ONE re-entry attempt, ever. Each
//     challenge that happens while they're still eligible, they choose —
//     deliberately, per challenge — whether to opt in or sit it out (see
//     lib/reentryData.js's setReentryDecision). Not deciding by the time
//     every alive competitor finishes counts as opting OUT for that one
//     challenge specifically — it does NOT use up their shot.
//   - If they opt in and come in 1st in that challenge, they return to
//     the game. If they opt in and don't come in 1st, their one shot is
//     used up — they're eliminated forever.
//   - A successful return makes THAT SAME ROUND a double-elimination
//     Exile Vote (see lib/exileLogic.js "save" mode).
// ============================================================

export const REENTRY_STATUS = {
  PENDING: "pending", // exiled, hasn't used their one shot yet
  COMPETING: "competing", // opted into the challenge currently running
  RETURNED: "returned", // won a challenge, back in the game
  ELIMINATED_FOREVER: "eliminated_forever", // opted in, didn't get 1st — shot's used up
};

export function canAttemptReentry(entry) {
  return entry && entry.status === REENTRY_STATUS.PENDING;
}

// Called once a challenge with a re-entry attempt finishes.
// placements: this round's challenge placements, including the attempting
// exile(s) mixed in with the regular alive-player field.
export function resolveReentryAttempt(entry, placements) {
  const mine = (placements || []).find((p) => p.playerId === entry.playerId);
  if (mine?.place === 1) return { ...entry, status: REENTRY_STATUS.RETURNED };
  return { ...entry, status: REENTRY_STATUS.ELIMINATED_FOREVER };
}
