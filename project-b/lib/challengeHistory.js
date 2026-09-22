import { storageUpdate } from "./gameStorage";

// Challenge results aren't secret (everyone finds out who won eventually),
// so this lives in the shared game_state table, not the host-only
// host_state one — that also means players, not just the host, can log a
// result when a mini-game's win condition is detected client-side on
// their own screen (Voodoo Doll, Icebreaker) rather than by the host.
export const STORAGE_KEY_CHALLENGE_HISTORY = "traitors:challenge-history";

export async function logChallengeResult(gameId, entry) {
  return storageUpdate(gameId, STORAGE_KEY_CHALLENGE_HISTORY, (fresh) => {
    const list = fresh || [];
    return [...list, { ...entry, time: new Date().toLocaleString() }];
  });
}
