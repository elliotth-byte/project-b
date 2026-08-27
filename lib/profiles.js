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
  if (row.won) return "🏆 Won";
  if (row.elimination_type === "quit") return "Left the game";
  if (row.elimination_type === "removed_inactivity") return "Removed — inactivity";
  if (row.alive === false) return row.elimination_round != null ? `Exiled — Round ${row.elimination_round}` : "Exiled";
  if (row.reached_finale) return "Finalist"; // still alive, the season reached its Finale, but didn't win
  return "Still playing";
}

// One row per season this person has ever played in, most recent
// first — the actual "career history" the profile page shows. Goes
// through public_season_history (see sql/add-profiles.sql) rather
// than querying players/games directly — the players table's own RLS
// is scoped to games you're actually involved in, which would silently
// return nothing when viewing someone you've never shared a season
// with. That function is a narrow, security-definer exception built
// specifically for this: it returns only what a profile page actually
// needs, not the players table's full row.
export async function fetchSeasonHistory(userId) {
  const { data, error } = await supabase.rpc("public_season_history", { p_user_id: userId });
  if (error || !data) return [];
  return data.map((row) => ({
    gameId: row.game_id,
    seasonName: row.season_name || "Project B",
    seasonDate: row.season_date,
    character: row.character_name || null,
    realName: row.real_name,
    placement: placementFor(row),
  }));
}
