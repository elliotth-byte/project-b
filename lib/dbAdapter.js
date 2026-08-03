// ============================================================
// Same get/set/update/delete shape as the original project's
// lib/gameStorage.js, but factored out so it can be bound to ANY supabase
// client — the browser singleton, a request-scoped client carrying a
// user's bearer token, or a service-role client in a cron job. This is
// what lets lib/roundEngine.js's phase-advance logic run identically
// whether it's triggered from a player's browser tab or from Vercel Cron.
// ============================================================

export function makeDb(client) {
  async function get(gameId, key) {
    const { data, error } = await client
      .from("game_state")
      .select("value")
      .eq("game_id", gameId)
      .eq("key", key)
      .maybeSingle();
    if (error || !data) return null;
    return data.value;
  }

  async function set(gameId, key, value) {
    const { error } = await client
      .from("game_state")
      .upsert({ game_id: gameId, key, value, updated_at: new Date().toISOString() }, { onConflict: "game_id,key" });
    return !error;
  }

  async function del(gameId, key) {
    const { error } = await client.from("game_state").delete().eq("game_id", gameId).eq("key", key);
    return !error;
  }

  async function update(gameId, key, updater, retries = 6) {
    for (let attempt = 0; attempt < retries; attempt++) {
      const { data: row } = await client
        .from("game_state")
        .select("value, version")
        .eq("game_id", gameId)
        .eq("key", key)
        .maybeSingle();

      const current = row ? row.value : null;
      const version = row ? row.version : 0;
      const draft = current ? JSON.parse(JSON.stringify(current)) : current;
      const result = updater(draft);
      if (result === null) return { ok: false, aborted: true, value: draft };
      const nextVal = result === undefined ? draft : result;
      if (!nextVal) return { ok: false, aborted: true, value: draft };

      if (!row) {
        const { error } = await client.from("game_state").insert({ game_id: gameId, key, value: nextVal, version: 1 });
        if (!error) return { ok: true, value: nextVal };
        continue;
      }

      const { data: updated, error } = await client
        .from("game_state")
        .update({ value: nextVal, version: version + 1, updated_at: new Date().toISOString() })
        .eq("game_id", gameId)
        .eq("key", key)
        .eq("version", version)
        .select();

      if (!error && updated && updated.length > 0) return { ok: true, value: nextVal };
    }
    return { ok: false, aborted: false, value: null };
  }

  return { get, set, delete: del, update };
}
