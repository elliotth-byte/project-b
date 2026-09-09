import { supabase } from "./supabaseClient";

// ─── Active Games ───
// What actually answers "which game(s) am I currently in" for a
// signed-in user, independent of any URL hint. pages/index.jsx used to
// only offer a "Continue to Game" link when the page was loaded with a
// ?game= query param already attached — which works from a fresh
// /join/<code> link, but never survives a bookmark or a phone's
// "Add to Home Screen" shortcut, both of which just reopen the bare
// root URL. This queries the same tables directly instead, using the
// signed-in player's own RLS-visible rows (see sql/schema.sql — you
// can already read any game you're an approved player in), so it
// works regardless of how someone arrived back at the app.
//
// "Active" means approved AND not yet ended — same finale-presence
// signal used throughout sql/add-season-placement.sql and
// lib/achievements/evaluate.js (a pb:finale/traitors:finale row exists
// once a season's jury vote or host declaration has happened). Stereo
// Types has no equivalent finale key at all (see
// sql/exclude-stereo-types-from-history.sql's own reasoning on why
// that game type doesn't fit the same "season" shape) — those always
// come back active here, which is fine: there's no real "this is over"
// state to hide it behind anyway.
export async function fetchActiveGames(userId) {
  const { data: rows, error } = await supabase
    .from("players")
    .select("game_id, games(id, name, game_type)")
    .eq("user_id", userId)
    .eq("approved", true);
  if (error || !rows) return [];

  const results = [];
  for (const row of rows) {
    const game = row.games;
    if (!game) continue;
    const finaleKey = game.game_type === "traitors" ? "traitors:finale" : "pb:finale";
    const { data: stateRow } = await supabase
      .from("game_state")
      .select("game_id")
      .eq("game_id", game.id)
      .eq("key", finaleKey)
      .maybeSingle();
    if (stateRow) continue; // a finale's been recorded — this one's over
    results.push({ gameId: game.id, name: game.name || "Untitled Season", gameType: game.game_type });
  }
  return results;
}
