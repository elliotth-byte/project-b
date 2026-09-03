import { createClient } from "@supabase/supabase-js";
import { sendPushToGame, sendPushToPlayers } from "../../../lib/sendPush";

// ============================================================
// Player-facing counterpart to notify-host-event.js — same shape (auth
// via the caller's own bearer token, since this only needs to confirm
// SOME real logged-in user is making the request, not specifically a
// host: any player or host in the game is a legitimate source for "a
// round just changed").
//
// Existed already for Project B specifically, as a direct in-process
// call from lib/roundEngine.js (which runs server-side inside API
// routes/the cron job already, so it never needed its own HTTP hop).
// Traitors and Stereo Types trigger their own round changes from the
// BROWSER instead (a host's click, or — for Stereo Types' auto-advance
// — any connected client's opportunistic effect), so those need an
// actual endpoint to call, the same way a confessional submit does.
//
// playerIds (optional) targets a SPECIFIC subset instead of the whole
// game — components/MurderVoteHost.jsx's own vote-opening uses this,
// since a murder vote is only ever relevant (or even something a
// non-Traitor should know is happening right now) to the faction
// actually voting in it; broadcasting that to every player would leak
// meta-information a civilian player isn't supposed to have. Omit it
// for the normal case (everyone in the game).
// ============================================================
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { gameId, title, body, tag, playerIds } = req.body || {};
  if (!gameId || !title || !body) return res.status(400).json({ error: "Missing required fields." });

  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Missing auth token." });

  const userClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  if (userError || !userData?.user) return res.status(401).json({ error: "Invalid session." });

  if (Array.isArray(playerIds) && playerIds.length > 0) {
    await sendPushToPlayers(playerIds, { title, body, url: `/play?game=${gameId}`, tag: tag || "round-change", filterColumn: "notify_rounds" });
  } else {
    await sendPushToGame(gameId, { title, body, url: `/play?game=${gameId}`, tag: tag || "round-change", filterColumn: "notify_rounds" });
  }

  return res.status(200).json({ ok: true });
}
