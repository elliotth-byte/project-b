import { supabase } from "./supabaseClient";

export const exileContext = (round) => `exile:${round}`;
export const FINALE_CONTEXT = "finale";

// Called by the CURRENT Power of Chaos holder from their own screen —
// RLS (see sql/add-chaos-secrets.sql) only allows this to succeed if the
// caller genuinely is that person right now. Safe to call repeatedly if
// they change their mind before the reveal.
export async function setChaosNullify(gameId, context, nomineeId) {
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("chaos_secrets")
    .upsert(
      { game_id: gameId, context, nullified_player_id: nomineeId, set_by: userData?.user?.id, updated_at: new Date().toISOString() },
      { onConflict: "game_id,context" }
    );
  return !error;
}

// Only ever returns a real value for the host or the actual chaos
// holder — RLS returns "no row" to everyone else, not an error.
export async function getChaosSecret(gameId, context) {
  const { data } = await supabase.from("chaos_secrets").select("nullified_player_id").eq("game_id", gameId).eq("context", context).maybeSingle();
  return data?.nullified_player_id ?? null;
}

// Same resilience reasoning as lib/gameStorage.js's subscribeGameState —
// a dropped realtime connection (phone locking, backgrounding the tab, a
// network blip) means missed postgres_changes events are gone for good,
// so this also re-fetches periodically and the instant the tab becomes
// visible again, not just on realtime pushes.
export function subscribeChaosSecret(gameId, context, onChange) {
  let active = true;
  let last;

  const emit = (v) => {
    if (v === last) return;
    last = v;
    if (active) onChange(v);
  };

  const resync = () => getChaosSecret(gameId, context).then((v) => { if (active) emit(v); });
  resync();

  const channel = supabase
    .channel(`chaos-secret:${gameId}:${context}:${Math.random().toString(36).slice(2)}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "chaos_secrets", filter: `game_id=eq.${gameId}` },
      (payload) => {
        const row = payload.new || payload.old;
        if (!row || row.context !== context) return;
        emit(payload.eventType === "DELETE" ? null : payload.new.nullified_player_id);
      }
    )
    .subscribe();

  const intervalId = setInterval(resync, 6000);
  const onVisible = () => { if (document.visibilityState === "visible") resync(); };
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);

  return () => {
    active = false;
    clearInterval(intervalId);
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
    supabase.removeChannel(channel);
  };
}
