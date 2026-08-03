import { createClient } from "@supabase/supabase-js";

// This runs on Vercel's server, never in the browser — that's the whole
// point. GROUPME_BOT_ID is a secret (set it WITHOUT the NEXT_PUBLIC_
// prefix in Vercel's env vars, unlike the Supabase ones, specifically so
// it never gets bundled into client-side JS). If it had NEXT_PUBLIC_ in
// front, anyone could open dev tools and read it out of your deployed
// site, then post anything they want to your group, forever — GroupMe
// bot IDs can't be scoped or revoked individually the way some webhook
// systems can, only deleted and recreated from https://dev.groupme.com/bots.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const botId = process.env.GROUPME_BOT_ID;
  if (!botId) return res.status(500).json({ error: "GroupMe isn't configured on this deployment yet." });

  const { gameId, text } = req.body || {};
  if (!gameId || !text) return res.status(400).json({ error: "Missing gameId or text." });

  // Verify the request actually comes from this game's host — anyone
  // could otherwise call this endpoint directly and spam the group.
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
    const { data: coHostRow } = await supabase
      .from("game_hosts")
      .select("user_id")
      .eq("game_id", gameId)
      .eq("user_id", userData.user.id)
      .maybeSingle();
    authorized = !!coHostRow;
  }

  if (!authorized) {
    return res.status(403).json({ error: "Only this game's host or a co-host can post to GroupMe." });
  }

  try {
    const groupmeRes = await fetch("https://api.groupme.com/v3/bots/post", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bot_id: botId, text }),
    });
    // GroupMe's bot-post endpoint returns an empty body on success; any
    // non-2xx status means the post didn't go through.
    if (!groupmeRes.ok) {
      const body = await groupmeRes.text();
      return res.status(502).json({ error: `GroupMe rejected the post: ${body || groupmeRes.status}` });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(502).json({ error: "Could not reach GroupMe: " + err.message });
  }
}
