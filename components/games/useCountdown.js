import { useState, useEffect } from "react";

// Returns seconds remaining until `endsAt` (a ms epoch), ticking every
// 250ms, floored at 0. Every mini-game uses this as its hard stop, on
// top of whatever its own natural end condition is (lives, questions,
// shots, etc.) — see lib/challengeGames.js for why the outer timer
// always wins. `endsAt` can be null/undefined (the host's "infinite
// time" setting is on) — that means NO outer timer, not "already timed
// out," so timeUp stays false forever in that case.
export function useCountdown(endsAt) {
  const [remainingMs, setRemainingMs] = useState(endsAt ? endsAt - Date.now() : null);

  useEffect(() => {
    if (!endsAt) { setRemainingMs(null); return; }
    const tick = () => setRemainingMs(Math.max(0, endsAt - Date.now()));
    tick();
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [endsAt]);

  return {
    remainingMs,
    remainingSec: remainingMs == null ? null : Math.ceil(remainingMs / 1000),
    timeUp: remainingMs != null && remainingMs <= 0,
  };
}
