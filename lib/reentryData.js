import { storageGet, storageUpdate, subscribeGameState } from "./gameStorage";
import { KEY_REENTRY } from "./gameState";
import { REENTRY_STATUS } from "./reentryLogic";

export function subscribeReentry(gameId, onChange) {
  return subscribeGameState(gameId, KEY_REENTRY, (v) => onChange(v || []));
}

export async function getReentry(gameId) {
  return (await storageGet(gameId, KEY_REENTRY)) || [];
}

// An exiled player toggling "I want to compete for re-entry this round"
// on their own play screen, before the host starts the challenge.
export async function setWantsToCompete(gameId, playerId, round, wants) {
  return storageUpdate(gameId, KEY_REENTRY, (fresh) => {
    const list = fresh || [];
    const idx = list.findIndex((r) => r.playerId === playerId);
    if (idx < 0) return list; // shouldn't happen — they're only exiled via the exile flow, which always creates this entry
    list[idx] = { ...list[idx], wantsToCompete: wants ? round : null };
    return list;
  });
}

// Host locking in exactly one requester as this round's re-entry attempt
// (see components/ChallengeHost.jsx for why only one at a time).
export async function markCompeting(gameId, playerId) {
  return storageUpdate(gameId, KEY_REENTRY, (fresh) => {
    const list = fresh || [];
    const idx = list.findIndex((r) => r.playerId === playerId);
    if (idx < 0) return list;
    list[idx] = { ...list[idx], status: REENTRY_STATUS.COMPETING };
    return list;
  });
}
