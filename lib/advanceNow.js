import { supabase } from "./supabaseClient";

// force=true skips the "has the timer actually run out" check — only the
// host/co-host is allowed to do that (enforced server-side, see
// pages/api/advance-phase.js). Used after the host finishes entering
// challenge results, locks nominations, etc., so the game doesn't sit
// waiting for the next background poll tick.
//
// Never throws — a network hiccup or an unexpected server error comes
// back as { advanced: false, error: "..." } just like any other
// non-advance outcome, so every caller can handle both the same way
// (check `.error` and tell the host) instead of needing its own
// try/catch. Skipping that check used to mean a failure here just
// silently did nothing from the host's point of view — the "Finish Now"
// button, for instance, would look like it plain didn't work.
export async function requestAdvance(gameId, force = false) {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) return { advanced: false, reason: "not-logged-in", error: "You're not logged in — try refreshing the page." };
    const res = await fetch("/api/advance-phase", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ gameId, force }),
    });
    const result = await res.json();
    if (!res.ok && !result.error) result.error = `Request failed (${res.status}).`;
    return result;
  } catch (err) {
    return { advanced: false, error: err.message || "Network error — check your connection and try again." };
  }
}
