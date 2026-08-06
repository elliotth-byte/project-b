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
//
// Realtime alone isn't fully reliable: Supabase's postgres_changes
// channel does NOT replay events missed while disconnected (a phone
// locking, backgrounding the tab, or a brief network drop are all it
// takes), so a client can silently freeze on stale data forever with no
// visible error — e.g. a player still seeing "Exile Vote" after the
// round's already moved on to the next Challenge, while everyone else
// sees it fine. Two things guard against that without depending on
// correctly detecting the channel's own reconnect state:
//   1. A periodic re-fetch (independent of the realtime channel) that
//      only calls onChange when the value actually changed.
//   2. An immediate re-fetch the moment the tab becomes visible again —
//      the single most common way a subscription goes stale.
const RESYNC_INTERVAL_MS = 6000;

export function subscribeGameState(gameId, key, onChange) {
  let active = true;
  let lastJson;

  const emit = (value) => {
    const json = JSON.stringify(value ?? null);
    if (json === lastJson) return;
    lastJson = json;
    if (active) onChange(value);
  };

  const resync = () => {
    storageGet(gameId, key).then((value) => {
      if (active) emit(value);
    });
  };

  resync();

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
        emit(payload.eventType === "DELETE" ? null : payload.new.value);
      }
    )
    .subscribe();

  const intervalId = setInterval(resync, RESYNC_INTERVAL_MS);

  const onVisible = () => {
    if (document.visibilityState === "visible") resync();
  };
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisible);
  }

  return () => {
    active = false;
    clearInterval(intervalId);
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisible);
    }
    supabase.removeChannel(channel);
  };
}
