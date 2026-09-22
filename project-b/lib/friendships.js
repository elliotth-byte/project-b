import { supabase } from "./supabaseClient";

// ─── Friendships ───
// See sql/add-player-friendships.sql for the full reasoning: one-
// directional (no reciprocity/notification), but PUBLICLY readable —
// anyone's relationship web is viewable by anyone (pages/profile.jsx),
// and who someone's friended carries no spoiler risk. Only INSERT/
// DELETE stay restricted to your own outgoing list; fetchFriendedUserIds
// itself works for ANY subjectUserId, not just the caller's own. The
// button that calls addFriend/removeFriend still only ever lives on the
// OTHER person's profile page (pages/profile.jsx's !isOwnProfile
// branch) — you can view anyone's list, but only ever edit your own.
export async function fetchFriendedUserIds(subjectUserId) {
  const { data, error } = await supabase.from("player_friendships").select("friended_user_id").eq("user_id", subjectUserId);
  if (error || !data) return [];
  return data.map((row) => row.friended_user_id);
}

export async function addFriend(userId, friendedUserId) {
  const { error } = await supabase.from("player_friendships").insert({ user_id: userId, friended_user_id: friendedUserId });
  return { ok: !error, error: error?.message };
}

export async function removeFriend(userId, friendedUserId) {
  const { error } = await supabase.from("player_friendships").delete().eq("user_id", userId).eq("friended_user_id", friendedUserId);
  return { ok: !error, error: error?.message };
}
