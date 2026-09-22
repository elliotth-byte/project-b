import { createClient } from "@supabase/supabase-js";
import { sendPushToHosts } from "../../../lib/sendPush";

// ============================================================
// Called by the client right after the underlying action succeeds (a
// confessional submit, a new player's join-insert) — both of those stay
// entirely client-side (see lib/confessionalsData.js, pages/play.jsx),
// this route exists only because the actual push send needs the private
// VAPID key, which must never reach the browser. Same shape as
// pages/api/push/notify-message.js.
// ============================================================

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { gameId, eventType, playerName } = req.body || {};
  if (!gameId || !eventType) return res.status(400).json({ error: "Missing required fields." });

  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Missing auth token." });

  const userClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  if (userError || !userData?.user) return res.status(401).json({ error: "Invalid session." });

  if (eventType === "confessional") {
    await sendPushToHosts(gameId, {
      title: "🎥 New Confessional",
      body: `${playerName || "A player"} just submitted a confessional.`,
      url: `/host?game=${gameId}`, tag: "host-confessional", filterColumn: "notify_new_confessional",
    });
  } else if (eventType === "pending_player") {
    await sendPushToHosts(gameId, {
      title: "⏳ New Player Waiting",
      body: `${playerName || "Someone"} wants to join — approve them from the Roster tab.`,
      url: `/host?game=${gameId}`, tag: "host-pending-player", filterColumn: "notify_pending_player",
    });
  } else {
    return res.status(400).json({ error: "Invalid eventType." });
  }

  return res.status(200).json({ ok: true });
}
