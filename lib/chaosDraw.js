import { supabase } from "./supabaseClient";

export const exileDrawContext = (round) => `exile:${round}`;
export const FINALE_DRAW_CONTEXT = "finale";

// A player's one-shot Power of Chaos draw pick (which button they hit) —
// see pages/api/chaos-draw.js for why this has to be a server call rather
// than a direct game_state write: the secret index this checks against is
// never sent to any client, winner included.
export async function submitChaosDrawPick(gameId, context, buttonIndex) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) return { ok: false, error: "You're not logged in — try refreshing the page." };
  try {
    const res = await fetch("/api/chaos-draw", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ gameId, context, buttonIndex }),
    });
    const result = await res.json();
    if (!res.ok && !result.error) result.error = `Request failed (${res.status}).`;
    return result;
  } catch (err) {
    return { ok: false, error: err.message || "Network error — check your connection and try again." };
  }
}

export function chaosPicksKey(context) {
  return `pb:chaos-picks:${context}`;
}
