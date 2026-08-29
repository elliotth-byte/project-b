import { supabase } from "./supabaseClient";
import { storageUpdate, subscribeGameState } from "./gameStorage";

// ============================================================
// Group chat — reuses game_state (see sql/schema.sql), same visibility
// group chat already needs: readable/writable by anyone in the game.
// No cap — every message is retained for the whole season. (Previously
// trimmed to the most recent 500; removed per explicit request. Each
// send rewrites the whole blob, so an ever-growing single JSON value
// does mean sends get marginally heavier as a season goes on, but for
// realistic message volumes in a season — even several thousand short
// messages — that's still well under a couple MB, nowhere near jsonb's
// actual limits. Worth revisiting only if a season's chat volume turns
// out to be far heavier than a typical friend-group season.)
// ============================================================

export const GROUP_CHAT_KEY = "pb:group-chat";
const GROUP_CHAT_READS_KEY = "pb:group-chat-reads";

export function subscribeGroupChat(gameId, onChange) {
  return subscribeGameState(gameId, GROUP_CHAT_KEY, (v) => onChange(v || []));
}

export async function sendGroupMessage(gameId, senderId, senderName, body, realName) {
  const text = (body || "").trim();
  if (!text) return { ok: true };
  const res = await storageUpdate(gameId, GROUP_CHAT_KEY, (fresh) => {
    const list = fresh || [];
    return [...list, {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      senderId, senderName, senderRealName: realName || senderName, body: text, createdAt: Date.now(),
    }];
  });
  if (!res.ok) console.error("sendGroupMessage failed", res);
  return { ok: res.ok, error: res.ok ? null : "The message didn't save — try again." };
}

// Group chat reactions live directly on each message object (a
// `reactions: [{playerId, emoji}]` array), inside the same game_state
// JSON blob everything else about group chat already lives in — there's
// no real per-message row to attach a separate table to (see
// sql/add-chat-reactions.sql's header for why thread reactions work
// differently). Toggling means: add it if this player hasn't reacted
// with this emoji on this message yet, remove it if they have — the
// standard "tap to react, tap again to un-react" pattern.
export async function toggleGroupReaction(gameId, messageId, playerId, emoji) {
  const res = await storageUpdate(gameId, GROUP_CHAT_KEY, (fresh) => {
    const list = fresh || [];
    return list.map((m) => {
      if (m.id !== messageId) return m;
      const reactions = m.reactions || [];
      const existingIdx = reactions.findIndex((r) => r.playerId === playerId && r.emoji === emoji);
      const nextReactions = existingIdx === -1
        ? [...reactions, { playerId, emoji }]
        : reactions.filter((_, i) => i !== existingIdx);
      return { ...m, reactions: nextReactions };
    });
  });
  if (!res.ok) console.error("toggleGroupReaction failed", res);
  return { ok: res.ok };
}

// One shared game_state key holding { [playerId]: timestamp } — simple
// enough not to need its own table, and read/write volume here is low
// (once per player per visit to the tab, not per message).
export function subscribeGroupChatReads(gameId, onChange) {
  return subscribeGameState(gameId, GROUP_CHAT_READS_KEY, (v) => onChange(v || {}));
}

export async function markGroupChatRead(gameId, playerId) {
  await storageUpdate(gameId, GROUP_CHAT_READS_KEY, (fresh) => ({ ...(fresh || {}), [playerId]: Date.now() }));
}

// ============================================================
// Chat threads — DMs (2 members) and named groups (3+) are the same
// underlying model: a chat_threads row plus a chat_thread_members row per
// participant. Real privacy either way (readable only by members and the
// host, same bar as confessionals) — see sql/add-group-chat.sql for the
// schema and RLS, and why thread/member creation goes through the
// create_chat_thread() RPC rather than direct inserts.
// ============================================================

// memberIds should include the caller themselves. Omit `name` for a 1:1
// DM (the UI derives a label from the other member); pass one for a
// named group.
export async function createOrGetThread(gameId, memberIds, name) {
  const { data, error } = await supabase.rpc("create_chat_thread", {
    p_game_id: gameId, p_member_ids: memberIds, p_name: name || null,
  });
  if (error) {
    console.error("createOrGetThread failed", error);
    return { threadId: null, error: error.message };
  }
  return { threadId: data, error: null };
}

// Every thread a player belongs to, with its member list attached (so the
// UI can show "Alice, Bob" for a group without a separate round trip).
export async function fetchMyThreads(gameId, playerId) {
  const { data, error } = await supabase
    .from("chat_threads")
    .select("*, chat_thread_members(player_id)")
    .eq("game_id", gameId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("fetchMyThreads failed — chat tables may not be migrated yet (see sql/add-group-chat.sql)", error);
    return [];
  }
  // RLS already restricts this to threads the caller is a member of (or
  // is the host viewing) — this filter is just to exclude the auto-
  // managed Exile Room, which gets its own dedicated view instead of
  // showing up in the regular thread list, and to derive each thread's
  // OTHER member ids for display.
  return (data || [])
    .filter((t) => !t.is_exile_room)
    .map((t) => ({ ...t, memberIds: (t.chat_thread_members || []).map((m) => m.player_id), otherMemberIds: (t.chat_thread_members || []).map((m) => m.player_id).filter((id) => id !== playerId) }));
}

export async function fetchExileRoom(gameId) {
  const { data, error } = await supabase
    .from("chat_threads")
    .select("*, chat_thread_members(player_id)")
    .eq("game_id", gameId)
    .eq("is_exile_room", true)
    .maybeSingle();
  if (error || !data) return null;
  return { ...data, memberIds: (data.chat_thread_members || []).map((m) => m.player_id) };
}

