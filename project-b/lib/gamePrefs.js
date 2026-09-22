import { supabase } from "./supabaseClient";

// ─── Per-player game preferences ───
// Deliberately tied to the PLAYER (persisted, same account/device or not
// — see sql/add-game-prefs.sql), not a local/browser-only toggle —
// that's what "player options level" means: set once, applies
// everywhere this player plays, on any device they log in from.
export const DEFAULT_GAME_PREFS = {
  colorBlindMode: false, // swaps to a colorblind-safe palette in every game that uses color as a meaningful signal
  swipeControls: false, // adds swipe-to-move alongside tap/arrow controls in every directional-movement game
};

export async function fetchGamePrefs(playerId) {
  const { data, error } = await supabase.from("players").select("game_prefs").eq("id", playerId).maybeSingle();
  if (error || !data) return DEFAULT_GAME_PREFS;
  return { ...DEFAULT_GAME_PREFS, ...(data.game_prefs || {}) };
}

export async function setGamePrefs(playerId, patch) {
  const current = await fetchGamePrefs(playerId);
  const next = { ...current, ...patch };
  const { error } = await supabase.from("players").update({ game_prefs: next }).eq("id", playerId);
  return { ok: !error, error: error?.message, prefs: next };
}
