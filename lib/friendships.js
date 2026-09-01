import { supabase } from "./supabaseClient";

// ─── Friendships ───
// See sql/add-player-friendships.sql for the full reasoning: one-
// directional, private to the person who did the friending. Feeds the
// green ring in components/RelationshipWeb.jsx; the button that calls
// addFriend/removeFriend lives on the OTHER person's profile page
// (pages/profile.jsx's !isOwnProfile branch), never your own.
export async function fetchMyFriendedUserIds(userId) {
  const { data, error } = await supabase.from("player_friendships").select("friended_user_id").eq("user_id", userId);
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
