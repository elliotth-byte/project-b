import { supabase } from "./supabaseClient";

// ─── Stereo Types — sticker catalog ───
// Real sourced artwork now (public/stereo-types/stickers/) — see
// components/StereoTypesSticker.jsx for the rendering, kept separate
// from this plain-data catalog so a picker UI can iterate the list
// without pulling in any rendering code. See
// sql/add-stereo-types-boombox.sql for the unlock ledger these ids get
// checked against.
//
// Ids now match each PNG's own filename suffix (sticker-<id>.png)
// rather than the old short-form ids (bolt/peace/note) the hand-drawn
// SVG version used — this is a real, deliberate break for anyone who'd
// already unlocked or equipped one of those three under its old id:
// their stereo_types_sticker_unlocks row / players.equipped_sticker
// value won't match anything in this list anymore, and they'd need to
// re-unlock/re-equip under the new id. Worth knowing before this ships
// to a season that's already used stickers.
export const STICKER_CATALOG = [
  { id: "star", label: "Star" },
  { id: "lightning-bolt", label: "Lightning Bolt" },
  { id: "flame", label: "Flame" },
  { id: "crown", label: "Crown" },
  { id: "peace-sign", label: "Peace Sign" },
  { id: "music-note", label: "Music Note" },
  { id: "poppers-bottle", label: "Poppers Bottle" },
  { id: "snake", label: "Snake" },
  { id: "wine-glass", label: "Wine Glass" },
  { id: "french-bulldog", label: "French Bulldog" },
  { id: "virginia", label: "Virginia" },
  { id: "statue-of-liberty", label: "Statue of Liberty" },
  { id: "game-controller", label: "Video Game Controller" },
  { id: "lipstick-kiss", label: "Lipstick Kiss" },
  { id: "eggplant", label: "Eggplant" },
  { id: "baguette", label: "Baguette" },
  { id: "mushroom", label: "Mushroom" },
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
