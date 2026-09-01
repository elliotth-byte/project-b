import { useState, useEffect } from "react";
import { getOrStartSession } from "../../lib/traitorsChallengeSession";

// Traitors' counterpart to usePersistedStart.js — returns a durable "when
// did this player start THIS run of this mini-game" timestamp, null until
// it's loaded. Backed by getOrStartSession, so switching tabs,
// backgrounding the browser, or any other remount reads back the SAME
// timestamp instead of restarting the player's personal clock.
//
// Scoped by storageKey AND createdAt together, not either alone — a new
// run of the SAME mini-game (the host restarting it) always gets a new
// createdAt, so this correctly hands back a fresh session rather than a
// leftover timestamp from a previous run.
export function useTraitorsPersistedStart(gameId, storageKey, createdAt, playerId) {
  const [startedAt, setStartedAt] = useState(null);

  useEffect(() => {
    if (!gameId || !storageKey || !createdAt || !playerId) return;
    let cancelled = false;
    getOrStartSession(gameId, storageKey, createdAt, playerId).then((t) => {
      if (!cancelled) setStartedAt(t);
    });
    return () => { cancelled = true; };
  }, [gameId, storageKey, createdAt, playerId]);

  return startedAt;
}
