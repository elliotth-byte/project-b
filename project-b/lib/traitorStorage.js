import { supabase } from "./supabaseClient";

export async function traitorStorageSet(gameId, key, value) {
  const { error } = await supabase
    .from("traitor_state")
    .upsert({ game_id: gameId, key, value, updated_at: new Date().toISOString() }, { onConflict: "game_id,key" });
  return !error;
}

export async function traitorStorageGet(gameId, key) {
  const { data, error } = await supabase
    .from("traitor_state")
    .select("value")
    .eq("game_id", gameId)
    .eq("key", key)
    .maybeSingle();
  if (error || !data) return null;
  return data.value;
}

export async function traitorStorageDelete(gameId, key) {
  const { error } = await supabase
    .from("traitor_state")
    .delete()
    .eq("game_id", gameId)
    .eq("key", key);
  return !error;
}

export async function traitorStorageUpdate(gameId, key, updater, retries = 6) {
  for (let attempt = 0; attempt < retries; attempt++) {
    const { data: row } = await supabase
      .from("traitor_state")
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
      const { error } = await supabase.from("traitor_state").insert({ game_id: gameId, key, value: nextVal, version: 1 });
      if (!error) return { ok: true, value: nextVal };
      continue;
    }

    const { data: updated, error } = await supabase
      .from("traitor_state")
      .update({ value: nextVal, version: version + 1, updated_at: new Date().toISOString() })
      .eq("game_id", gameId)
      .eq("key", key)
      .eq("version", version)
      .select();

    if (!error && updated && updated.length > 0) return { ok: true, value: nextVal };
  }
  return { ok: false, aborted: false, value: null };
}

export function subscribeTraitorState(gameId, key, onChange) {
  let active = true;
  const refetch = () => traitorStorageGet(gameId, key).then((value) => { if (active) onChange(value); });
  refetch();

  const channel = supabase
    .channel(`traitor_state:${gameId}:${key}:${Math.random().toString(36).slice(2)}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "traitor_state", filter: `game_id=eq.${gameId}` },
      (payload) => {
        const row = payload.new || payload.old;
        if (!row || row.key !== key) return;
        if (payload.eventType === "DELETE") { if (active) onChange(null); }
        else { if (active) onChange(payload.new.value); }
      }
    )
    .subscribe();

  const pollInterval = window.setInterval(refetch, 6000);
  return () => { active = false; window.clearInterval(pollInterval); supabase.removeChannel(channel); };
}
