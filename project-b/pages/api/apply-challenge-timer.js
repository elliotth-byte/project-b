import { createClient } from "@supabase/supabase-js";
import { makeDb } from "../../lib/dbAdapter";
import { applyTimerToRunningChallenge } from "../../lib/roundEngine";
import { KEY_SETTINGS, DEFAULT_SETTINGS } from "../../lib/gameState";

// ============================================================
// Host-only. See applyTimerToRunningChallenge's own comment in
// lib/roundEngine.js for the full reasoning — this exists because a
// challenge's endsAt is fixed the moment it starts and never
// recomputed, so a currently-running battle can be permanently stuck
// with no timer even after the game itself was fixed to stop handing
// one out. Same auth shape as pages/api/advance-phase.js's own
// force-advance check, since this is the same category of action: a
// deliberate host override, not something any player should trigger.
// ============================================================

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { gameId } = req.body || {};
  if (!gameId) return res.status(400).json({ error: "Missing gameId." });

  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Missing auth token." });

  const userClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  if (userError || !userData?.user) return res.status(401).json({ error: "Invalid session." });

  const { data: game } = await userClient.from("games").select("id, host_id").eq("id", gameId).maybeSingle();
  if (!game) return res.status(403).json({ error: "Not a member of this game." });

  let isHostOrCoHost = game.host_id === userData.user.id;
  if (!isHostOrCoHost) {
    const { data: coHostRow } = await userClient.from("game_hosts").select("user_id").eq("game_id", gameId).eq("user_id", userData.user.id).maybeSingle();
    isHostOrCoHost = !!coHostRow;
  }
  if (!isHostOrCoHost) return res.status(403).json({ error: "Only the host can do this." });

  const adminClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const db = makeDb(adminClient);

  try {
    const settingsRaw = await db.get(gameId, KEY_SETTINGS);
    const settings = { ...DEFAULT_SETTINGS, ...(settingsRaw || {}) };
    const result = await applyTimerToRunningChallenge(gameId, { db, settings });
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
