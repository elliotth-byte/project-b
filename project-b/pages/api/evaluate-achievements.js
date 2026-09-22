import { createClient } from "@supabase/supabase-js";
import { makeDb } from "../../lib/dbAdapter";
import { evaluateAndAwardAchievements, evaluateStereoTypesAchievements } from "../../lib/achievements/evaluate";

// ============================================================
// Fires achievement evaluation for a game whose ending isn't already
// on a server-triggered path — Traitors (a single host click, see
// components/TraitorsAdminHost.jsx's declareWinner) and Stereo Types
// (triggered once A Side's own results are visible — see
// components/StereoTypesASideResults.jsx). Project B's two ending
// paths (advanceFromExile/advanceFromFinale) already call
// evaluateAndAwardAchievements directly, server-side, with no API
// route needed — this route exists specifically for client-triggered
// cases, since evaluation needs a service-role client (reads every
// player's power_state, writes player_achievements) that a regular
// authenticated browser session can't be handed directly.
//
// Requires the caller to be an approved player OR the host of this
// specific game — not narrowed to "must be the host" the way most
// privileged routes in this app are (see pages/api/chaos-draw.js),
// because achievements themselves are public information (see
// sql/add-achievements.sql) and evaluation is read-then-idempotent-
// write with no side effect a player shouldn't be able to trigger —
// unlike an actual game ACTION, there's nothing here for a non-host
// player to abuse by calling it whenever they like.
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
  if (!game) return res.status(404).json({ error: "Game not found." });
  const isHost = game.host_id === userData.user.id;
  let isPlayer = isHost;
  if (!isPlayer) {
    const { data: me } = await userClient.from("players").select("id").eq("game_id", gameId).eq("user_id", userData.user.id).eq("approved", true).maybeSingle();
    isPlayer = !!me;
  }
  if (!isPlayer) return res.status(403).json({ error: "Not part of this game." });

  const adminClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const db = makeDb(adminClient);

  try {
    // Each function below no-ops immediately for any game_type it
    // doesn't apply to (see their own guards) — calling both
    // unconditionally is simpler than branching on game_type here too,
    // and no more expensive than one extra no-op query.
    await evaluateAndAwardAchievements(gameId, adminClient, db);
    await evaluateStereoTypesAchievements(gameId, adminClient, db);
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Achievement evaluation failed." });
  }
}
