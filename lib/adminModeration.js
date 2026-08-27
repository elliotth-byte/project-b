import { supabase } from "./supabaseClient";

// ─── Platform admin moderation ───
// See sql/add-profiles.sql and sql/add-profiles-admin.sql for the full
// reasoning. Deliberately thin — the actual override actions (setting
// a display name, clearing a photo) reuse upsertProfile and
// removeProfilePhoto from lib/profiles.js / lib/profilePhotoUpload.js
// directly, since an admin overriding someone's profile is writing to
// the exact same profiles row a person edits themselves — the RLS
// policies are what make an admin's write actually succeed on a row
// they don't own, not a separate code path here.

export async function checkIsPlatformAdmin() {
  const { data, error } = await supabase.rpc("is_platform_admin");
  return !error && data === true;
}

export async function searchPeople(query) {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const { data, error } = await supabase.rpc("admin_search_people", { p_query: trimmed });
  if (error || !data) return [];
  return data.map((row) => ({
    userId: row.user_id,
    matchedName: row.matched_name,
    profileDisplayName: row.profile_display_name,
    photoUrl: row.photo_url,
  }));
}
