import { supabase } from "./supabaseClient";
import { makeDb } from "./dbAdapter";

// ============================================================
// Browser-bound game_state helpers. The actual read/write/CAS-update logic
// lives in lib/dbAdapter.js (makeDb) so the exact same logic can be bound
// to a different supabase client server-side (see pages/api/advance-phase.js
// and pages/api/cron/advance-rounds.js) without copy-pasting it.
// ============================================================

const db = makeDb(supabase);

export const storageSet = db.set;
export const storageGet = db.get;
export const storageDelete = db.delete;
export const storageUpdate = db.update;

// ─── Realtime subscription, replacing polling. Calls onChange(value)
// immediately with the current value, then again every time it changes.
// Returns an unsubscribe function — call it in your component's cleanup.
export function subscribeGameState(gameId, key, onChange) {
  let active = true;

  storageGet(gameId, key).then((value) => {
    if (active) onChange(value);
  });

  // Random channel-name suffix — Supabase requires unique channel names,
  // and multiple parts of the app often watch the same key at once.
  const channel = supabase
    .channel(`game_state:${gameId}:${key}:${Math.random().toString(36).slice(2)}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "game_state", filter: `game_id=eq.${gameId}` },
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

  return () => {
    active = false;
    supabase.removeChannel(channel);
  };
}
