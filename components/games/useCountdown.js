import { useState, useEffect } from "react";

// Returns seconds remaining until `endsAt` (a ms epoch), ticking every
// 250ms, floored at 0. Every mini-game uses this as its hard stop, on
// top of whatever its own natural end condition is (lives, questions,
// shots, etc.) — see lib/challengeGames.js for why the outer timer
// always wins.
export function useCountdown(endsAt) {
  const [remainingMs, setRemainingMs] = useState(endsAt ? endsAt - Date.now() : 0);

  useEffect(() => {
    if (!endsAt) return;
    const tick = () => setRemainingMs(Math.max(0, endsAt - Date.now()));
    tick();
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [endsAt]);

  return { remainingMs, remainingSec: Math.ceil(remainingMs / 1000), timeUp: remainingMs <= 0 };
}
