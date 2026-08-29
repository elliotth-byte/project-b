import { supabase } from "./supabaseClient";

export const exileContext = (round) => `exile:${round}`;
export const FINALE_CONTEXT = "finale";

// Called by the CURRENT Power of Khaos holder from their own screen —
// RLS (see sql/add-chaos-secrets.sql) only allows this to succeed if the
// caller genuinely is that person right now. Safe to call repeatedly if
// they change their mind before the reveal. `reason` is optional, same
// idea as a voter's own optional "why" (see ExileVotePlayer.jsx) — kept
// exactly as secret as the pick itself until the reveal.
export async function setChaosNullify(gameId, context, nomineeId, reason) {
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("chaos_secrets")
    .upsert(
      { game_id: gameId, context, nullified_player_id: nomineeId, reason: reason?.trim() || null, set_by: userData?.user?.id, updated_at: new Date().toISOString() },
      { onConflict: "game_id,context" }
    );
  return !error;
}

// Only ever returns real data for the host or the actual chaos holder —
// RLS returns "no row" to everyone else, not an error. Returns
// { nomineeId, reason } — null when there's nothing to read (yet, or
// ever, if the caller isn't allowed to see it).
export async function getChaosSecret(gameId, context) {
  const { data } = await supabase.from("chaos_secrets").select("nullified_player_id, reason").eq("game_id", gameId).eq("context", context).maybeSingle();
  if (!data) return null;
  return { nomineeId: data.nullified_player_id ?? null, reason: data.reason ?? null };
}

// Same resilience reasoning as lib/gameStorage.js's subscribeGameState —
// a dropped realtime connection (phone locking, backgrounding the tab, a
// network blip) means missed postgres_changes events are gone for good,
// so this also re-fetches periodically and the instant the tab becomes
// visible again, not just on realtime pushes. Delivers the same shape as
// getChaosSecret: { nomineeId, reason } | null.
export function subscribeChaosSecret(gameId, context, onChange) {
  let active = true;
  let lastJson;

  const emit = (v) => {
    const json = JSON.stringify(v);
    if (json === lastJson) return;
    lastJson = json;
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
        emit(payload.eventType === "DELETE" ? null : { nomineeId: payload.new.nullified_player_id ?? null, reason: payload.new.reason ?? null });
      }
    )
    .subscribe();

  // Same reasoning as lib/gameStorage.js's identical fix — the
  // visibility-change resync right below already catches the common
  // case instantly; this periodic poll is only for the rarer "realtime
  // silently died while the tab stayed visible" scenario, which doesn't
  // need sub-10-second detection.
  const intervalId = setInterval(resync, 45000);
  const onVisible = () => { if (document.visibilityState === "visible") resync(); };
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);

  return () => {
    active = false;
    clearInterval(intervalId);
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
    supabase.removeChannel(channel);
  };
}
