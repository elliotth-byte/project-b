// ─── Season-wide placement ───
// See sql/add-season-placement.sql for the schema/reasoning. One shared
// elimination_order pool per game_id, assigned (or cleared) here — the
// single choke point every exit path in both game types calls through,
// so "how many people finished behind you" means the same thing no
// matter which game type, or which of its own exit paths, put someone
// out. `client` is passed in rather than imported, since call sites run
// on both the browser's own supabase singleton (lib/playerRemoval.js,
// MurderVoteHost.jsx, RoundtableHost.jsx) and a server-side service-role
// client (lib/roundEngine.js, used from the API routes).

// Called the moment a player is actually eliminated — exiled, murdered,
// banished, quit, or removed by the host. Two round trips (read current
// max, then write) rather than one atomic statement: every call site is
// a single host action (or the round engine acting on the host's
// behalf) taken one at a time, never genuinely concurrent eliminations
// racing each other, so the small theoretical race isn't worth a
// database function just to close.
export async function recordElimination(client, gameId, playerId) {
  const { data: rows } = await client.from("players").select("elimination_order").eq("game_id", gameId).not("elimination_order", "is", null);
  const nextOrder = (rows || []).reduce((max, r) => Math.max(max, r.elimination_order || 0), 0) + 1;
  const { error } = await client.from("players").update({ elimination_order: nextOrder }).eq("id", playerId);
  if (error) console.error("recordElimination failed:", error);
}

// Called when a player is genuinely back in the game — Project B's
// re-entry (lib/roundEngine.js), or a season reset. A restored player
// holds no placement at all until (if ever) they're eliminated again,
// at which point recordElimination above gives them a fresh, later
// number reflecting when THAT actually happened.
export async function clearElimination(client, gameId, playerId) {
  const { error } = await client.from("players").update({ elimination_order: null }).eq("id", playerId);
  if (error) console.error("clearElimination failed:", error);
}
