import { createClient } from "@supabase/supabase-js";

// ============================================================
// Host-mediated account recovery — the replacement for the email-based
// approach we rolled back (no verified sending domain available). No
// email involved at all: the host directly sets a new password for one
// of their own players and relays it to them however they like (chat,
// verbally, etc.), and can see that player's original login username
// while they're at it — usernames are embedded in the fake
// username@players.projectb.game login email (see lib/auth.js) and can
// drift from the player's current in-game display name if a host later
// renames them, which is exactly the scenario this is meant to recover
// from.
//
// Security: verified host-of-THIS-game only, via the same RLS-scoped
// lookup pattern as pages/api/chaos-draw.js — a host can only reset
// players who actually belong to a game they host, not anyone else's.
// ============================================================

function makePassword() {
  // Avoids visually ambiguous characters (0/O, 1/l/I) since this is
  // meant to be read aloud or typed from a screen, not copy-pasted.
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { gameId, playerId } = req.body || {};
  if (!gameId || !playerId) return res.status(400).json({ error: "Missing gameId or playerId." });

  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Missing auth token." });

  const userClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  if (userError || !userData?.user) return res.status(401).json({ error: "Invalid session." });

  // RLS-gated: only returns a row if this game's host_id is actually the
  // caller — confirms they're genuinely this game's host, not just
  // someone claiming to be.
  const { data: game } = await userClient.from("games").select("id").eq("id", gameId).maybeSingle();
  if (!game) return res.status(403).json({ error: "You're not the host of this game." });

  const adminClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // Confirms the target player actually belongs to THIS game — without
  // this check, a host could reset any player's password across any
  // game just by guessing a playerId.
  const { data: player, error: playerError } = await adminClient
    .from("players").select("id, user_id, display_name").eq("id", playerId).eq("game_id", gameId).maybeSingle();
  if (playerError || !player) return res.status(404).json({ error: "That player isn't in this game." });
  if (!player.user_id) return res.status(400).json({ error: "This player has no login account to reset." });

  const { data: authUser, error: authUserError } = await adminClient.auth.admin.getUserById(player.user_id);
  if (authUserError || !authUser?.user) return res.status(404).json({ error: "Couldn't find that player's login account." });

  const newPassword = makePassword();
  const { error: updateError } = await adminClient.auth.admin.updateUserById(player.user_id, { password: newPassword });
  if (updateError) return res.status(500).json({ error: "Couldn't reset that password — try again." });

  const username = (authUser.user.email || "").split("@")[0];

  return res.status(200).json({ ok: true, username, newPassword });
}
