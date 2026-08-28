import { supabase } from "./supabaseClient";

// ─── Cross-season DMs ───
// See sql/add-profile-dms.sql for the full design reasoning.

// profile_dm_threads enforces participant_a < participant_b at the
// database level (a real constraint, not just a convention) — this is
// the one place that ordering actually gets satisfied. Every function
// below that touches a thread sorts the pair through this first,
// rather than each caller needing to remember to do it themselves.
function sortedPair(userIdA, userIdB) {
  return userIdA < userIdB ? [userIdA, userIdB] : [userIdB, userIdA];
}

export async function searchPeopleToDm(query) {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const { data, error } = await supabase.rpc("search_people_to_dm", { p_query: trimmed });
  if (error || !data) return [];
  return data.map((row) => ({
    userId: row.user_id,
    matchedName: row.matched_name,
    profileDisplayName: row.profile_display_name,
    photoUrl: row.photo_url,
  }));
}

// Finds an existing thread between two people, or creates one — never
// both at once racing against itself, since the unique constraint on
// (participant_a, participant_b) means a second, concurrent insert
// attempt for the same pair fails outright rather than creating a
// duplicate; that failure is treated as "someone else just created it
// a moment ago" and the function re-reads instead of surfacing it as
// a real error.
export async function getOrCreateThread(myUserId, otherUserId) {
  const [a, b] = sortedPair(myUserId, otherUserId);
  const { data: existing } = await supabase
    .from("profile_dm_threads")
    .select("*")
    .eq("participant_a", a)
    .eq("participant_b", b)
    .maybeSingle();
  if (existing) return existing;

  const { data: created, error } = await supabase
    .from("profile_dm_threads")
    .insert({ participant_a: a, participant_b: b })
    .select()
    .maybeSingle();
  if (created) return created;

  // Lost a race with a concurrent insert for the same pair — the row
  // now exists, just not from this call. Re-read rather than treat it
  // as a failure.
  if (error) {
    const { data: retryRead } = await supabase
      .from("profile_dm_threads")
      .select("*")
      .eq("participant_a", a)
      .eq("participant_b", b)
      .maybeSingle();
    if (retryRead) return retryRead;
  }
  return null;
}

// Every thread the current person is part of, most recently active
// first, alongside the OTHER participant's display info — a proper
// inbox needs to show who each thread is with, not just a bare list of
// thread ids.
export async function fetchMyThreads(myUserId) {
  const { data: threads, error } = await supabase
    .from("profile_dm_threads")
    .select("*")
    .or(`participant_a.eq.${myUserId},participant_b.eq.${myUserId}`)
    .order("created_at", { ascending: false });
  if (error || !threads) return [];

  const otherIds = threads.map((t) => (t.participant_a === myUserId ? t.participant_b : t.participant_a));
  const { data: profs } = await supabase.from("profiles").select("*").in("user_id", otherIds.length ? otherIds : ["00000000-0000-0000-0000-000000000000"]);
  const profsById = {};
  (profs || []).forEach((p) => { profsById[p.user_id] = p; });

  return threads.map((t) => {
    const otherId = t.participant_a === myUserId ? t.participant_b : t.participant_a;
    return { threadId: t.id, otherUserId: otherId, otherDisplayName: profsById[otherId]?.display_name || null, otherPhotoUrl: profsById[otherId]?.photo_url || null };
  });
}

export async function fetchMessages(threadId) {
  const { data, error } = await supabase.from("profile_dm_messages").select("*").eq("thread_id", threadId).order("created_at", { ascending: true });
  return error ? [] : data;
}

export async function sendMessage(threadId, senderId, body) {
  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: "Empty message" };
  const { error } = await supabase.from("profile_dm_messages").insert({ thread_id: threadId, sender_id: senderId, body: trimmed });
  return { ok: !error, error: error?.message };
}

export function subscribeToThreadMessages(threadId, onInsert) {
  const channel = supabase
    .channel(`profile-dm-${threadId}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "profile_dm_messages", filter: `thread_id=eq.${threadId}` }, (payload) => onInsert(payload.new))
    .subscribe();
  return () => supabase.removeChannel(channel);
}

export async function reportMessage(messageId, reporterId, reason) {
  const trimmed = reason.trim();
  if (!trimmed) return { ok: false, error: "A reason is required" };
  const { error } = await supabase.from("dm_reports").insert({ message_id: messageId, reporter_id: reporterId, reason: trimmed });
  return { ok: !error, error: error?.message };
}