// Host-only view — RLS's is_game_host() clause is what actually makes
// this return every thread instead of just the caller's own.
export async function fetchAllThreads(gameId) {
  const { data, error } = await supabase
    .from("chat_threads")
    .select("*, chat_thread_members(player_id)")
    .eq("game_id", gameId)
    .order("created_at", { ascending: false });
  if (error) console.error("fetchAllThreads failed", error);
  return (data || []).map((t) => ({ ...t, memberIds: (t.chat_thread_members || []).map((m) => m.player_id) }));
}

export async function fetchThreadMessages(threadId) {
  const { data, error } = await supabase.from("chat_messages").select("*").eq("thread_id", threadId).order("created_at", { ascending: true });
  if (error) console.error("fetchThreadMessages failed", error);
  return data || [];
}

export async function sendThreadMessage(threadId, senderId, body) {
  const text = (body || "").trim();
  if (!text) return { ok: true };
  const { error } = await supabase.from("chat_messages").insert({ thread_id: threadId, sender_id: senderId, body: text });
  if (error) console.error("sendThreadMessage failed", error);
  return { ok: !error, error: error?.message };
}

export async function markThreadRead(threadId, playerId) {
  await supabase.from("chat_thread_reads").upsert({ thread_id: threadId, player_id: playerId, last_read_at: new Date().toISOString() });
}

export function subscribeThreadReads(playerId, onChange) {
  const channel = supabase
    .channel(`chat-reads:${playerId}:${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "chat_thread_reads", filter: `player_id=eq.${playerId}` }, onChange)
    .subscribe();
  const intervalId = setInterval(onChange, 45000);
  return () => { clearInterval(intervalId); supabase.removeChannel(channel); };
}

export async function fetchThreadReads(playerId) {
  const { data } = await supabase.from("chat_thread_reads").select("thread_id, last_read_at").eq("player_id", playerId);
  const map = {};
  (data || []).forEach((r) => (map[r.thread_id] = r.last_read_at));
  return map;
}

// One query for "what's the newest message in each of these threads" —
// used purely for unread badging, so a rough answer fetched occasionally
// (see subscribeAnyThreadActivity below) is plenty; no realtime
// subscription of its own.
export async function fetchLatestMessageTimestamps(threadIds) {
  if (!threadIds?.length) return {};
  const { data } = await supabase
    .from("chat_messages")
    .select("thread_id, created_at")
    .in("thread_id", threadIds)
    .order("created_at", { ascending: false });
  const map = {};
  (data || []).forEach((m) => { if (!map[m.thread_id]) map[m.thread_id] = m.created_at; });
  return map;
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
    .channel(`chat-thread:${threadId}:${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages", filter: `thread_id=eq.${threadId}` }, resync)
    .subscribe();

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

// Host inbox — every thread's messages at once would be a lot of
// subscriptions; this just watches for ANY new chat_messages row in the
// game's threads and lets the caller re-fetch whichever thread they have
// open. gameId isn't a column on chat_messages, so this can't filter
// server-side by it — harmless, since the callback is cheap (just
// triggers a re-fetch of whatever's currently open).
export function subscribeAnyThreadActivity(gameId, onChange) {
  const channel = supabase
    .channel(`chat-activity:${gameId}:${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages" }, onChange)
    .subscribe();
  const intervalId = setInterval(onChange, 45000);
  return () => { clearInterval(intervalId); supabase.removeChannel(channel); };
}

// ============================================================
// Thread message reactions — see sql/add-chat-reactions.sql for the
// schema and why this is a real table (chat_messages rows are real, so
// there's something to attach a foreign key to) unlike group chat's
// reactions, which live directly on each message object instead (see
// toggleGroupReaction above).
// ============================================================

export async function fetchThreadReactions(threadId) {
  const { data, error } = await supabase.from("chat_reactions").select("*").eq("thread_id", threadId);
  if (error) console.error("fetchThreadReactions failed", error);
  return data || [];
}

// Same toggle semantics as toggleGroupReaction — add if this player
// hasn't reacted with this emoji on this message yet, remove if they
// have.
export async function toggleThreadReaction(threadId, messageId, playerId, emoji) {
  const { data: existing } = await supabase
    .from("chat_reactions").select("id").eq("message_id", messageId).eq("player_id", playerId).eq("emoji", emoji).maybeSingle();
  if (existing) {
    const { error } = await supabase.from("chat_reactions").delete().eq("id", existing.id);
    if (error) console.error("toggleThreadReaction (remove) failed", error);
    return { ok: !error };
  }
  const { error } = await supabase.from("chat_reactions").insert({ thread_id: threadId, message_id: messageId, player_id: playerId, emoji });
  if (error) console.error("toggleThreadReaction (add) failed", error);
  return { ok: !error };
}

// Same resilience reasoning as subscribeThreadMessages above — re-syncs
// periodically and on tab-visible, not just on realtime pushes, so a
// dropped connection doesn't silently miss reactions.
export function subscribeThreadReactions(threadId, onChange) {
  let active = true;
  let lastJson;

  const emit = (reactions) => {
    const json = JSON.stringify(reactions);
    if (json === lastJson) return;
    lastJson = json;
    if (active) onChange(reactions);
  };

  const resync = () => fetchThreadReactions(threadId).then((v) => { if (active) emit(v); });
  resync();

  const channel = supabase
    .channel(`chat-reactions:${threadId}:${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "chat_reactions", filter: `thread_id=eq.${threadId}` }, resync)
    .subscribe();

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
