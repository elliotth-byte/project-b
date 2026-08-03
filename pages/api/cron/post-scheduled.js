import { createClient } from "@supabase/supabase-js";

// Runs on Vercel's cron schedule (see vercel.json). Vercel signs its own
// cron requests with `Authorization: Bearer ${CRON_SECRET}` when
// CRON_SECRET is set — this check is what stops anyone else from hitting
// this URL and mass-posting every due row on demand.
//
// This is one of two places in the app that uses the SERVICE ROLE key
// instead of the anon key — it deliberately bypasses RLS, because a cron
// job has no "current user" to run policies against, and it legitimately
// needs to see every game's due posts in one query, not just one host's.
export default async function handler(req, res) {
  const authHeader = req.headers.authorization || "";
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const botId = process.env.GROUPME_BOT_ID;
  if (!botId) return res.status(500).json({ error: "GroupMe isn't configured on this deployment." });

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: due, error: fetchError } = await supabaseAdmin
    .from("scheduled_groupme_posts")
    .select("id, text")
    .lte("post_at", new Date().toISOString())
    .is("posted_at", null)
    .eq("cancelled", false)
    .limit(50); // generous headroom for a once-a-minute cron tick

  if (fetchError) return res.status(500).json({ error: fetchError.message });
  if (!due || due.length === 0) return res.status(200).json({ posted: 0 });

  let posted = 0;
  for (const row of due) {
    try {
      const groupmeRes = await fetch("https://api.groupme.com/v3/bots/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bot_id: botId, text: row.text }),
      });
      if (groupmeRes.ok) {
        await supabaseAdmin.from("scheduled_groupme_posts").update({ posted_at: new Date().toISOString() }).eq("id", row.id);
        posted += 1;
      } else {
        const body = await groupmeRes.text();
        await supabaseAdmin.from("scheduled_groupme_posts").update({ error: `GroupMe rejected: ${body || groupmeRes.status}` }).eq("id", row.id);
      }
    } catch (err) {
      await supabaseAdmin.from("scheduled_groupme_posts").update({ error: err.message }).eq("id", row.id);
    }
  }

  return res.status(200).json({ posted, checked: due.length });
}
