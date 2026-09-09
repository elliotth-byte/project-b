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
// already read any game you're a player OR the host of), so it works
// regardless of how someone arrived back at the app.
//
// Deliberately TWO separate, simple queries rather than one embedded-
// relationship select (`players.select("game_id, games(...)")`) — that
// syntax isn't used or proven anywhere else in this codebase, every
// other cross-table lookup here either does sequential queries like
// this or goes through a security-definer RPC (see
// sql/add-season-placement.sql), and it's exactly the kind of thing
// that can silently return nothing if PostgREST's relationship
// inference doesn't resolve the way you'd expect, with no visible
// error — which is a bad trade for a page whose whole job is "reliably
// show me my way back in."
//
// Checks BOTH roles, not just "player" — a host who isn't separately
// playing as a character has no row in `players` at all, so a
// players-only query misses them entirely even though they're the one
// person who most needs quick access back in. The two lists are merged
// and deduped by game id, since hosting and playing your own season
// are both legitimate at once (same non-dedup reasoning
// sql/add-season-placement.sql's own public_season_roster uses for its
// host union).
//
// Also deliberately NOT filtered to approved players only — someone
// who joined and is still waiting on the host to approve them is still
// "in the game" in every sense that matters to them; pages/play.jsx
// already handles the pending-approval state gracefully once they get
// there, so there's no reason to hide their own way back to it.
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
    supabase.from("players").select("game_id").eq("user_id", userId),
    supabase.from("games").select("id, name, game_type").eq("host_id", userId),
  ]);

  const candidates = new Map(); // gameId -> game
  (hostedGames || []).forEach((g) => candidates.set(g.id, g));

  const playerGameIds = (playerRows || []).map((r) => r.game_id).filter((id) => !candidates.has(id));
  if (playerGameIds.length > 0) {
    const { data: gamesFromPlayerRows } = await supabase.from("games").select("id, name, game_type").in("id", playerGameIds);
    (gamesFromPlayerRows || []).forEach((g) => candidates.set(g.id, g));
  }

  const results = [];
  for (const game of candidates.values()) {
    if (await isGameActive(game)) {
      results.push({ gameId: game.id, name: game.name || "Untitled Season", gameType: game.game_type });
    }
  }
  return results;
}
