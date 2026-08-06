import { createClient } from "@supabase/supabase-js";
import { makeDb } from "../../lib/dbAdapter";
import { KEY_ROUND, KEY_EXILE, KEY_FINALE } from "../../lib/gameState";

// ============================================================
// The Power of Chaos "draw" — replaces the old host-side Fan of Cards
// flavor button. When the Exile Vote (or Finale) begins, the game lays
// out N mystery buttons on every eligible player's screen — N being
// however many players are actually in the draw that round (alive
// players for the Exile Vote; exiled players for the Finale) — and
// secretly picks exactly ONE of those N positions as the real thing (see
// lib/roundEngine.js's secretlyPickChaosButton). That index lives in
// chaos_secrets (sql/add-chaos-draw-index.sql), which this endpoint is
// the ONLY thing that ever reads, using the service-role key. No
// client — not even the eventual winner's own browser — ever receives
// that secret directly; they only ever learn the outcome of THEIR OWN
// pick via this endpoint's response.
//
// Every eligible player gets one shot: pick one button, any button. Hit
// the right one and you win the Power of Chaos this round — recorded
// immediately as this round's public chaosHolderId, same as before.
// Everyone else's pick is just recorded (so the UI can show which
// buttons have already been tried and are safely known-wrong) with no
// other effect.
// ============================================================

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { gameId, context, buttonIndex } = req.body || {};
  if (!gameId || !context) return res.status(400).json({ error: "Missing gameId or context." });
  if (!Number.isInteger(buttonIndex) || buttonIndex < 0) return res.status(400).json({ error: "Invalid button." });

  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Missing auth token." });

  const userClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  if (userError || !userData?.user) return res.status(401).json({ error: "Invalid session." });

  // RLS-gated read: only returns a row for the caller's own player row in
  // this game, confirming both membership and giving us their player id.
  const { data: me } = await userClient.from("players").select("id, alive, approved").eq("game_id", gameId).eq("user_id", userData.user.id).maybeSingle();
  if (!me || !me.approved) return res.status(403).json({ error: "Not an approved player in this game." });

  const adminClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const db = makeDb(adminClient);

  const round = await db.get(gameId, KEY_ROUND);
  if (!round) return res.status(400).json({ error: "No round in progress." });

  // The eligible pool size is recomputed here authoritatively (not
  // trusted from the client) — this is both the number of buttons that
  // should exist AND, combined with the secret index, what defines a
  // valid button to click.
  let stateKey, stateRoundOk, poolSize;
  if (context.startsWith("exile:")) {
    const roundNum = Number(context.split(":")[1]);
    stateKey = KEY_EXILE;
    stateRoundOk = round.phase === "exile" && round.round === roundNum;
    if (!me.alive) return res.status(403).json({ error: "Only players still in the game can pick during the Exile Vote." });
    const { count } = await adminClient.from("players").select("id", { count: "exact", head: true }).eq("game_id", gameId).eq("approved", true).eq("alive", true);
    poolSize = count || 0;
  } else if (context === "finale") {
    stateKey = KEY_FINALE;
    stateRoundOk = round.phase === "finale";
    if (me.alive) return res.status(403).json({ error: "Only exiled players vote (and pick) in the Finale." });
    const { count } = await adminClient.from("players").select("id", { count: "exact", head: true }).eq("game_id", gameId).eq("approved", true).eq("alive", false);
    poolSize = count || 0;
  } else {
    return res.status(400).json({ error: "Invalid context." });
  }
  if (!stateRoundOk) return res.status(400).json({ error: "That round isn't active right now." });
  if (buttonIndex >= poolSize) return res.status(400).json({ error: "That button doesn't exist." });

  const state = await db.get(gameId, stateKey);
  if (!state || !state.votingOpen) return res.status(400).json({ error: "The Power of Chaos draw isn't open right now." });

  const picksKey = `pb:chaos-picks:${context}`;
  const picks = (await db.get(gameId, picksKey)) || {};
  if (picks[me.id] !== undefined) return res.status(400).json({ error: "You've already made your pick." });

  await db.update(gameId, picksKey, (fresh) => ({ ...(fresh || {}), [me.id]: buttonIndex }));

  let won = false;
  if (!state.chaosHolderId) {
    const { data: secretRow } = await adminClient
      .from("chaos_secrets")
      .select("draw_index")
      .eq("game_id", gameId)
      .eq("context", `draw:${context}`)
      .maybeSingle();
    const winningIndex = secretRow?.draw_index;
    if (Number.isInteger(winningIndex) && winningIndex === buttonIndex) {
      const result = await db.update(gameId, stateKey, (fresh) => (fresh && !fresh.chaosHolderId ? { ...fresh, chaosHolderId: me.id } : fresh));
      won = result.ok && result.value?.chaosHolderId === me.id;
    }
  }

  return res.status(200).json({ ok: true, won, poolSize });
}
