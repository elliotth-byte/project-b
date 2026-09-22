import { supabase } from "./supabaseClient";
import { resizeImageToSquareJpeg } from "./avatarUpload";
import { upsertProfile } from "./profiles";

// ─── Profile photo upload ───
// Same resize/crop/re-encode step as lib/avatarUpload.js (reused
// directly rather than duplicated — a profile photo and a season
// avatar have identical technical requirements, just different
// storage buckets and owners). One object per person, always at
// `{userId}.jpg` (see sql/add-profiles.sql for why the fixed
// extension matters), so a re-upload just overwrites the same path.
export async function uploadProfilePhoto(userId, file) {
  const blob = await resizeImageToSquareJpeg(file);
  const path = `${userId}.jpg`;
  const { error: uploadError } = await supabase.storage.from("profile-photos").upload(path, blob, {
    upsert: true, contentType: "image/jpeg", cacheControl: "3600",
  });
  if (uploadError) return { ok: false, error: uploadError.message };

  const { data } = supabase.storage.from("profile-photos").getPublicUrl(path);
  // Cache-busted so a re-upload at the same path shows up immediately
  // instead of a stale cached copy of the old image.
  const url = `${data.publicUrl}?t=${Date.now()}`;

  const res = await upsertProfile(userId, { photo_url: url });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, url };
}

// Used both for a person clearing their own photo, and for platform-
// admin moderation (pulling a photo down — see sql/add-profiles.sql's
// admin storage policy).
export async function removeProfilePhoto(userId) {
  await supabase.storage.from("profile-photos").remove([`${userId}.jpg`]);
  const res = await upsertProfile(userId, { photo_url: null });
  return { ok: res.ok, error: res.error };
}
