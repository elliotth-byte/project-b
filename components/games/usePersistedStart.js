import { useState, useEffect } from "react";
import { getOrStartSession } from "../../lib/challengeScores";

// Returns a durable "when did this player start THIS mini-game" timestamp
// (round-scoped, per player) — null until it's loaded. Backed by
// getOrStartSession, so switching tabs, backgrounding the browser, or any
// other remount reads back the SAME timestamp instead of restarting the
// player's personal clock. Two overlapping uses across the games that
// call this: some run a clock genuinely independent of challenge.endsAt
// (WhackMolePlayer, Match3Player, Maze2DPlayer, SpotDiffPlayer,
// WordScramblePlayer); others (RedLightGreenLightPlayer,
// SlidingPuzzlePlayer, StroopPlayer) still respect the shared
// challenge.endsAt for when the round ends, but score based on THIS
// timestamp specifically rather than the challenge's shared startedAt —
// using the shared start for scoring was the actual cause of a real bug
// (a player who opened the screen minutes or hours after the challenge
// began had that whole gap counted against their reported time before
// they'd even started playing; see git history / those three files' own
// comments for the full story), and this is the fix.
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
