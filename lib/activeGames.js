import { supabase } from "./supabaseClient";

// ─── Active Games ───
// What actually answers "which game(s) am I currently in" for a
// signed-in user, independent of any URL hint. pages/index.jsx used to
// only offer a "Continue to Game" link when the page was loaded with a
// ?game= query param already attached — which works from a fresh
// /join/<code> link, but never survives a bookmark or a phone's
// "Add to Home Screen" shortcut, both of which just reopen the bare
// root URL. This queries the same tables directly instead, using the
// signed-in user's own RLS-visible rows (see sql/schema.sql — you can
// already read any game you're an approved player OR the host of), so
// it works regardless of how someone arrived back at the app.
//
// Checks BOTH roles, not just "approved player" — a host who isn't
// separately playing as a character has no row in `players` at all,
// so a players-only query misses them entirely even though they're
// the one person who most needs quick access back in. The two lists
// are merged and deduped by game id, since hosting and playing your
// own season are both legitimate at once (same non-dedup reasoning
// sql/add-season-placement.sql's own public_season_roster uses for its
// host union).
//
// "Active" means not yet ended — same finale-presence signal used
// throughout sql/add-season-placement.sql and
// lib/achievements/evaluate.js (a pb:finale/traitors:finale row exists
// once a season's jury vote or host declaration has happened). Stereo
// Types has no equivalent finale key at all (see
// sql/exclude-stereo-types-from-history.sql's own reasoning on why
// that game type doesn't fit the same "season" shape) — those always
// come back active here, which is fine: there's no real "this is over"
// state to hide it behind anyway.
async function isGameActive(game) {
  const finaleKey = game.game_type === "traitors" ? "traitors:finale" : "pb:finale";
  const { data: stateRow } = await supabase
    .from("game_state")
    .select("game_id")
    .eq("game_id", game.id)
    .eq("key", finaleKey)
    .maybeSingle();
  return !stateRow; // a finale's been recorded -> not active
}

export async function fetchActiveGames(userId) {
  const [{ data: playerRows }, { data: hostedGames }] = await Promise.all([
    supabase.from("players").select("game_id, games(id, name, game_type)").eq("user_id", userId).eq("approved", true),
    supabase.from("games").select("id, name, game_type").eq("host_id", userId),
  ]);

  const candidates = new Map(); // gameId -> game
  (playerRows || []).forEach((row) => { if (row.games) candidates.set(row.games.id, row.games); });
  (hostedGames || []).forEach((g) => { if (!candidates.has(g.id)) candidates.set(g.id, g); });

  const results = [];
  for (const game of candidates.values()) {
    if (await isGameActive(game)) {
      results.push({ gameId: game.id, name: game.name || "Untitled Season", gameType: game.game_type });
    }
  }
  return results;
}
