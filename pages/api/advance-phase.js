import { createClient } from "@supabase/supabase-js";
import { makeDb } from "../../lib/dbAdapter";
import { advancePhase } from "../../lib/roundEngine";
import { makeInAppPostMessage } from "../../lib/announcements";

// ============================================================
// Why this endpoint exists (and why it's safe):
//
// Vercel's Hobby plan only allows cron jobs to run once per day, which
// isn't nearly often enough to notice "the challenge timer just hit
// zero" in anything like real time. pages/api/cron/advance-rounds.js
// covers Pro-plan deployments (per-minute cron), but on Hobby the only
// way to get near-live auto-advance is for an already-open browser tab
// to check in periodically — see the useRoundWatcher hook, which every
// host AND player screen runs while a timed phase is active.
//
// That means this endpoint has to be callable by an ordinary PLAYER, not
// just the host — but actually applying an outcome (marking someone
// exiled, etc.) needs to write to `players`, which RLS restricts to the
// host. Rather than loosen that RLS policy, this route bypasses it with
// the service-role key ONLY after independently confirming — using the
// caller's OWN bearer token, so RLS still applies to this check — that
// they're actually a host or player of this specific game. No caller-
// supplied data influences WHO gets eliminated; that's entirely computed
// from votes/placements already recorded under normal RLS. This endpoint
// only ever executes the deterministic transition the game rules already
// dictate, and only for the one gameId the caller is already a member of.
// ============================================================

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { gameId, force } = req.body || {};
  if (!gameId) return res.status(400).json({ error: "Missing gameId." });

  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Missing auth token." });

  const userClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  if (userError || !userData?.user) return res.status(401).json({ error: "Invalid session." });

  // RLS-gated read: only returns a row if this user is genuinely the
  // host, a co-host, or a player of this game.
  const { data: game } = await userClient.from("games").select("id, host_id").eq("id", gameId).maybeSingle();
  if (!game) return res.status(403).json({ error: "Not a member of this game." });

  // `force` skips the timer check (used by the host's own "Advance Now"
  // button) — that's a host-only power, not something any player should
  // be able to trigger, so it gets its own authorization check.
  if (force) {
    let isHostOrCoHost = game.host_id === userData.user.id;
    if (!isHostOrCoHost) {
      const { data: coHostRow } = await userClient.from("game_hosts").select("user_id").eq("game_id", gameId).eq("user_id", userData.user.id).maybeSingle();
      isHostOrCoHost = !!coHostRow;
    }
    if (!isHostOrCoHost) return res.status(403).json({ error: "Only the host can force-advance the game." });
  }

  const adminClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const db = makeDb(adminClient);
  const postMessage = makeInAppPostMessage(db, gameId);

  try {
    const result = await advancePhase(gameId, { db, client: adminClient, postMessage, force: !!force });
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
