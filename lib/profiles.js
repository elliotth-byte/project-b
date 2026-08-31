import { supabase } from "./supabaseClient";

// ─── Profiles ───
// See sql/add-profiles.sql for the full reasoning. A profile is
// optional — a person who's never set one up simply has no row here,
// and fetchProfile returns null rather than a placeholder object, so
// callers can fall back to whatever's more appropriate for their own
// context (their most recent season's own display name, for instance).
export async function fetchProfile(userId) {
  const { data, error } = await supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle();
  if (error || !data) return null;
  return data;
}

export async function upsertProfile(userId, patch) {
  const { data, error } = await supabase
    .from("profiles")
    .upsert({ user_id: userId, ...patch, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
    .select()
    .maybeSingle();
  return { ok: !error, error: error?.message, profile: data };
}

// A quick, readable summary of how one season went for this player —
// deliberately not just "alive: true/false", since a viewer wants to
// know AT A GLANCE whether this was a win, a specific-round exile, a
// voluntary departure, or a season that's still ongoing.
function placementFor(row) {
  if (row.is_host) return "🎙 Hosted";
  if (row.won) return "🏆 Won";
  if (row.elimination_type === "quit") return "Left the game";
  if (row.elimination_type === "removed_inactivity") return "Removed — inactivity";
  if (row.alive === false) return row.elimination_round != null ? `Exiled — Round ${row.elimination_round}` : "Exiled";
  if (row.reached_finale) return "Finalist"; // still alive, the season reached its Finale, but didn't win
  return "Still playing";
}

// One row per season this person has ever been involved in, most
// recent first — includes seasons they HOSTED, not just ones they
// played in (an account that only ever hosted never has a players row
// at all, which previously made every season they ran invisible here).
// Goes through public_season_history (see sql/add-profiles-v2.sql)
// rather than querying players/games directly — the players table's
// own RLS is scoped to games you're actually involved in, which would
// silently return nothing when viewing someone you've never shared a
// season with. That function is a narrow, security-definer exception
// built specifically for this: it returns only what a profile page
// actually needs, not the players table's full row.
export async function fetchSeasonHistory(userId) {
  const { data, error } = await supabase.rpc("public_season_history", { p_user_id: userId });
  if (error || !data) return [];
  return data.map((row) => ({
    gameId: row.game_id,
    seasonName: row.season_name || "Project B",
    seasonDate: row.season_date,
    character: row.character_name || null,
    realName: row.real_name,
    isHost: row.is_host,
    placement: placementFor(row),
  }));
}

// Find a season by name — the season-side counterpart to
// searchPeopleToDm/searchPeople, same openness: games' own RLS only
// lets you read a season you're actually part of, so this needs the
// same narrow, security-definer exception to make "look up a season
// you've never played in" possible at all.
export async function searchSeasons(query) {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const { data, error } = await supabase.rpc("search_seasons", { p_query: trimmed });
  if (error || !data) return [];
  return data.map((row) => ({
    gameId: row.game_id,
    seasonName: row.season_name,
    seasonDate: row.season_date,
    playerCount: row.player_count,
  }));
}

// Every approved player in a season, plus its host — what "click a
// season, see who was in it" actually needs. The host is included even
// if they're ALSO a player in this same season (both roles are real
// and shown separately, not merged into one row).
export async function fetchSeasonRoster(gameId) {
  const { data, error } = await supabase.rpc("public_season_roster", { p_game_id: gameId });
  if (error || !data) return [];
  return data.map((row) => ({
    userId: row.user_id,
    displayName: row.display_name,
    character: row.character_name || null,
    isHost: row.is_host,
    placement: placementFor(row),
  }));
}
