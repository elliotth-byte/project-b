import { createClient } from "@supabase/supabase-js";

// Runs on Vercel's cron schedule (see vercel.json). Vercel signs its own
// cron requests with `Authorization: Bearer ${CRON_SECRET}` when
// CRON_SECRET is set — this checked below is what stops anyone else from
// hitting this URL and mass-posting every due row on demand.
//
// This is the one place in the app that uses the SERVICE ROLE key instead
// of the anon key — it deliberately bypasses RLS, because a cron job has
// no "current user" to run policies against, and it legitimately needs to
// see every game's due posts in one query, not just one host's.
export default async function handler(req, res) {
  const authHeader = req.headers.authorization || "";
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return res.status(500).json({ error: "Slack isn't configured on this deployment." });

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: due, error: fetchError } = await supabaseAdmin
    .from("scheduled_slack_posts")
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
      const slackRes = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: row.text }),
      });
      if (slackRes.ok) {
        await supabaseAdmin.from("scheduled_slack_posts").update({ posted_at: new Date().toISOString() }).eq("id", row.id);
        posted += 1;
      } else {
        const body = await slackRes.text();
        await supabaseAdmin.from("scheduled_slack_posts").update({ error: `Slack rejected: ${body || slackRes.status}` }).eq("id", row.id);
      }
    } catch (err) {
      await supabaseAdmin.from("scheduled_slack_posts").update({ error: err.message }).eq("id", row.id);
    }
  }

  return res.status(200).json({ posted, checked: due.length });
}
