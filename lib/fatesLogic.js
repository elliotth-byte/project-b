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

export function isValidNomination(nominatorId, nomineeId, winnerId, takenIds, aphroditeBlockedId, aresImmuneId) {
  if (!nomineeId) return { ok: false, error: "Choose a nominee." };
  if (nomineeId === nominatorId) return { ok: false, error: "You can't nominate yourself." };
  if (nomineeId === winnerId) return { ok: false, error: "You can't nominate the battle winner — they're immune." };
  if (takenIds && takenIds.has(nomineeId)) return { ok: false, error: "Already nominated by someone else." };
  // Aphrodite's character power (see lib/characterPowers.js): whoever
  // she named in round 1 can never nominate her, for the rest of the
  // season.
  if (aphroditeBlockedId && nomineeId === aphroditeBlockedId) return { ok: false, error: "Protected by Aphrodite — you can never nominate her." };
  // Ares's character power: immune from nomination for one round after
  // his current target gets exiled.
  if (aresImmuneId && nomineeId === aresImmuneId) return { ok: false, error: "Immune this round — Ares's power." };
  return { ok: true };
}

// True once every nominator ranked ABOVE this one (lower `place` number
// finishes first) has already submitted their actual nomination —
// nominatorOrder is already in finishing-place order, so this just
// checks everyone before this player's own index.
export function isNominatorsTurn(nominatorOrder, nominations, playerId) {
  const idx = (nominatorOrder || []).findIndex((n) => n.playerId === playerId);
  if (idx === -1) return false;
  return nominatorOrder.slice(0, idx).every((n) => !!nominations?.[n.playerId]);
}

// How many ranked preferences a nominator gets to pre-submit, purely a
// function of their finishing place — 1st place has no preference list
// at all (they go immediately, nothing's taken yet so there's nothing
// to plan around), 2nd gets their top 2, 3rd their top 3. Any place
// beyond 3 (shouldn't happen at any normal top-3 Fates setup, but
// covered rather than left undefined) gets one more than 3rd, in case
// this system is ever extended to a larger nominator pool.
export function preferenceSlotsFor(place) {
  if (place <= 1) return 0;
  return place;
}

// Finds the first entry in a nominator's ranked preference list that's
// still a valid pick RIGHT NOW — same validity rules a live manual pick
// has to follow (isValidNomination above), checked in rank order.
// Returns null if every ranked preference has since become invalid
// (taken by an earlier nominator, or blocked by a power), which is the
// signal the caller uses to fall back to a live manual pick instead —
// this never invents a pick outside what the nominator actually
// ranked.
export function resolveNominationFromPreferences(preferences, nominatorId, winnerId, takenIds, aphroditeBlockedId, aresImmuneId) {
  for (const pref of preferences || []) {
    const check = isValidNomination(nominatorId, pref.nomineeId, winnerId, takenIds, aphroditeBlockedId, aresImmuneId);
    if (check.ok) return pref;
  }
  return null;
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

// Auto-picks a random valid nominee on a nominator's behalf — same
// validity rules a manual pick has to follow (not themselves, not the
// immune winner, not already taken by another nominator this round).
// Used specifically for a nominator's own timeout (see
// lib/roundEngine.js's autoNominateTimedOutNominators, which applies
// this to whichever of the three nominators — 1st, 2nd, or 3rd place —
// misses their window) — returns null if there's genuinely no eligible
// player left to pick (shouldn't happen in practice at any normal
// player count, but this is the honest answer rather than crashing or
// picking an invalid target).
export function autoPickNominee(nominatorId, winnerId, aliveIds, takenIds) {
  const eligible = (aliveIds || []).filter((id) => id !== nominatorId && id !== winnerId && !takenIds.has(id));
  if (eligible.length === 0) return null;
  return eligible[Math.floor(Math.random() * eligible.length)];
}

// Human-readable form of settings.fatesDurationSec, for messaging around
// the winner's nomination timeout (see lib/roundEngine.js) — that window
// now matches this same duration, so anywhere it's mentioned needs the
// actual configured value, not a hardcoded number.
export function formatDurationHours(seconds) {
  const hours = seconds / 3600;
  if (hours < 1) {
    const minutes = Math.round(seconds / 60);
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  if (hours >= 24 && hours % 24 === 0) {
    const days = hours / 24;
    return `${days} day${days === 1 ? "" : "s"}`;
  }
  if (Number.isInteger(hours)) return `${hours} hour${hours === 1 ? "" : "s"}`;
  return `${hours.toFixed(1)} hours`;
}
