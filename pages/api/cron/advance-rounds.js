import { createClient } from "@supabase/supabase-js";
import { makeDb } from "../../../lib/dbAdapter";
import { advancePhase } from "../../../lib/roundEngine";
import { makeInAppPostMessage } from "../../../lib/announcements";
import { KEY_ROUND } from "../../../lib/gameState";

// ============================================================
// Runs on a schedule — see vercel.json for Vercel's own once-daily
// cron entry (Hobby plan caps native Vercel cron at once per day; this
// stays wired up as a low-frequency backstop regardless of plan).
//
// The actual frequent, near-real-time trigger is an EXTERNAL free
// scheduler (cron-job.org) hitting this same URL every 5 minutes —
// Vercel's own cron limit is a restriction on Vercel's scheduler
// specifically, not on this endpoint, which is just a normal HTTP route
// that answers any caller with the right secret. See README.md for the
// exact cron-job.org setup (URL, header, and interval).
//
// pages/api/advance-phase.js remains the primary, near-instant path
// whenever someone actually has a browser tab open (polls every few
// seconds) — this route is what covers the gap when nobody does.
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

  const results = [];
  for (const row of due) {
    try {
      const postMessage = makeInAppPostMessage(db, row.game_id);
      const result = await advancePhase(row.game_id, { db, client: supabaseAdmin, postMessage });
      results.push({ gameId: row.game_id, ...result });
    } catch (err) {
      results.push({ gameId: row.game_id, advanced: false, error: err.message });
    }
  }

  return res.status(200).json({ checked: due.length, results });
}
