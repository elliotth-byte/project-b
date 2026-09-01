import { supabase } from "./supabaseClient";

// Schedules a single post. `postAt` is a JS Date. The row just sits in the
// table until pages/api/cron/post-scheduled.js picks it up — nothing posts
// anything until then, so this call succeeding just means "saved," not
// "sent."
export async function scheduleSlackPost(gameId, text, postAt) {
  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("scheduled_slack_posts")
    .insert({ game_id: gameId, text, post_at: postAt.toISOString(), created_by: userData?.user?.id })
    .select()
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, post: data };
}

// Schedules a batch at staggered times, `intervalMinutes` apart, starting
// at `firstPostAt`. Used by StaggeredSlackPost for the Tea arrivals'
// "Schedule All" mode.
export async function scheduleStaggeredPosts(gameId, lines, firstPostAt, intervalMinutes) {
  const results = [];
  for (let i = 0; i < lines.length; i++) {
    const postAt = new Date(firstPostAt.getTime() + i * intervalMinutes * 60 * 1000);
    results.push(await scheduleSlackPost(gameId, lines[i], postAt));
  }
  return results;
}

export async function listScheduledPosts(gameId) {
  const { data, error } = await supabase
    .from("scheduled_slack_posts")
    .select("*")
    .eq("game_id", gameId)
    .eq("cancelled", false)
    .is("posted_at", null)
    .order("post_at", { ascending: true });
  return error ? [] : data;
}

export async function cancelScheduledPost(id) {
  const { error } = await supabase.from("scheduled_slack_posts").update({ cancelled: true }).eq("id", id);
  return !error;
}
