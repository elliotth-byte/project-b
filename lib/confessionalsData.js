import { supabase } from "./supabaseClient";
import { storageUpdate, subscribeGameState } from "./gameStorage";

export const CONFESSIONAL_TAGS = ["Strategy", "Suspicion", "Alliance", "Mission", "Lie", "Emotional", "Confession", "Other"];

// Scope note: the original spec's optional "Confessional Prompts" feature
// described full CRUD over a history of prompts. Implemented here as a
// small list of currently-active prompts instead of a full history table —
// the host sets one (optionally aimed at specific players), players see
// whichever ones apply to them, done. Each prompt can be global (shown to
// everyone, targetPlayerIds: null) or targeted at one or more specific
// players (targetPlayerIds: [...]) — several can be active at once, so a
// host can send different players different prompts in the same round.
// Prompts aren't secret, so this lives in the shared game_state table like
// everything else non-confidential; per-player targeting is enforced by
// each player's own client only showing prompts addressed to them, the
// same trust level as everything else in game_state (nothing here is a
// substitute for confessional privacy itself, which the dedicated
// `confessionals` table + RLS still fully owns).
export const STORAGE_KEY_CONFESSIONAL_PROMPTS = "pb:confessional-prompts";

export function subscribeConfessionalPrompts(gameId, onChange) {
  return subscribeGameState(gameId, STORAGE_KEY_CONFESSIONAL_PROMPTS, (v) => onChange(v || []));
}

// targetPlayerIds: omit/null/[] for a global prompt everyone sees.
export async function addConfessionalPrompt(gameId, prompt, round, targetPlayerIds) {
  const text = (prompt || "").trim();
  if (!text) return { ok: false };
  const res = await storageUpdate(gameId, STORAGE_KEY_CONFESSIONAL_PROMPTS, (fresh) => {
    const list = fresh || [];
    return [...list, {
      // A real UUID, not a "timestamp-random" string — the confessionals
      // table's prompt_id column is uuid-typed (sql/add-confessionals.sql),
      // and Postgres flatly rejects a non-UUID string there. That's what
      // was actually breaking confessional submissions any time a prompt
      // was active: submitConfessional (below) attaches prompt?.id to
      // every submission while a prompt applies, so the insert itself was
      // failing, not anything about the reply flow specifically.
      id: crypto.randomUUID(),
      prompt: text, round, createdAt: Date.now(),
      targetPlayerIds: targetPlayerIds?.length ? targetPlayerIds : null,
    }];
  });
  return { ok: res.ok };
}

export async function removeConfessionalPrompt(gameId, promptId) {
  return storageUpdate(gameId, STORAGE_KEY_CONFESSIONAL_PROMPTS, (fresh) => (fresh || []).filter((p) => p.id !== promptId));
}

// ─── Confessionals themselves — these go through the dedicated
// `confessionals` table (see sql/add-confessionals.sql), NOT the shared
// game_state blob pattern everything else in this project uses, because
// RLS needs to be per-row ("do you own this one"), not per-game.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function submitConfessional({ gameId, playerId, playerName, round, text, tags, promptId }) {
  // prompt_id is uuid-typed in the DB (sql/add-confessionals.sql) — a
  // submission should never be blockable by a malformed prompt reference
  // (e.g. a prompt created before addConfessionalPrompt generated real
  // UUIDs, still sitting active in an existing game). Silently dropping
  // it here just means that one submission doesn't link back to the
  // prompt that inspired it — much better than failing the whole
  // confessional over it.
  const safePromptId = promptId && UUID_RE.test(promptId) ? promptId : null;
  const { data, error } = await supabase
    .from("confessionals")
    .insert({
      game_id: gameId, player_id: playerId, player_name: playerName,
      round: round || null, text, tags: tags || [], prompt_id: safePromptId,
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
export async function respondToConfessional(id, reply, senderName) {
  const text = (reply || "").trim();
  const { error } = await supabase
    .from("confessionals")
    .update({
      host_reply: text || null,
      host_reply_at: text ? new Date().toISOString() : null,
      // Only set alongside an actual reply — clearing a reply (text
      // empty) clears the sender name with it via the same null,
      // rather than leaving a stale name attached to no reply at all.
      host_reply_sender_name: text ? (senderName?.trim() || "Host") : null,
    })
    .eq("id", id);
  return !error;
}

// Confessionals need read access gated by RLS (see sql/add-confessionals.sql),
// so rather than push actual row payloads through the realtime channel,
// this just tells the caller "something changed, re-fetch via
// fetchAllConfessionals/fetchOwnConfessionals" — which is also why the
// periodic interval fallback here doubles as its own resilience against a
// dropped realtime connection (a phone locking, backgrounding the tab, a
// network blip) missing events for good; the visibility listener just
// makes recovery near-instant instead of waiting up to 6s.
export function subscribeConfessionalsTable(gameId, onChange) {
  const channel = supabase
    .channel(`confessionals:${gameId}:${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "confessionals", filter: `game_id=eq.${gameId}` }, onChange)
    .subscribe();
  const pollInterval = window.setInterval(onChange, 45000);
  const onVisible = () => { if (document.visibilityState === "visible") onChange(); };
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);
  return () => {
    window.clearInterval(pollInterval);
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
    supabase.removeChannel(channel);
  };
}
