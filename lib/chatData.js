import { supabase } from "./supabaseClient";
import { storageUpdate, subscribeGameState } from "./gameStorage";

// ============================================================
// Group chat — reuses game_state (see sql/schema.sql), same visibility
// group chat already needs: readable/writable by anyone in the game.
// Trimmed to the most recent 200 messages so the blob doesn't grow
// unbounded over a long season.
// ============================================================

const GROUP_CHAT_KEY = "pb:group-chat";
const MAX_GROUP_MESSAGES = 200;

export function subscribeGroupChat(gameId, onChange) {
  return subscribeGameState(gameId, GROUP_CHAT_KEY, (v) => onChange(v || []));
}

export async function sendGroupMessage(gameId, senderId, senderName, body, realName) {
  const text = (body || "").trim();
  if (!text) return { ok: true };
  const res = await storageUpdate(gameId, GROUP_CHAT_KEY, (fresh) => {
    const list = fresh || [];
    const next = [...list, {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      senderId, senderName, senderRealName: realName || senderName, body: text, createdAt: Date.now(),
    }];
    return next.length > MAX_GROUP_MESSAGES ? next.slice(next.length - MAX_GROUP_MESSAGES) : next;
  });
  if (!res.ok) console.error("sendGroupMessage failed", res);
  return { ok: res.ok, error: res.ok ? null : "The message didn't save — try again." };
}

// ============================================================
// Player DMs — real privacy (readable only by the two participants and
// the host, same bar as confessionals), so these need their own tables
// with their own RLS rather than living in game_state — see
// sql/add-dms.sql for why and for the actual policies.
// ============================================================

// player_a_id/player_b_id order has to be consistent regardless of who
// opens the thread first, both for the DB's uniqueness constraint and so
// two people opening a DM with each other at the same moment land on the
// SAME thread instead of two.
function sortedPair(idA, idB) {
  return idA < idB ? [idA, idB] : [idB, idA];
}

export async function getOrCreateThread(gameId, myPlayerId, otherPlayerId) {
  const [a, b] = sortedPair(myPlayerId, otherPlayerId);
  const { data: existing, error: readError } = await supabase
    .from("dm_threads").select("*").eq("game_id", gameId).eq("player_a_id", a).eq("player_b_id", b).maybeSingle();
  if (readError) {
    console.error("getOrCreateThread: couldn't check for an existing thread", readError);
    return { thread: null, error: readError.message };
  }
  if (existing) return { thread: existing, error: null };

  const { data: created, error: insertError } = await supabase
    .from("dm_threads").insert({ game_id: gameId, player_a_id: a, player_b_id: b }).select().single();
  if (!insertError) return { thread: created, error: null };

  // A unique-constraint violation here almost always means the other
  // participant opened the exact same thread in the same instant — that's
  // fine, just fetch what they created instead of treating it as a real
  // failure.
  const { data: retry } = await supabase
    .from("dm_threads").select("*").eq("game_id", gameId).eq("player_a_id", a).eq("player_b_id", b).maybeSingle();
  if (retry) return { thread: retry, error: null };

  console.error("getOrCreateThread: couldn't create a thread", insertError);
  return { thread: null, error: insertError.message };
}

// Every thread a player is part of, each with the OTHER participant's id
// so the UI can show a name — the player list itself comes from the
// caller (already has everyone's names from the roster).
export async function fetchMyThreads(gameId, playerId) {
  const { data, error } = await supabase
    .from("dm_threads").select("*").eq("game_id", gameId)
    .or(`player_a_id.eq.${playerId},player_b_id.eq.${playerId}`)
    .order("created_at", { ascending: false });
  if (error) console.error("fetchMyThreads failed — DM tables may not be migrated yet (see sql/add-dms.sql)", error);
  return (data || []).map((t) => ({ ...t, otherPlayerId: t.player_a_id === playerId ? t.player_b_id : t.player_a_id }));
}

// Host-only view — RLS's is_game_host() clause is what actually makes
// this return every thread instead of just the caller's own.
export async function fetchAllThreads(gameId) {
  const { data } = await supabase.from("dm_threads").select("*").eq("game_id", gameId).order("created_at", { ascending: false });
  return data || [];
}

export async function fetchThreadMessages(threadId) {
  const { data } = await supabase.from("dm_messages").select("*").eq("thread_id", threadId).order("created_at", { ascending: true });
  return data || [];
}

export async function sendDM(threadId, senderId, body) {
  const text = (body || "").trim();
  if (!text) return { ok: true };
  const { error } = await supabase.from("dm_messages").insert({ thread_id: threadId, sender_id: senderId, body: text });
  if (error) console.error("sendDM failed", error);
  return { ok: !error, error: error?.message };
}

// Same resilience reasoning as lib/gameStorage.js's subscribeGameState —
// a dropped realtime connection means missed postgres_changes events are
// gone for good, so this also re-fetches periodically and the instant
// the tab becomes visible again, not just on realtime pushes.
export function subscribeThreadMessages(threadId, onChange) {
  let active = true;
  let lastJson;

  const emit = (messages) => {
    const json = JSON.stringify(messages);
    if (json === lastJson) return;
    lastJson = json;
    if (active) onChange(messages);
  };

  const resync = () => fetchThreadMessages(threadId).then((v) => { if (active) emit(v); });
  resync();

  const channel = supabase
    .channel(`dm-thread:${threadId}:${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "dm_messages", filter: `thread_id=eq.${threadId}` }, resync)
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

// Host inbox — every thread's messages at once would be a lot of
// subscriptions; this just watches for ANY new dm_messages row in the
// game's threads and lets the caller re-fetch whichever thread they have
// open. gameId isn't a column on dm_messages, so this can't filter
// server-side by it — harmless, since the callback is cheap (just
// triggers a re-fetch of whatever's currently open).
export function subscribeAnyDmActivity(gameId, onChange) {
  const channel = supabase
    .channel(`dm-activity:${gameId}:${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "dm_messages" }, onChange)
    .subscribe();
  const intervalId = setInterval(onChange, 6000);
  return () => { clearInterval(intervalId); supabase.removeChannel(channel); };
}
