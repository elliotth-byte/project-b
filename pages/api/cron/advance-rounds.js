import { createClient } from "@supabase/supabase-js";
import { makeDb } from "../../../lib/dbAdapter";
import { advancePhase } from "../../../lib/roundEngine";
import { KEY_ROUND } from "../../../lib/gameState";

// ============================================================
// Runs on Vercel's cron schedule (see vercel.json). Same CRON_SECRET
// pattern as pages/api/cron/post-scheduled.js.
//
// IMPORTANT — Vercel plan limits: Hobby accounts can only run a cron job
// once per DAY, so on Hobby this route is really just a safety net that
// sweeps up any game whose timer expired while no one had a browser tab
// open (see pages/api/advance-phase.js for the primary, near-real-time
// path). On a Pro plan, set this to run every minute in vercel.json and
// it becomes the reliable, always-on path — no open tab required at all.
// ============================================================
export default async function handler(req, res) {
  const authHeader = req.headers.authorization || "";
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const db = makeDb(supabaseAdmin);

  // Every game currently mid-phase with a timer that's already due.
  // (jsonb ->> comparisons are text, so cast phaseEndsAt to a number.)
  const { data: dueRows, error } = await supabaseAdmin
    .from("game_state")
    .select("game_id, value")
    .eq("key", KEY_ROUND);

  if (error) return res.status(500).json({ error: error.message });

  const now = Date.now();
  const due = (dueRows || []).filter((r) => {
    const v = r.value || {};
    return v.phaseEndsAt && v.phaseEndsAt <= now && v.phase !== "lobby" && v.phase !== "ended";
  });

  const botId = process.env.GROUPME_BOT_ID;
  const postMessage = async (text) => {
    if (!botId) return;
    try {
      await fetch("https://api.groupme.com/v3/bots/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bot_id: botId, text }),
      });
    } catch {
      // Best-effort, same as advance-phase.js.
    }
  };

  const results = [];
  for (const row of due) {
    try {
      const result = await advancePhase(row.game_id, { db, client: supabaseAdmin, postMessage });
      results.push({ gameId: row.game_id, ...result });
    } catch (err) {
      results.push({ gameId: row.game_id, advanced: false, error: err.message });
    }
  }

  return res.status(200).json({ checked: due.length, results });
}
