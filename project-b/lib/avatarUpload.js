import { supabase } from "./supabaseClient";

const MAX_DIM = 512;
const JPEG_QUALITY = 0.85;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// Crops to a centered square and re-encodes as a fixed-size JPEG — every
// avatar ends up the same shape/format/rough size regardless of what a
// phone camera or a downloaded photo actually produced. Matches the same
// 512x512 spec the built-in collections themselves follow (see
// lib/avatarCollections.js), so uploaded and collection avatars look
// consistent side by side.
export async function resizeImageToSquareJpeg(file, maxDim = MAX_DIM) {
  const img = await loadImage(file);
  const size = Math.min(img.width, img.height);
  const sx = (img.width - size) / 2;
  const sy = (img.height - size) / 2;
  const canvas = document.createElement("canvas");
  canvas.width = maxDim;
  canvas.height = maxDim;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, sx, sy, size, size, 0, 0, maxDim, maxDim);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
}

// One object per player, always at `{playerId}.jpg` (see
// sql/add-avatars.sql for why the fixed extension matters — it's what
// lets the storage RLS policies derive the owning player_id from the
// path alone). A re-upload just overwrites the same path.
export async function uploadAvatar(playerId, file) {
  const blob = await resizeImageToSquareJpeg(file);
  const path = `${playerId}.jpg`;
  const { error: uploadError } = await supabase.storage.from("avatars").upload(path, blob, {
    upsert: true, contentType: "image/jpeg", cacheControl: "3600",
  });
  if (uploadError) return { ok: false, error: uploadError.message };

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  // Cache-busted so a re-upload at the same path shows up immediately
  // instead of a stale cached copy of the old image.
  const url = `${data.publicUrl}?t=${Date.now()}`;

  const { error: dbError } = await supabase.from("players").update({ avatar_url: url }).eq("id", playerId);
  if (dbError) return { ok: false, error: dbError.message };
  return { ok: true, url };
}

// Used both for a player/host clearing an avatar deliberately, and for
// host-side moderation (pulling a photo down).
export async function removeAvatar(playerId) {
  await supabase.storage.from("avatars").remove([`${playerId}.jpg`]);
  const { error } = await supabase.from("players").update({ avatar_url: null }).eq("id", playerId);
  return { ok: !error, error: error?.message };
}
