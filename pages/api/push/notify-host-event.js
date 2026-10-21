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

// Traitors events (see sql/add-host-notification-traitor-events.sql). Text
// is built here from short, length-capped fields rather than accepted
// whole from the client. These only ever go to the game's hosts.
const clean = (v, max = 40) => String(v ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, max);
const progress = (count, total) => (Number.isFinite(+count) && Number.isFinite(+total) && +total > 0 ? ` (${+count}/${+total} in)` : "");
const money = (n) => (Number.isFinite(+n) ? "$" + Math.round(+n).toLocaleString("en-US") : "");

const TRAITORS_EVENTS = {
  murder_vote: (b) => ({
    title: `🗡️ ${clean(b.factionLabel, 10) || "Traitor"} murder vote`,
    body: `${clean(b.playerName) || "A Traitor"} voted to murder ${clean(b.targetName) || "someone"}${progress(b.count, b.total)}.`,
    tag: "host-murder-vote", filterColumn: "notify_traitor_decisions",
  }),
  recruit_response: (b) => ({
    title: "✉️ Recruit offer answered",
    body: `${clean(b.playerName) || "A player"} ${b.accepted ? "ACCEPTED" : "declined"} the Traitors' offer.`,
    tag: "host-recruit-offer", filterColumn: "notify_traitor_decisions",
  }),
  dond_done: (b) => ({
    title: "💼 Secret Deal or No Deal",
    body: `${clean(b.playerName) || "A Traitor"} finished with ${money(b.amount) || "their prize"}.`,
    tag: "host-traitor-dond", filterColumn: "notify_traitor_decisions",
  }),
  pandora_open: (b) => ({
    title: "📦 Pandora's Box opened",
    body: `${clean(b.playerName) || "Someone"} opened Pandora's Box.`,
    tag: "host-pandora", filterColumn: "notify_pandora",
  }),
  player_vote: (b) => ({
    title: "⚖️ Roundtable vote",
    body: `${clean(b.playerName) || "A player"} voted for ${clean(b.targetName) || "someone"}${progress(b.count, b.total)}.`,
    tag: "host-roundtable-vote", filterColumn: "notify_player_votes",
  }),
};

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
  } else if (TRAITORS_EVENTS[eventType]) {
    // Only someone actually in this game (player or host) can trigger
    // these — the caller's own RLS decides what they can see.
    const { data: me } = await userClient.from("players").select("id").eq("game_id", gameId).eq("user_id", userData.user.id).maybeSingle();
    const { data: isHost } = await userClient.rpc("is_game_host", { p_game_id: gameId });
    if (!me && !isHost) return res.status(403).json({ error: "Not in this game." });
    const push = TRAITORS_EVENTS[eventType](req.body || {});
    if (!push) return res.status(400).json({ error: "Invalid event details." });
    await sendPushToHosts(gameId, { ...push, url: `/host?game=${gameId}` });
  } else {
    return res.status(400).json({ error: "Invalid eventType." });
  }

  return res.status(200).json({ ok: true });
}
