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

// Returns { isAdmin, error } rather than a plain boolean — collapsing
// "the RPC call itself failed" (migration never ran, function name
// typo, a network hiccup) and "the call succeeded but you genuinely
// aren't in platform_admins" into the same false was exactly what made
// a real access problem impossible to tell apart from a real
// permissions decision when it actually happened. error is null on
// success (admin or not); non-null means something is actually broken,
// distinct from a legitimate "no."
export async function checkIsPlatformAdmin() {
  const { data, error } = await supabase.rpc("is_platform_admin");
  if (error) return { isAdmin: false, error: error.message };
  return { isAdmin: data === true, error: null };
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
