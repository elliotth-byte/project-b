import { supabase } from "./supabaseClient";

// Host-side: called whenever TraitorRolesHost changes a role in its own
// host_state bookkeeping, to mirror that single player's role into the
// table players can actually read their own row from.
export async function setPlayerRole(gameId, playerId, role) {
  const { error } = await supabase
    .from("player_roles")
    .upsert({ game_id: gameId, player_id: playerId, role, updated_at: new Date().toISOString() }, { onConflict: "game_id,player_id" });
  if (error) console.error("Failed to sync player_roles:", error);
  return !error;
}

// Player-side: read my own role once.
export async function fetchMyRole(gameId, playerId) {
  const { data } = await supabase.from("player_roles").select("role").eq("game_id", gameId).eq("player_id", playerId).maybeSingle();
  return data?.role || "faithful";
}

// Player-side: live updates to my own role (a recruit, a merge, a restore).
export function subscribeMyRole(gameId, playerId, onChange) {
  let active = true;
  const load = async () => {
    const role = await fetchMyRole(gameId, playerId);
    if (active) onChange(role);
  };
  load();
  const channel = supabase
    .channel(`my-role:${playerId}:${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "player_roles", filter: `player_id=eq.${playerId}` }, load)
    .subscribe();
  const pollInterval = window.setInterval(load, 6000);
  return () => { active = false; window.clearInterval(pollInterval); supabase.removeChannel(channel); };
}
