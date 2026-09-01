import { storageUpdate } from "./gameStorage";

// Same behavior as the original artifact's pauseChallenge/resumeChallenge —
// only change is the added gameId, since state now lives in a shared
// database table instead of a global window.storage object.

export async function pauseChallenge(gameId, key, onPauseCapture) {
  return storageUpdate(gameId, key, (fresh) => {
    if (!fresh || !fresh.active || fresh.paused) return null;
    const now = Date.now();
    if (typeof onPauseCapture === "function") onPauseCapture(fresh, now);
    fresh.paused = true;
    fresh.pausedAt = now;
    return fresh;
  });
}

export async function resumeChallenge(gameId, key, onResumeShift) {
  return storageUpdate(gameId, key, (fresh) => {
    if (!fresh || !fresh.paused) return null;
    const now = Date.now();
    const pausedAt = fresh.pausedAt || now;
    if (typeof onResumeShift === "function") onResumeShift(fresh, pausedAt, now);
    fresh.paused = false;
    fresh.pausedAt = null;
    return fresh;
  });
}
