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

// The other half of the safety net "anyone can DM anyone" needs — see
// sql/add-profile-dms.sql's own reasoning on why reporting exists at
// all. Not reviewed first, so the newest, most likely-to-need-
// attention reports surface at the top rather than getting buried
// under an old backlog.
//
// Merges TWO sources into one queue: dm_reports (the cross-season
// profile DM system) and chat_message_reports (in-game group chat +
// in-game DMs — see sql/add-chat-reports-and-blocking.sql). Different
// tables, different sender-id shape (a profile DM's sender_id is a
// real auth.users.id; an in-game chat message's sender_id is a
// player.id scoped to one season), but a platform admin working
// through App Store Guideline 1.2's 24-hour response expectation needs
// ONE list, not two separate places to check. Each row carries
// `source` so markReportReviewed knows which table to update.
export async function fetchOpenReports() {
  const [{ data: dmReports }, { data: chatReports }] = await Promise.all([
    supabase.from("dm_reports").select("*, profile_dm_messages(body, sender_id, thread_id)").eq("reviewed", false),
    supabase.from("chat_message_reports").select("*, chat_messages(body, sender_id, thread_id)").eq("reviewed", false),
  ]);

  const involvedUserIds = new Set();
  const involvedPlayerIds = new Set();
  (dmReports || []).forEach((r) => {
    involvedUserIds.add(r.reporter_id);
    if (r.profile_dm_messages?.sender_id) involvedUserIds.add(r.profile_dm_messages.sender_id);
  });
  (chatReports || []).forEach((r) => {
    involvedUserIds.add(r.reporter_id); // reports themselves are always by real account id, both sources
    if (r.chat_messages?.sender_id) involvedPlayerIds.add(r.chat_messages.sender_id);
  });

  const [{ data: profs }, { data: playerRows }] = await Promise.all([
    supabase.from("profiles").select("*").in("user_id", [...involvedUserIds].length ? [...involvedUserIds] : ["00000000-0000-0000-0000-000000000000"]),
    supabase.from("players").select("id, display_name, user_id").in("id", [...involvedPlayerIds].length ? [...involvedPlayerIds] : ["00000000-0000-0000-0000-000000000000"]),
  ]);
  const profsById = {};
  (profs || []).forEach((p) => { profsById[p.user_id] = p; });
  const playersById = {};
  (playerRows || []).forEach((p) => { playersById[p.id] = p; });

  const fromDm = (dmReports || []).map((r) => ({
    reportId: r.id, source: "dm", reason: r.reason, createdAt: r.created_at,
    messageBody: r.profile_dm_messages?.body || null,
    senderId: r.profile_dm_messages?.sender_id || null,
    senderName: profsById[r.profile_dm_messages?.sender_id]?.display_name || null,
    reporterId: r.reporter_id,
    reporterName: profsById[r.reporter_id]?.display_name || null,
  }));
  const fromChat = (chatReports || []).map((r) => {
    const senderPlayerId = r.chat_messages?.sender_id || null;
    const senderPlayer = senderPlayerId ? playersById[senderPlayerId] : null;
    return {
      reportId: r.id, source: "chat", reason: r.reason, createdAt: r.created_at,
      messageBody: r.chat_messages?.body || null,
      senderId: senderPlayer?.user_id || null,
      senderName: senderPlayer?.display_name ? `${senderPlayer.display_name} (in-game)` : null,
      reporterId: r.reporter_id,
      reporterName: profsById[r.reporter_id]?.display_name || null,
    };
  });

  return [...fromDm, ...fromChat].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function markReportReviewed(reportId, source = "dm") {
  const table = source === "chat" ? "chat_message_reports" : "dm_reports";
  const { error } = await supabase.from(table).update({ reviewed: true, reviewed_at: new Date().toISOString() }).eq("id", reportId);
  return { ok: !error, error: error?.message };
}
