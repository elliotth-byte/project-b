import { storageUpdate, subscribeGameState } from "./gameStorage";

const revealAckKey = (round) => `pb:reveal-ack:${round}`;

// Tracks which players have clicked all the way through a given round's
// dramatic Exile Vote reveal (see components/RoundRevealGate.jsx). The
// moment a round lands in KEY_EXILE_HISTORY, every player's screen locks
// into that walkthrough — no tabs, no roster, nothing that could hint at
// the result — until they've clicked through to the end, which is what
// writes their id in here.
export function subscribeRevealAck(gameId, round, onChange) {
  return subscribeGameState(gameId, revealAckKey(round), (v) => onChange(v || {}));
}

export async function markRevealAcknowledged(gameId, round, playerId) {
  return storageUpdate(gameId, revealAckKey(round), (fresh) => ({ ...(fresh || {}), [playerId]: true }));
}
