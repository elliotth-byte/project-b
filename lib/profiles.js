import { supabase } from "./supabaseClient";
import { AVATAR_COLLECTIONS, collectionImageUrl } from "./avatarCollections";

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

// Bulk counterpart to fetchProfile — for anywhere that needs several
// people's profile PHOTOS at once (the finale reveal tiles below, in
// particular) rather than one row at a time. Returns a plain
// { [user_id]: photo_url } map, and only ever includes an entry for a
// user_id that actually has a photo set — a person with no profile row
// at all, or a profile with no photo uploaded, is simply absent from
// the map, so every lookup site can treat a miss as "no photo" without
// a separate null-check. `anyone can read profiles` (sql/add-profiles.sql)
// already makes this safe to call for any user_id regardless of who's
// asking — same openness the rest of the profile system already runs on.
export async function fetchProfilePhotos(userIds) {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  if (ids.length === 0) return {};
  const { data, error } = await supabase.from("profiles").select("user_id, photo_url").in("user_id", ids);
  if (error || !data) return {};
  const map = {};
  data.forEach((row) => { if (row.photo_url) map[row.user_id] = row.photo_url; });
  return map;
}

export async function upsertProfile(userId, patch) {
  const { data, error } = await supabase
    .from("profiles")
    .upsert({ user_id: userId, ...patch, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
    .select()
    .maybeSingle();
  return { ok: !error, error: error?.message, profile: data };
}

function ordinal(n) {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

// A quick, readable summary of how one season went for this player —
// deliberately not just "alive: true/false", since a viewer wants to
// know AT A GLANCE whether this was a win, a placement, or a season
// that's still ongoing. Won / Finalist / Nth-place-of-Y is the same
// three-bucket scheme for BOTH game types (see sql/add-season-placement.sql
// and lib/seasonPlacement.js) — Project B's own runner-up/3rd-place
// distinction is deliberately folded into "Finalist" here too, so a
// season history reads consistently regardless of which game a person
// actually played.
//
// elimination_order counts UP from the first person out (1st out of the
// game = worst placement); place is that flipped around into "how many
// people finished behind you", which is what actually reads as a
// placement (1st = best).
function placementFor(row) {
  if (row.is_host) return "🎙 Hosted";
  if (row.won) return "🏆 Won";
  if (row.alive === false) {
    const place = row.elimination_order != null && row.total_players ? row.total_players - row.elimination_order + 1 : null;
    const placeLabel = place != null ? `${ordinal(place)} Place of ${row.total_players}` : "Eliminated";
    if (row.elimination_type === "quit") return `Left the game — ${placeLabel}`;
    if (row.elimination_type === "removed_inactivity") return `Removed — inactivity — ${placeLabel}`;
    return placeLabel; // exiled (Project B) / murdered / banished (Traitors) — how doesn't change where it landed them
  }
  if (row.reached_finale) return "Finalist"; // still alive, the season reached its end, but didn't win
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
    seasonName: row.season_name || "Panopticon",
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

// Fallback portrait source for anyone with no profiles.photo_url set —
// their own single most recent season's players.avatar_url, never a
// deeper cascade through older seasons (see
// sql/add-most-recent-avatar-function.sql for the full reasoning and
// exactly what "most recent" means here). Batched — one call for every
// userId that needs a fallback, not one call each — returning a plain
// { [userId]: avatarUrl | null } map for easy lookup at the call site.
export async function fetchMostRecentAvatars(userIds) {
  if (!userIds || userIds.length === 0) return {};
  const { data, error } = await supabase.rpc("public_most_recent_avatars", { p_user_ids: userIds });
  if (error || !data) return {};
  const map = {};
  data.forEach((row) => {
    // Upload modes (player_upload/host_upload) already have a real
    // avatar_url straight from the players row — nothing more to do.
    if (row.avatar_url) { map[row.user_id] = row.avatar_url; return; }
    // Collection mode never stores an avatar_url at all — the image is
    // derived purely from that season's alias + chosen collection (see
    // lib/avatarIdentity.js's resolveAvatars, the same logic this
    // mirrors). The SQL function only hands back the raw facts (mode,
    // collection id, alias); building the actual URL stays here, the
    // one place collectionImageUrl's filename rule already lives.
    if (row.avatar_mode === "collection" && row.alias) {
      const collection = AVATAR_COLLECTIONS.find((c) => c.id === row.avatar_collection_id);
      if (collection) { map[row.user_id] = collectionImageUrl(collection.slug, row.alias); return; }
    }
    map[row.user_id] = null;
  });
  return map;
}
