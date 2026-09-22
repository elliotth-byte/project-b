import { storageUpdate, subscribeGameState } from "./gameStorage";

// Enhancement 7: Challenge Archive.
//
// `challengeHistory.js` (STORAGE_KEY_CHALLENGE_HISTORY) already logs a
// lightweight one-line record ("Piggy Bank — winner: Alex, 2:41pm") purely
// for the activity feed. This is a separate, richer record the HOST
// explicitly chooses to save ("Archive Results") — it keeps the full
// snapshot (final board/state, every participant, a free-text summary)
// so results survive a Clear/Reset instead of being wiped.
export const STORAGE_KEY_CHALLENGE_ARCHIVE = "traitors:challenge-archive";

export function subscribeChallengeArchive(gameId, onChange) {
  return subscribeGameState(gameId, STORAGE_KEY_CHALLENGE_ARCHIVE, (v) => onChange(v || []));
}

// entry: { challengeId, challengeName, round, participants, spectators,
//          winner, resultSummary, finalState, startedAt, endedAt }
export async function archiveChallenge(gameId, entry) {
  return storageUpdate(gameId, STORAGE_KEY_CHALLENGE_ARCHIVE, (fresh) => {
    const list = fresh || [];
    const record = {
      id: `arc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      archivedAt: Date.now(),
      ...entry,
    };
    return [...list, record];
  });
}

export async function deleteArchivedChallenge(gameId, id) {
  return storageUpdate(gameId, STORAGE_KEY_CHALLENGE_ARCHIVE, (fresh) => {
    if (!fresh) return null;
    return fresh.filter((r) => r.id !== id);
  });
}
