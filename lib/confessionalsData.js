import { supabase } from "./supabaseClient";
import { storageSet, storageUpdate, subscribeGameState } from "./gameStorage";

export const CONFESSIONAL_TAGS = ["Strategy", "Suspicion", "Alliance", "Mission", "Lie", "Emotional", "Confession", "Other"];

// Scope note: the original spec's optional "Confessional Prompts" feature
// described full CRUD over a history of prompts. Implemented here as a
// single "current active prompt" instead — the host sets one, players see
// it, done. Simpler, and covers the actual use case (give players
// something to react to that round) without a whole prompt-management UI.
// Prompts aren't secret, so this lives in the shared game_state table like
// everything else non-confidential.
export const STORAGE_KEY_CONFESSIONAL_PROMPT = "traitors:confessional-prompt";

export function subscribeConfessionalPrompt(gameId, onChange) {
  return subscribeGameState(gameId, STORAGE_KEY_CONFESSIONAL_PROMPT, onChange);
}

export async function setConfessionalPrompt(gameId, prompt, round) {
  return storageSet(gameId, STORAGE_KEY_CONFESSIONAL_PROMPT, prompt ? { prompt, round, active: true, createdAt: Date.now() } : null);
}

export async function clearConfessionalPrompt(gameId) {
  return storageUpdate(gameId, STORAGE_KEY_CONFESSIONAL_PROMPT, (fresh) => {
    if (!fresh) return null;
    return { ...fresh, active: false };
  });
}

// ─── Confessionals themselves — these go through the dedicated
// `confessionals` table (see sql/add-confessionals.sql), NOT the shared
// game_state blob pattern everything else in this project uses, because
// RLS needs to be per-row ("do you own this one"), not per-game.

export async function submitConfessional({ gameId, playerId, playerName, round, text, tags, promptId }) {
  const { data, error } = await supabase
    .from("confessionals")
    .insert({
      game_id: gameId, player_id: playerId, player_name: playerName,
      round: round || null, text, tags: tags || [], prompt_id: promptId || null,
    })
    .select()
    .single();
  return { ok: !error, error: error?.message, data };
}

export async function fetchOwnConfessionals(playerId) {
  const { data, error } = await supabase
    .from("confessionals")
    .select("*")
    .eq("player_id", playerId)
    .order("created_at", { ascending: false });
  return error ? [] : data;
}

export async function fetchAllConfessionals(gameId) {
  const { data, error } = await supabase
    .from("confessionals")
    .select("*")
    .eq("game_id", gameId)
    .order("created_at", { ascending: false });
  return error ? [] : data;
}

export async function updateConfessional(id, patch) {
  const { error } = await supabase.from("confessionals").update(patch).eq("id", id);
  return !error;
}

// A private, host-only reply on a single confessional — visible to the
// host and to the one player who wrote it (see sql/add-confessional-replies.sql
// for why no new RLS policy is needed). Passing an empty/blank reply
// clears it back out.
export async function respondToConfessional(id, reply) {
  const text = (reply || "").trim();
  const { error } = await supabase
    .from("confessionals")
    .update({ host_reply: text || null, host_reply_at: text ? new Date().toISOString() : null })
    .eq("id", id);
  return !error;
}

export function subscribeConfessionalsTable(gameId, onChange) {
  const channel = supabase
    .channel(`confessionals:${gameId}:${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "confessionals", filter: `game_id=eq.${gameId}` }, onChange)
    .subscribe();
  const pollInterval = window.setInterval(onChange, 6000);
  return () => { window.clearInterval(pollInterval); supabase.removeChannel(channel); };
}
