import { useEffect, useRef } from "react";
import { supabase } from "./supabaseClient";

// Call this from any screen that's currently showing a live game
// (host.jsx and play.jsx both do). It quietly checks in with the server
// every few seconds; the server only actually DOES anything if the
// current phase's timer has genuinely elapsed, OR everyone's already
// finished their part (see lib/roundEngine.js's isPhaseFullyDone) —
// most calls are harmless no-ops. See pages/api/advance-phase.js for why
// this is safe to expose to players, not just hosts.
//
// Was 4 seconds — reduced as part of fixing a real Supabase egress
// overage, but more conservatively than the pure "resync in case
// realtime missed something" polls elsewhere in this app (those went
// to 45 seconds). This one is genuinely different: it's what makes the
// game feel responsive the moment everyone's actually finished their
// part of a round, not just a staleness safety net, and there's a
// separate external cron hitting /api/cron/advance-rounds every
// minute as the slower, always-on backstop regardless of whether
// anyone has the app open at all. 10 seconds keeps that "everyone's
// done, waiting on the next phase" moment feeling reasonably quick
// while still cutting this call's volume well over half.
export function useRoundWatcher(gameId, { intervalMs = 10000 } = {}) {
  const inFlight = useRef(false);

  useEffect(() => {
    if (!gameId) return;
    let cancelled = false;

    const tick = async () => {
      if (inFlight.current || cancelled) return;
      inFlight.current = true;
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;
        if (!token) return;
        await fetch("/api/advance-phase", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ gameId }),
        });
      } catch {
        // Silent — this is a background nudge, not a user-facing action.
      } finally {
        inFlight.current = false;
      }
    };

    tick();
    const interval = window.setInterval(tick, intervalMs);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [gameId, intervalMs]);
}
