import { supabase } from "./supabaseClient";

// ─── Blocked Users ───
// See sql/add-chat-reports-and-blocking.sql for the table and RLS.
// Global, not per-game or per-thread — blocking is about a specific
// real person, not a specific season.
export async function fetchMyBlockedIds(userId) {
  if (!userId) return new Set();
  const { data, error } = await supabase.from("blocked_users").select("blocked_id").eq("blocker_id", userId);
  if (error || !data) return new Set();
  return new Set(data.map((r) => r.blocked_id));
}

export async function blockUser(blockerId, blockedId) {
  if (!blockerId || !blockedId || blockerId === blockedId) return { ok: false };
  const { error } = await supabase.from("blocked_users").upsert({ blocker_id: blockerId, blocked_id: blockedId }, { onConflict: "blocker_id,blocked_id" });
  return { ok: !error, error: error?.message };
}

export async function unblockUser(blockerId, blockedId) {
  const { error } = await supabase.from("blocked_users").delete().eq("blocker_id", blockerId).eq("blocked_id", blockedId);
  return { ok: !error, error: error?.message };
}

// Used before starting a NEW DM thread (see lib/chatData.js's
// createOrGetThread) — true if either side has blocked the other,
// without exposing either person's actual block list to the other.
export async function isBlockedEitherWay(otherUserId) {
  const { data, error } = await supabase.rpc("is_blocked_either_way", { p_other_user_id: otherUserId });
  if (error) return false; // fail open on an RPC error — this is a UX nicety, not the actual security boundary (RLS on chat_messages/threads is), so a broken check shouldn't itself block real conversations
  return data === true;
}
