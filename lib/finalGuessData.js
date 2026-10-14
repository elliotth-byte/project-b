import { supabase } from "./supabaseClient";

// ─── Traitors: Final Guess ("who were the Traitors?") ───
// Once eliminated, a player gets one shot at guessing who among the
// players still in the game are Traitors — see components/
// TraitorsFinalGuess.jsx. Goes through its own dedicated table (sql/
// add-traitor-final-guesses.sql), same reasoning as confessionals
// (lib/confessionalsData.js): RLS needs to be per-row ("do you own this
// one, or has the finale been declared"), not per-game like the shared
// game_state blob everything else uses — storing this in game_state
// would make every player's guess readable by every other player
// immediately, which is exactly what this is meant to prevent until the
// game actually ends.
export async function submitFinalGuess({ gameId, playerId, playerName, guessedPlayers }) {
  const { data, error } = await supabase
    .from("traitor_final_guesses")
    .insert({
      game_id: gameId, player_id: playerId, player_name: playerName,
      guessed_player_ids: guessedPlayers.map((p) => p.id),
      guessed_names: guessedPlayers.map((p) => p.name),
    })
    .select()
    .single();
  return { ok: !error, error: error?.message, data };
}

export async function fetchOwnFinalGuess(playerId) {
  const { data, error } = await supabase
    .from("traitor_final_guesses")
    .select("*")
    .eq("player_id", playerId)
    .maybeSingle();
  return error ? null : data;
}

// Works both for the host (full read access any time) and for any
// player once the finale is declared (RLS only actually returns rows in
// that second case once "traitors:finale" exists in game_state — see
// sql/add-traitor-final-guesses.sql). A player calling this before then
// just gets back their own single row, same as fetchOwnFinalGuess.
export async function fetchAllFinalGuesses(gameId) {
  const { data, error } = await supabase
    .from("traitor_final_guesses")
    .select("*")
    .eq("game_id", gameId)
    .order("submitted_at", { ascending: true });
  return error ? [] : data;
}

// Same "tell the caller something changed, let them re-fetch" shape as
// subscribeConfessionalsTable (lib/confessionalsData.js) — RLS already
// decides what a given re-fetch actually returns, so there's no reason
// to push row payloads through the realtime channel itself.
export function subscribeFinalGuessesTable(gameId, onChange) {
  const channel = supabase
    .channel(`traitor_final_guesses:${gameId}:${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "traitor_final_guesses", filter: `game_id=eq.${gameId}` }, onChange)
    .subscribe();
  const pollInterval = window.setInterval(onChange, 45000);
  const onVisible = () => { if (document.visibilityState === "visible") onChange(); };
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);
  return () => {
    window.clearInterval(pollInterval);
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
    supabase.removeChannel(channel);
  };
}
