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

export function subscribeChaosSecret(gameId, context, onChange) {
  let active = true;
  getChaosSecret(gameId, context).then((v) => { if (active) onChange(v); });

  const channel = supabase
    .channel(`chaos-secret:${gameId}:${context}:${Math.random().toString(36).slice(2)}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "chaos_secrets", filter: `game_id=eq.${gameId}` },
      (payload) => {
        const row = payload.new || payload.old;
        if (!row || row.context !== context) return;
        if (!active) return;
        onChange(payload.eventType === "DELETE" ? null : payload.new.nullified_player_id);
      }
    )
    .subscribe();

  return () => { active = false; supabase.removeChannel(channel); };
}
