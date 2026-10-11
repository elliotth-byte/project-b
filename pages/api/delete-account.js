import { createClient } from "@supabase/supabase-js";

// ============================================================
// Self-service account deletion — required for App Store approval
// (guideline 5.1.1(v): any app that lets people create an account must
// let them delete it from inside the app, not just by emailing someone).
//
// Called from components/DeleteAccountSection.jsx. Requires
// sql/add-account-deletion.sql to have been run first.
//
// Order of operations:
//   1. Verify the caller from their own session token (same pattern as
//      pages/api/host-reset-player-password.js) — nobody can delete
//      anyone but themselves.
//   2. Seasons they're the PRIMARY host of:
//        - has a co-host       -> hand the season to the longest-serving co-host
//        - archived, no co-host -> keep the season for its players, host cleared
//        - active, no co-host   -> stop and tell them (an active game
//                                  would otherwise be left with nobody
//                                  able to run it)
//   3. Remove their photos from storage (player portraits + profile photo).
//   4. Delete their player rows — cascades their chat messages, DMs,
//      confessionals, reactions and push registrations, exactly like a
//      host removing a player does today.
//   5. Delete the auth user — cascades profile, achievements,
//      friendships, blocks, reports they filed, host push settings, etc.
// ============================================================

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { confirm } = req.body || {};
  if (confirm !== "DELETE") return res.status(400).json({ error: "Type DELETE to confirm." });

  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "You need to be logged in." });

  const userClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  if (userError || !userData?.user) return res.status(401).json({ error: "Your session expired — log in again and retry." });
  const userId = userData.user.id;

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("delete-account: SUPABASE_SERVICE_ROLE_KEY is not set");
    return res.status(500).json({ error: "Account deletion isn't available right now. Email us and we'll do it for you." });
  }
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  try {
    // ── 2. Seasons they run ──
    const { data: hostedGames, error: hostedError } = await admin
      .from("games").select("id, name, archived").eq("host_id", userId);
    if (hostedError) throw hostedError;

    const blocking = [];
    const handoffs = [];
    for (const game of hostedGames || []) {
      const { data: coHosts, error: coHostError } = await admin
        .from("game_hosts").select("user_id, added_at")
        .eq("game_id", game.id).neq("user_id", userId)
        .order("added_at", { ascending: true }).limit(1);
      if (coHostError) throw coHostError;

      if (coHosts?.length) handoffs.push({ gameId: game.id, newHostId: coHosts[0].user_id });
      else if (!game.archived) blocking.push(game.name || "Untitled season");
    }

    if (blocking.length) {
      return res.status(409).json({
        error:
          `You're the only host of ${blocking.length === 1 ? "an active season" : "active seasons"}: ` +
          `${blocking.join(", ")}. Archive ${blocking.length === 1 ? "it" : "them"} or add a co-host first, then try again.`,
        blockingSeasons: blocking,
      });
    }

    for (const { gameId, newHostId } of handoffs) {
      const { error } = await admin.from("games").update({ host_id: newHostId }).eq("id", gameId);
      if (error) throw error;
      // They're primary host now, so the co-host row is redundant.
      await admin.from("game_hosts").delete().eq("game_id", gameId).eq("user_id", newHostId);
    }

    // ── 3. Photos ──
    const { data: players, error: playersError } = await admin
      .from("players").select("id").eq("user_id", userId);
    if (playersError) throw playersError;
    const playerIds = (players || []).map((p) => p.id);

    if (playerIds.length) {
      const { error } = await admin.storage.from("avatars").remove(playerIds.map((id) => `${id}.jpg`));
      if (error) console.warn("delete-account: avatar cleanup failed", error.message);
    }
    {
      const { error } = await admin.storage.from("profile-photos").remove([`${userId}.jpg`]);
      if (error) console.warn("delete-account: profile photo cleanup failed", error.message);
    }

    // ── 4. Player rows ──
    if (playerIds.length) {
      const { error } = await admin.from("players").delete().in("id", playerIds);
      if (error) throw error;
    }

    // ── 5. The account itself ──
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) throw deleteError;

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("delete-account failed for", userId, err?.message || err);
    return res.status(500).json({
      error: "Something went wrong and your account wasn't fully deleted. Try again, or email us and we'll finish it for you.",
    });
  }
}
