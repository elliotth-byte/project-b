import { useState, useEffect } from "react";
import { getOrStartSession } from "../../lib/challengeScores";

// Returns a durable "when did this player start THIS mini-game" timestamp
// — null until it's loaded. Backed by getOrStartSession, so switching
// tabs, backgrounding the browser, or any other remount reads back the
// SAME timestamp instead of restarting the player's personal clock.
//
// Scoped by round AND challengeStartedAt together, not round alone — this
// is a required parameter for a reason, not just extra precision: keying
// by round alone was a real, confirmed production bug. If a second
// challenge attempt ever starts within the same round number (a reroll,
// a re-picked challenge, anything that gives challenge.startedAt a new
// value without the round number itself changing), a round-only key
// would silently hand back a leftover timestamp from whatever ran
// earlier in that round — even a completely different mini-game — and
// there'd be no way to tell that had happened from inside this hook.
// Pass challenge?.startedAt from the calling component; it's already
// available everywhere this hook is used.
//
// Two overlapping uses across the games that call this: some run a clock
// genuinely independent of challenge.endsAt (WhackMolePlayer,
// Match3Player, Maze2DPlayer, SpotDiffPlayer, WordScramblePlayer);
// others (RedLightGreenLightPlayer, SlidingPuzzlePlayer, StroopPlayer)
// still respect the shared challenge.endsAt for when the round ends, but
// score based on THIS timestamp specifically rather than the challenge's
// shared startedAt directly — using the shared start for scoring was a
// separate, earlier bug (a player who opened the screen minutes or hours
// after the challenge began had that whole gap counted against their
// reported time before they'd even started playing).
export function usePersistedStart(gameId, round, challengeStartedAt, playerId) {
  const [startedAt, setStartedAt] = useState(null);

  useEffect(() => {
    if (!gameId || !round || !challengeStartedAt || !playerId) return;
    let cancelled = false;
    getOrStartSession(gameId, round, challengeStartedAt, playerId).then((t) => {
      if (!cancelled) setStartedAt(t);
    });
    return () => { cancelled = true; };
  }, [gameId, round, challengeStartedAt, playerId]);

  return startedAt;
}
