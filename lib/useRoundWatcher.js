import { useEffect, useRef } from "react";
import { supabase } from "./supabaseClient";

// Call this from any screen that's currently showing a live game
// (host.jsx and play.jsx both do). It quietly checks in with the server
// every few seconds; the server only actually DOES anything if the
// current phase's timer has genuinely elapsed, OR everyone's already
// finished their part (see lib/roundEngine.js's isPhaseFullyDone) —
// most calls are harmless no-ops. See pages/api/advance-phase.js for why
// this is safe to expose to players, not just hosts.
export function useRoundWatcher(gameId, { intervalMs = 4000 } = {}) {
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
