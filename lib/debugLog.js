// ─── Game Debug Log ───
// Append-only record of the decisions lib/roundEngine.js actually
// makes at runtime — see sql/add-debug-log.sql for the full reasoning
// on why this exists and why it's a real table, not a game_state key.
//
// logGameEvent is deliberately best-effort and fire-and-forget: a
// logging failure must never be able to affect the actual game logic
// it's observing — the whole point is to add visibility, not a new
// way for a season to break. Every call site awaits it (so events are
// still ordered correctly relative to the write that triggered them)
// but never lets its own failure propagate; errors are swallowed, not
// thrown.
//
// `client` must be a service-role client — this table has no insert
// policy for anyone, on purpose (see the SQL migration), so a regular
// authenticated client could never write here even if this function
// were called from one.
export async function logGameEvent(client, gameId, { event, round = null, phase = null, source, detail = {} }) {
  if (!client || !gameId || !event || !source) return;
  try {
    await client.from("game_debug_log").insert({ game_id: gameId, round, phase, event, source, detail });
  } catch {
    // best-effort — see this file's own header comment
  }
}

// Trims detail objects before they're logged — the log is meant to be
// exported and read by a person (or pasted into a bug report), not to
// become its own multi-KB-per-row storage problem. Keeps primitive
// values and short arrays of ids/names as-is; anything else gets
// dropped rather than silently included in full.
export function summarize(obj, maxArrayLen = 20) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v == null || typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      out[k] = v;
    } else if (Array.isArray(v)) {
      out[k] = v.slice(0, maxArrayLen);
    }
  }
  return out;
}
