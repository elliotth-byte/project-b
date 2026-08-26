import { storageUpdate, subscribeGameState } from "./gameStorage";
import { isJuryEligible } from "./finaleQaData";
import { REENTRY_STATUS } from "./reentryLogic";
import { PHASES } from "./gameState";

// ─── Jury Preference List ───
// A juror is only asked to commit to this once they're genuinely
// PERMANENTLY out — still having a live re-entry attempt pending means
// they might come back and be a finalist themselves, which would make
// ranking anyone else premature. "Permanently out" here means their
// lib/reentryLogic.js re-entry record has resolved to
// ELIMINATED_FOREVER, OR — the one edge case that status alone can't
// cover — the game has reached the Finale phase at all, which is only
// possible once every re-entry window has definitively closed (a
// player exiled too late for even one re-entry attempt would otherwise
// sit at PENDING forever with no further chance to change that).
//
// Shape: { [jurorId]: [{ targetId, reason }, ...] } — one ranked list
// per juror, most preferred first. Resolved against the ACTUAL
// finalists only at real vote-close time (see lib/roundEngine.js's
// resolveAwolJuryVotes) — a name ranked here that never becomes a
// finalist is simply skipped over then, not an error now.
export function subscribeJuryPreferences(gameId, onChange) {
  return subscribeGameState(gameId, "pb:jury-preferences", (v) => onChange(v || {}));
}

export function isPermanentlyOut(player, reentryEntry, round) {
  if (!isJuryEligible(player)) return false;
  if (reentryEntry?.status === REENTRY_STATUS.ELIMINATED_FOREVER) return true;
  if (round?.phase === PHASES.FINALE) return true; // every re-entry window is definitively closed by this point, regardless of a lingering PENDING status
  return false;
}

// Everyone a juror can rank — anyone not themselves already
// definitively out of finalist contention (quit, removed for
// inactivity, or their own re-entry shot used up). Includes players
// still alive AND players exiled but still PENDING/COMPETING re-entry
// — either could still end up an actual finalist, so both stay
// eligible to rank; resolution time is what narrows this down to who
// actually made it.
export function jurorPreferenceCandidates(players, reentryList, jurorId) {
  const eliminatedForeverIds = new Set((reentryList || []).filter((r) => r.status === REENTRY_STATUS.ELIMINATED_FOREVER).map((r) => r.playerId));
  return (players || []).filter((p) => {
    if (p.id === jurorId) return false;
    if (!p.approved) return false;
    if (eliminatedForeverIds.has(p.id)) return false;
    if (p.elimination_type === "quit" || p.elimination_type === "removed_inactivity") return false;
    return true;
  });
}

export async function submitJuryPreferences(gameId, jurorId, ranked) {
  return storageUpdate(gameId, "pb:jury-preferences", (fresh) => ({
    ...(fresh || {}),
    [jurorId]: ranked,
  }));
}
