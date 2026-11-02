import { supabase } from "./supabaseClient";

// ─── Golden Dagger: client helpers ───
// See sql/add-golden-dagger.sql for the schema and why this is its own
// RLS-protected table. One row per game; the row existing means "someone
// holds the dagger", and player_id says who. Only the host and that holder's
// own account can read it, so for everyone else these just see nothing.
//
// Every read here fails SAFE: if the table doesn't exist yet (migration not
// run) or the query errors, the result is "no dagger" — the Roundtable keeps
// working exactly as it did before.

const TABLE = "golden_daggers";

export async function fetchGoldenDagger(gameId) {
  const { data, error } = await supabase.from(TABLE).select("*").eq("game_id", gameId).maybeSingle();
  if (error) {
    console.warn("Golden Dagger fetch failed (has sql/add-golden-dagger.sql been run?):", error.message);
    return null;
  }
  return data || null;
}

// Host only (RLS). Assigning — or moving it to someone else — clears any
// extra vote the previous holder had cast.
export async function assignGoldenDagger(gameId, playerId) {
  const { data, error } = await supabase
    .from(TABLE)
    .upsert({
      game_id: gameId, player_id: playerId, assigned_at: new Date().toISOString(),
      vote_round: null, vote_target: null, vote_reason: null, voted_at: null,
    }, { onConflict: "game_id" })
    .select()
    .maybeSingle();
  return { ok: !error, error, row: data || null };
}

// Host only (RLS).
export async function revokeGoldenDagger(gameId) {
  const { error } = await supabase.from(TABLE).delete().eq("game_id", gameId);
  return { ok: !error, error };
}

// Host only (RLS). Wipes just the extra vote, leaving the dagger with its holder.
export async function clearGoldenVote(gameId) {
  const { error } = await supabase
    .from(TABLE)
    .update({ vote_round: null, vote_target: null, vote_reason: null, voted_at: null })
    .eq("game_id", gameId);
  return !error;
}

// Holder only — enforced server-side by the cast_golden_vote function, which
// also checks voting is open for `round` and the target is a living player
// other than the holder. Returns { ok: false } if any of that fails.
export async function castGoldenVote(gameId, round, target, reason) {
  const { data, error } = await supabase.rpc("cast_golden_vote", {
    p_game_id: gameId, p_round: round, p_target: target, p_reason: reason || "",
  });
  return { ok: !error && data === true, error };
}

// Calls onChange(row | null) with the current row, then whenever it changes.
// Any realtime event just triggers a re-fetch (a DELETE event carries no row
// data to read), and the same visibility/periodic resync as
// lib/gameStorage.js's subscribeGameState guards against a silently dead
// realtime channel. Returns an unsubscribe function.
export function subscribeGoldenDagger(gameId, onChange) {
  let active = true;
  let lastJson;

  const refetch = () => fetchGoldenDagger(gameId).then((row) => {
    if (!active) return;
    const json = JSON.stringify(row);
    if (json === lastJson) return;
    lastJson = json;
    onChange(row);
  });

  refetch();

  const channel = supabase
    .channel(`golden_daggers:${gameId}:${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "*", schema: "public", table: TABLE, filter: `game_id=eq.${gameId}` }, refetch)
    .subscribe();

  const intervalId = setInterval(refetch, 45000);
  const onVisible = () => { if (document.visibilityState === "visible") refetch(); };
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);

  return () => {
    active = false;
    clearInterval(intervalId);
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
    supabase.removeChannel(channel);
  };
}
