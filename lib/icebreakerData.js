import { storageGet, storageUpdate, subscribeGameState } from "./gameStorage";

export const STORAGE_KEY_ICEBREAKER = "traitors:icebreaker";

// ─── Icebreaker: disguised pre-submission ───
// Icebreaker's own "questions" phase (components/IcebreakerPlayer.jsx) —
// submit your favorite icebreaker question — is the one part of this
// mission that's genuinely harmless to collect ahead of time: unlike the
// answers/guessing phases, it reveals nothing about who's playing or how
// the game works. This lets the host collect it early through a plain,
// unbranded prompt (components/IcebreakerPresubmitPrompt.jsx) that never
// mentions Icebreaker at all, so nobody pre-submitting has any idea it's
// for a mini-game. IcebreakerHost.jsx's own start() seeds the real
// mission's `questions` from whatever's collected here for anyone who
// already did this, and turns `open` back off once absorbed — anyone who
// didn't pre-submit just answers live as normal, same as before this
// existed.
export const STORAGE_KEY_ICEBREAKER_PRESUBMIT = "traitors:icebreaker-presubmit";

export function subscribeIcebreakerPresubmit(gameId, onChange) {
  return subscribeGameState(gameId, STORAGE_KEY_ICEBREAKER_PRESUBMIT, (v) => onChange(v || { open: false, questions: {} }));
}

export async function getIcebreakerPresubmit(gameId) {
  const v = await storageGet(gameId, STORAGE_KEY_ICEBREAKER_PRESUBMIT);
  return v || { open: false, questions: {} };
}

export async function setIcebreakerPresubmitOpen(gameId, open) {
  return storageUpdate(gameId, STORAGE_KEY_ICEBREAKER_PRESUBMIT, (fresh) => ({ open, questions: fresh?.questions || {} }));
}

export async function submitIcebreakerPresubmit(gameId, playerName, question) {
  return storageUpdate(gameId, STORAGE_KEY_ICEBREAKER_PRESUBMIT, (fresh) => ({
    open: fresh?.open ?? true,
    questions: { ...(fresh?.questions || {}), [playerName]: question },
  }));
}
