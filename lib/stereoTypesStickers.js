import { supabase } from "./supabaseClient";

// ─── Stereo Types — sticker catalog ───
// A small, fixed set for now — see sql/add-stereo-types-boombox.sql for
// the unlock ledger these ids get checked against. The actual SVG for
// each of these lives in components/StereoTypesSticker.jsx, kept
// separate from this plain-data catalog so a picker UI can iterate the
// list without pulling in any rendering code.
export const STICKER_CATALOG = [
  { id: "star", label: "Star" },
  { id: "bolt", label: "Lightning Bolt" },
  { id: "flame", label: "Flame" },
  { id: "crown", label: "Crown" },
  { id: "peace", label: "Peace Sign" },
  { id: "note", label: "Music Note" },
];

// Read-only, no {ok, error} wrapper — same shape lib/profiles.js's own
// simple fetch-and-map functions use (fetchSeasonHistory, etc.): a
// failure just means "nothing to show," not something worth a caller
// branching on.
export async function fetchUnlockedStickerIds(userId) {
  if (!userId) return [];
  const { data, error } = await supabase.from("stereo_types_sticker_unlocks").select("sticker_id").eq("user_id", userId);
  if (error || !data) return [];
  return data.map((row) => row.sticker_id);
}

// stickerId may be null (un-equip). Callers are expected to only ever
// pass an id the player has actually unlocked — same trust level this
// repo already extends to other player-editable columns (color,
// torched_preset, ...); there's no separate server-side check here.
export async function equipSticker(playerId, stickerId) {
  const { error } = await supabase.from("players").update({ equipped_sticker: stickerId }).eq("id", playerId);
  return { ok: !error, error: error?.message };
}
