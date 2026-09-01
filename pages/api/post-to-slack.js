import { createClient } from "@supabase/supabase-js";

// This runs on Vercel's server, never in the browser — that's the whole
// point. SLACK_WEBHOOK_URL is a secret (set it WITHOUT the NEXT_PUBLIC_
// prefix in Vercel's env vars, unlike the Supabase ones, specifically so it
// never gets bundled into client-side JS). If it had NEXT_PUBLIC_ in front,
// anyone could open dev tools and read it out of your deployed site, then
// post anything they want to your team's Slack, forever, with no way to
// revoke it short of deleting the webhook.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return res.status(500).json({ error: "Slack isn't configured on this deployment yet." });

  const { gameId, text } = req.body || {};
  if (!gameId || !text) return res.status(400).json({ error: "Missing gameId or text." });

  // Verify the request actually comes from this game's host — anyone could
  // otherwise call this endpoint directly and spam the channel.
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Missing auth token." });

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) return res.status(401).json({ error: "Invalid session." });

  const { data: game, error: gameError } = await supabase
    .from("games")
    .select("id, host_id")
    .eq("id", gameId)
    .maybeSingle();

  if (gameError || !game) {
    return res.status(403).json({ error: "Game not found." });
  }

  let authorized = game.host_id === userData.user.id;
  if (!authorized) {
    // Not the primary host — check if they're a co-host of this game.
    // RLS on game_hosts (see sql/add-game-hosts.sql) lets a user see their
    // own co-host row, so this query only ever returns something if
    // they're genuinely listed.
    const { data: coHostRow } = await supabase
      .from("game_hosts")
      .select("user_id")
      .eq("game_id", gameId)
      .eq("user_id", userData.user.id)
      .maybeSingle();
    authorized = !!coHostRow;
  }

  if (!authorized) {
    return res.status(403).json({ error: "Only this game's host or a co-host can post to Slack." });
  }

  try {
    const slackRes = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!slackRes.ok) {
      const body = await slackRes.text();
      return res.status(502).json({ error: `Slack rejected the post: ${body || slackRes.status}` });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(502).json({ error: "Could not reach Slack: " + err.message });
  }
}
