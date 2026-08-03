import { supabase } from "./supabaseClient";

// Schedules a single GroupMe post. `postAt` is a JS Date. The row just sits in the
// table until pages/api/cron/post-scheduled.js (GroupMe edition) picks it up — nothing posts
// anything until then, so this call succeeding just means "saved," not
// "sent."
export async function scheduleGroupMePost(gameId, text, postAt) {
  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("scheduled_groupme_posts")
    .insert({ game_id: gameId, text, post_at: postAt.toISOString(), created_by: userData?.user?.id })
    .select()
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, post: data };
}

// Schedules a batch of posts at staggered times, `intervalMinutes` apart,
// starting at `firstPostAt`. Not currently wired to any UI in Project B,
// kept for parity with the original project in case a future host panel
// wants staggered announcements (e.g. drip-feeding confessional recaps).
export async function scheduleStaggeredGroupMePosts(gameId, lines, firstPostAt, intervalMinutes) {
  const results = [];
  for (let i = 0; i < lines.length; i++) {
    const postAt = new Date(firstPostAt.getTime() + i * intervalMinutes * 60 * 1000);
    results.push(await scheduleGroupMePost(gameId, lines[i], postAt));
  }
  return results;
}

export async function listScheduledPosts(gameId) {
  const { data, error } = await supabase
    .from("scheduled_groupme_posts")
    .select("*")
    .eq("game_id", gameId)
    .eq("cancelled", false)
    .is("posted_at", null)
    .order("post_at", { ascending: true });
  return error ? [] : data;
}

export async function cancelScheduledPost(id) {
  const { error } = await supabase.from("scheduled_groupme_posts").update({ cancelled: true }).eq("id", id);
  return !error;
}
