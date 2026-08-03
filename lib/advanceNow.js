import { supabase } from "./supabaseClient";

// force=true skips the "has the timer actually run out" check — only the
// host/co-host is allowed to do that (enforced server-side, see
// pages/api/advance-phase.js). Used after the host finishes entering
// challenge results, locks nominations, etc., so the game doesn't sit
// waiting for the next background poll tick.
export async function requestAdvance(gameId, force = false) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) return { advanced: false, reason: "not-logged-in" };
  const res = await fetch("/api/advance-phase", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ gameId, force }),
  });
  return res.json();
}
