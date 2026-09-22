import { storageGet, storageSet, subscribeGameState } from "./gameStorage";

// ─── Big Screen: shared reveal step ───
// The normal (non-Big-Screen) Exile Vote reveal is deliberately
// per-player — every phone steps through the same vote-by-vote
// sequence independently, at whatever pace that one player taps
// through it (see components/RoundRevealGate.jsx). That doesn't work
// once the whole room is watching ONE shared TV instead: there has to
// be a single, shared "which step are we on" the display page reads
// and a host advances, not N independent step counters that would
// show N different things on N different phones pointed at nobody in
// particular. This is that shared counter — same voteOrder/steps
// shape RoundRevealGate itself builds, just keyed once per round
// instead of once per player.
export const bigScreenRevealKey = (round) => `bigscreen:reveal-step:${round}`;

export function subscribeBigScreenRevealStep(gameId, round, onChange) {
  return subscribeGameState(gameId, bigScreenRevealKey(round), (v) => onChange(v?.stepIndex ?? 0));
}

export async function getBigScreenRevealStep(gameId, round) {
  const v = await storageGet(gameId, bigScreenRevealKey(round));
  return v?.stepIndex ?? 0;
}

// Idempotent by design (storageSet with a fresh value each call) — the
// display page itself is the only thing meant to call this (there's no
// "someone else already advanced it" race to defend against the way a
// multi-writer key would need to), but this stays a plain overwrite
// rather than a conditional update on purpose: a host who taps "next"
// twice in a row because the first tap didn't visibly register yet
// should never get stuck one step behind from a swallowed update.
export async function setBigScreenRevealStep(gameId, round, stepIndex) {
  return storageSet(gameId, bigScreenRevealKey(round), { stepIndex, updatedAt: Date.now() });
}
