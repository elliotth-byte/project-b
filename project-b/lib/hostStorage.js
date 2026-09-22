import { supabase } from "./supabaseClient";

// ============================================================
// Same interface as lib/gameStorage.js, but reads/writes the host_state
// table instead of game_state. RLS on host_state only ever allows the
// host — no player, no matter what they try, can read or write this data.
// Use this ONLY for secrets that must never reach a player: traitor roles,
// shield status, elimination bookkeeping, and similar game-master notes.
// ============================================================

export async function hostStorageSet(gameId, key, value) {
  const { error } = await supabase
    .from("host_state")
    .upsert(
      { game_id: gameId, key, value, updated_at: new Date().toISOString() },
      { onConflict: "game_id,key" }
    );
  return !error;
}

export async function hostStorageGet(gameId, key) {
  const { data, error } = await supabase
    .from("host_state")
    .select("value")
    .eq("game_id", gameId)
    .eq("key", key)
    .maybeSingle();
  if (error || !data) return null;
  return data.value;
}

export async function hostStorageDelete(gameId, key) {
  const { error } = await supabase
    .from("host_state")
    .delete()
    .eq("game_id", gameId)
    .eq("key", key);
  return !error;
}

export async function hostStorageUpdate(gameId, key, updater, retries = 6) {
  for (let attempt = 0; attempt < retries; attempt++) {
    const { data: row } = await supabase
      .from("host_state")
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
      const { error } = await supabase
        .from("host_state")
        .insert({ game_id: gameId, key, value: nextVal, version: 1 });
      if (!error) return { ok: true, value: nextVal };
      continue;
    }

    const { data: updated, error } = await supabase
      .from("host_state")
      .update({ value: nextVal, version: version + 1, updated_at: new Date().toISOString() })
      .eq("game_id", gameId)
      .eq("key", key)
      .eq("version", version)
      .select();

    if (!error && updated && updated.length > 0) {
      return { ok: true, value: nextVal };
    }
  }
  return { ok: false, aborted: false, value: null };
}

// Realtime subscription for host_state — same pattern as gameStorage.js's
// subscribeGameState. RLS is enforced on realtime changes too, so a channel
// like this will only ever deliver data to the actual host, never a player.
// Realtime subscription for host_state, same pattern as gameStorage.js's
// subscribeGameState — PLUS a low-frequency fallback poll every 6s.
//
// Why the fallback, when nothing else in this project polls: this table
// was added to the project after everything else, via its own migration
// (sql/add-host-state.sql). Supabase has a real, common gotcha here — a
// table can be added to the realtime publication via SQL and still not
// actually stream changes if the project's Realtime settings (Database →
// Replication in the dashboard) don't also have it enabled; SQL-only setup
// doesn't always get picked up depending on project configuration. Rather
// than leave this table silently stale if that happens, it re-fetches on
// its own every few seconds regardless — realtime still delivers instant
// updates when it's working correctly, this is just insurance for when it
// isn't, on data important enough (murder/restore/shield visibility) to
// want that insurance.
export function subscribeHostState(gameId, key, onChange) {
  let active = true;

  const refetch = () => hostStorageGet(gameId, key).then((value) => { if (active) onChange(value); });
  refetch();

  const channel = supabase
    .channel(`host_state:${gameId}:${key}:${Math.random().toString(36).slice(2)}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "host_state", filter: `game_id=eq.${gameId}` },
      (payload) => {
        const row = payload.new || payload.old;
        if (!row || row.key !== key) return;
        if (payload.eventType === "DELETE") {
          if (active) onChange(null);
        } else {
          if (active) onChange(payload.new.value);
        }
      }
    )
    .subscribe();

  const pollInterval = window.setInterval(refetch, 6000);

  return () => {
    active = false;
    window.clearInterval(pollInterval);
    supabase.removeChannel(channel);
  };
}
