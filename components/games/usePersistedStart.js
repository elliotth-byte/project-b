import { useState, useEffect } from "react";
import { getOrStartSession } from "../../lib/challengeScores";

// Returns a durable "when did this player start THIS mini-game" timestamp
// (round-scoped, per player) — null until it's loaded. Backed by
// getOrStartSession, so switching tabs, backgrounding the browser, or any
// other remount reads back the SAME timestamp instead of restarting the
// player's personal clock. Only meant for the handful of games that run
// their own clock independent of challenge.endsAt — see WhackMolePlayer,
// Match3Player, Maze2DPlayer, SpotDiffPlayer, WordScramblePlayer.
export function usePersistedStart(gameId, round, playerId) {
  const [startedAt, setStartedAt] = useState(null);

  useEffect(() => {
    if (!gameId || !round || !playerId) return;
    let cancelled = false;
    getOrStartSession(gameId, round, playerId).then((t) => {
      if (!cancelled) setStartedAt(t);
    });
    return () => { cancelled = true; };
  }, [gameId, round, playerId]);

  return startedAt;
}
