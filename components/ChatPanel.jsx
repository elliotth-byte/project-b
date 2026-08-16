import { useState, useEffect, useRef, useMemo } from "react";
import { Card, Btn } from "./ui";
import {
  subscribeGroupChat, sendGroupMessage, subscribeGroupChatReads, markGroupChatRead,
  createOrGetThread, fetchMyThreads, fetchExileRoom, subscribeThreadMessages, sendThreadMessage,
  markThreadRead, fetchThreadReads, subscribeThreadReads, fetchLatestMessageTimestamps, subscribeAnyThreadActivity,
  toggleGroupReaction, subscribeThreadReactions, toggleThreadReaction,
} from "../lib/chatData";

import { colorFor } from "../lib/playerColors";
import { supabase } from "../lib/supabaseClient";

// Fire-and-forget — a push notification failing to send should never
// block or show an error for the actual message send, which already
// succeeded by the time this is called. Needs the caller's own auth
// token since pages/api/push/notify-message.js verifies the sender is
// really who they claim, not just an unauthenticated broadcast trigger.
async function notifyPushForMessage(gameId, kind, senderId, senderName, body, threadId) {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) return;
    await fetch("/api/push/notify-message", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ gameId, kind, senderId, senderName, body, threadId }),
    });
  } catch (e) {
    console.error("Push notify for message failed:", e);
  }
}

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function UnreadDot() {
  return <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: "#ff3860", marginLeft: 5 }} />;
}

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];

// Groups a flat [{playerId, emoji}] list into [{emoji, count, mine}] for
// display — mine controls the highlighted/filled look on a pill the
// current player has themselves reacted with.
function groupReactions(reactions, myPlayerId) {
  const byEmoji = {};
  (reactions || []).forEach((r) => {
    if (!byEmoji[r.emoji]) byEmoji[r.emoji] = { emoji: r.emoji, count: 0, mine: false };
    byEmoji[r.emoji].count += 1;
    if (r.playerId === myPlayerId) byEmoji[r.emoji].mine = true;
  });
  return Object.values(byEmoji);
}

function MessageBubble({ mine, name, nameColor, avatarUrl, body, time, reactions, myPlayerId, onToggleReaction, readOnly = false }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customEmoji, setCustomEmoji] = useState("");
  const grouped = groupReactions(reactions, myPlayerId);

  const submitCustom = () => {
    // Unicode code points, not JS string length (which counts UTF-16
    // units and would undercount most emoji) — trimmed and capped
    // generously enough for a compound emoji (skin tone modifier, ZWJ
    // sequences like a family or a flag) without accepting someone
    // pasting in actual sentences as a "reaction".
    const codePoints = [...customEmoji.trim()];
    if (codePoints.length === 0 || codePoints.length > 8) return;
    onToggleReaction?.(codePoints.join(""));
    setCustomEmoji("");
    setCustomOpen(false);
    setPickerOpen(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: mine ? "row-reverse" : "row", alignItems: "flex-end", gap: 6, marginBottom: 8 }}>
      {!mine && (
        avatarUrl ? (
          <img src={avatarUrl} alt="" style={{ width: 22, height: 22, borderRadius: "50%", objectFit: "cover", flexShrink: 0, marginBottom: 2 }} />
        ) : (
          <div style={{ width: 22, height: 22, flexShrink: 0 }} />
        )
      )}
      <div style={{ display: "flex", flexDirection: "column", alignItems: mine ? "flex-end" : "flex-start", maxWidth: "78%" }}>
        {!mine && <div style={{ fontSize: 10, color: nameColor || "#a68fd6", fontWeight: 700, marginBottom: 2, marginLeft: 4 }}>{name}</div>}
        <div
          onClick={() => { if (readOnly) return; setPickerOpen((v) => { if (v) { setCustomOpen(false); setCustomEmoji(""); } return !v; }); }}
          style={{
            background: mine ? "linear-gradient(135deg, #ff2d95, #b829ff)" : "#0d0618",
            border: mine ? "none" : `1px solid ${nameColor ? nameColor + "55" : "#3d1f5c"}`, color: mine ? "#05010f" : "#f5f0ff",
            borderRadius: 14, padding: "8px 12px", fontSize: 13, wordBreak: "break-word",
            cursor: readOnly ? "default" : "pointer",
          }}
        >
          {body}
        </div>

        {pickerOpen && !readOnly && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, background: "#150a28", border: "1px solid #3d1f5c", borderRadius: 20, padding: "4px 8px", marginTop: 4 }}>
            {!customOpen ? (
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                {QUICK_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => { onToggleReaction?.(emoji); setPickerOpen(false); }}
                    style={{ background: "none", border: "none", fontSize: 16, cursor: "pointer", padding: 2, lineHeight: 1 }}
                  >
                    {emoji}
                  </button>
                ))}
                <button
                  onClick={() => setCustomOpen(true)}
                  title="Choose any emoji"
                  style={{
                    background: "none", border: "1px solid #3d1f5c", borderRadius: "50%", width: 22, height: 22,
                    color: "#a68fd6", fontSize: 14, fontWeight: 700, cursor: "pointer", lineHeight: 1,
                    display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
                  }}
                >
                  +
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 4, alignItems: "center", padding: "4px 2px" }}>
                <input
                  autoFocus
                  value={customEmoji}
                  onChange={(e) => setCustomEmoji(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") submitCustom(); if (e.key === "Escape") setCustomOpen(false); }}
                  placeholder="Any emoji..."
                  style={{ width: 90, background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 12, padding: "4px 8px", color: "#f5f0ff", fontSize: 14 }}
                />
                <button
                  onClick={submitCustom}
                  disabled={!customEmoji.trim()}
                  style={{ background: "none", border: "none", color: customEmoji.trim() ? "#ff2d95" : "#3d1f5c", fontSize: 13, fontWeight: 700, cursor: customEmoji.trim() ? "pointer" : "default" }}
                >
                  Add
                </button>
              </div>
            )}
          </div>
        )}

        {grouped.length > 0 && (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
            {grouped.map((g) => (
              <button
                key={g.emoji}
                onClick={() => !readOnly && onToggleReaction?.(g.emoji)}
                disabled={readOnly}
                style={{
                  display: "flex", alignItems: "center", gap: 3, fontSize: 11, borderRadius: 12, padding: "2px 7px",
                  background: g.mine ? "rgba(255,45,149,0.18)" : "#0d0618",
                  border: `1px solid ${g.mine ? "#ff2d95" : "#3d1f5c"}`,
                  color: g.mine ? "#ff2d95" : "#a68fd6", cursor: readOnly ? "default" : "pointer",
                }}
              >
                <span>{g.emoji}</span><span>{g.count}</span>
              </button>
            ))}
          </div>
        )}

        <div style={{ fontSize: 9, color: "#6b4f99", marginTop: 2 }}>{fmtTime(time)}</div>
      </div>
    </div>
  );
}

function MessageList({ messages, containerRef }) {
  return (
    <div ref={containerRef} style={{ flex: 1, overflowY: "auto", padding: "12px 4px", display: "flex", flexDirection: "column" }}>
      {messages.length === 0 && (
        <p style={{ color: "#6b4f99", fontSize: 12, fontStyle: "italic", textAlign: "center", margin: "20px 0" }}>No messages yet — say something.</p>
      )}
      {messages.map((m) => <div key={m.id}>{m.node}</div>)}
    </div>
  );
}

function Composer({ onSend, placeholder, readOnly = false }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const submit = async () => {
    const t = text.trim();
    if (!t || sending || readOnly) return;
    setSending(true);
    const prevText = t;
    setText("");
    const result = await onSend(t);
    setSending(false);
    if (result && result.ok === false) {
      setText(prevText); // don't lose what they typed on a failed send
      alert("Couldn't send: " + (result.error || "unknown error — check the browser console for details."));
    }
  };
  if (readOnly) {
    return (
      <div style={{ paddingTop: 8, textAlign: "center" }}>
        <p style={{ color: "#6b4f99", fontSize: 12, fontStyle: "italic", margin: 0 }}>
          Read-only preview — sending is disabled here so nothing goes out as this player.
        </p>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", gap: 8, paddingTop: 8 }}>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        placeholder={placeholder}
        style={{ flex: 1, background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 20, padding: "10px 14px", color: "#f5f0ff", fontSize: 13 }}
      />
      <Btn small onClick={submit} disabled={!text.trim() || sending}>Send</Btn>
    </div>
  );
}

function GroupChatView({ gameId, player, players, realName, onRead, readOnly = false }) {
  const [messages, setMessages] = useState([]);
  const listRef = useRef(null);

  useEffect(() => {
    const unsubscribe = subscribeGroupChat(gameId, setMessages);
    return unsubscribe;
  }, [gameId]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length]);

  // Viewing the tab is what counts as "read" — matches how the other
  // rooms work (opening a thread marks it read the same way).
  useEffect(() => { onRead?.(); }, [messages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = messages.map((m) => ({
    id: m.id,
    node: (
      <MessageBubble
        mine={m.senderId === player.id} name={m.senderName} nameColor={colorFor(players, m.senderId)}
        avatarUrl={(players || []).find((p) => p.id === m.senderId)?.effectiveAvatarUrl} body={m.body} time={m.createdAt}
        reactions={m.reactions} myPlayerId={player.id} readOnly={readOnly}
        onToggleReaction={(emoji) => toggleGroupReaction(gameId, m.id, player.id, emoji)}
      />
    ),
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "60vh" }}>
      <MessageList messages={rows} containerRef={listRef} />
      <Composer placeholder="Message everyone..." readOnly={readOnly} onSend={(t) => { sendGroupMessage(gameId, player.id, player.name, t, realName); notifyPushForMessage(gameId, "group", player.id, player.name, t); }} />
    </div>
  );
}

function threadLabel(thread, player, byId) {
  if (thread.name) return thread.name;
  const others = (thread.otherMemberIds || thread.memberIds?.filter((id) => id !== player.id) || []);
  return others.map((id) => byId[id] || "?").join(", ") || "?";
}

function ThreadView({ gameId, thread, player, players, byId, onBack, onRead, readOnly = false }) {
  const [messages, setMessages] = useState([]);
  const [reactions, setReactions] = useState([]);
  const listRef = useRef(null);
  const label = threadLabel(thread, player, byId);

  useEffect(() => {
    const unsubscribe = subscribeThreadMessages(thread.id, setMessages);
    return unsubscribe;
  }, [thread.id]);

  useEffect(() => {
    const unsubscribe = subscribeThreadReactions(thread.id, setReactions);
    return unsubscribe;
  }, [thread.id]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length]);

  useEffect(() => { onRead?.(thread.id); }, [thread.id, messages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = messages.map((m) => ({
    id: m.id,
    node: (
      <MessageBubble
        mine={m.sender_id === player.id} name={byId[m.sender_id] || "?"} nameColor={colorFor(players, m.sender_id)}
        avatarUrl={(players || []).find((p) => p.id === m.sender_id)?.effectiveAvatarUrl} body={m.body} time={m.created_at}
        reactions={reactions.filter((r) => r.message_id === m.id).map((r) => ({ playerId: r.player_id, emoji: r.emoji }))}
        myPlayerId={player.id} readOnly={readOnly}
        onToggleReaction={(emoji) => toggleThreadReaction(thread.id, m.id, player.id, emoji)}
      />
    ),
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "60vh" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: "#a68fd6", fontSize: 13, cursor: "pointer" }}>‹ Back</button>
        <strong style={{ color: "#f5f0ff", fontSize: 13 }}>{label}</strong>
      </div>
      <MessageList messages={rows} containerRef={listRef} />
      <Composer placeholder={`Message ${label}...`} readOnly={readOnly} onSend={(t) => { sendThreadMessage(thread.id, player.id, t); notifyPushForMessage(gameId, "thread", player.id, player.name, t, thread.id); }} />
    </div>
  );
}

function unreadForThread(thread, reads, lastMessageAt) {
  if (!lastMessageAt) return false;
  const readAt = reads[thread.id];
  if (!readAt) return true;
  return new Date(lastMessageAt).getTime() > new Date(readAt).getTime();
}

function ExileRoomView({ gameId, player, players, byId, onRead, readOnly = false }) {
  const [thread, setThread] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchExileRoom(gameId).then((t) => { if (active) { setThread(t); setLoading(false); } });
    return () => { active = false; };
  }, [gameId]);

  if (loading) return <p style={{ color: "#6b4f99", fontSize: 12, fontStyle: "italic" }}>Loading...</p>;
  if (!thread) {
    return <p style={{ color: "#6b4f99", fontSize: 12, fontStyle: "italic" }}>No one's been exiled yet — this room opens up the moment someone is.</p>;
  }
  return <ThreadView gameId={gameId} thread={thread} player={player} players={players} byId={byId} onBack={() => {}} onRead={onRead} readOnly={readOnly} />;
}

function MessagesView({ gameId, player, players, byId, openThread, setOpenThread, reads, onRead, isExiled, readOnly = false }) {
  const [threads, setThreads] = useState([]);
  const [picking, setPicking] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [groupName, setGroupName] = useState("");
  const [creating, setCreating] = useState(false);

  // Once exiled, a player can only reach — or be reached by, as far as
  // their own view shows — other players who are ALSO out of the game.
  // isPlayerOut checks the roster's alive flag directly rather than
  // relying on anything thread-specific, so it stays correct even for a
  // thread that predates someone's exile.
  const isPlayerOut = (id) => players.find((p) => p.id === id)?.alive === false;

  const reload = async () => {
    const all = await fetchMyThreads(gameId, player.id);
    setThreads(isExiled ? all.filter((t) => (t.memberIds || []).every((id) => id === player.id || isPlayerOut(id))) : all);
  };
  useEffect(() => { reload(); }, [gameId, player.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSelect = (id) => setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const startThread = async () => {
    if (selectedIds.length === 0) return;
    setCreating(true);
    const { threadId, error } = await createOrGetThread(gameId, [player.id, ...selectedIds], selectedIds.length > 1 ? (groupName.trim() || null) : null);
    setCreating(false);
    if (!threadId) {
      alert("Couldn't start that conversation: " + (error || "unknown error — check the browser console for details."));
      return;
    }
    setPicking(false);
    setSelectedIds([]);
    setGroupName("");
    await reload();
    const fresh = await fetchMyThreads(gameId, player.id);
    setThreads(isExiled ? fresh.filter((t) => (t.memberIds || []).every((id) => id === player.id || isPlayerOut(id))) : fresh);
    const found = fresh.find((t) => t.id === threadId);
    setOpenThread(found || { id: threadId, memberIds: [player.id, ...selectedIds], otherMemberIds: selectedIds });
  };

  if (openThread) {
    return <ThreadView gameId={gameId} thread={openThread} player={player} players={players} byId={byId} onBack={() => { setOpenThread(null); reload(); }} onRead={onRead} readOnly={readOnly} />;
  }

  // Same restriction applies to who shows up when starting a brand new
  // conversation — an exiled player can only pick from other players
  // who are also out of the game.
  const others = players.filter((p) => p.id !== player.id && p.approved && (!isExiled || p.alive === false));

  return (
    <div>
      {isExiled && (
        <p style={{ fontSize: 11, color: "#6b4f99", fontStyle: "italic", margin: "0 0 10px" }}>
          You can only message other players who are also out of the game.
        </p>
      )}
      {threads.length > 0 && (
        <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
          {threads.map((t) => {
            return (
              <button
                key={t.id}
                onClick={() => setOpenThread(t)}
                style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 8,
                  padding: "10px 14px", color: "#f5f0ff", fontSize: 13, cursor: "pointer", textAlign: "left",
                }}
              >
                <span>{threadLabel(t, player, byId)}{t.is_group && <span style={{ color: "#6b4f99", fontSize: 10 }}> · group</span>}</span>
                <span style={{ display: "flex", alignItems: "center" }}>
                  {unreadForThread(t, reads.thread, reads.latest[t.id]) && <UnreadDot />}
                  <span style={{ color: "#6b4f99", fontSize: 16, marginLeft: 6 }}>›</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
      {threads.length === 0 && !picking && <p style={{ color: "#6b4f99", fontSize: 12, fontStyle: "italic", margin: "0 0 12px" }}>No conversations yet.</p>}

      {readOnly ? null : picking ? (
        <div>
          <div style={{ fontSize: 11, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
            Select one person for a DM, or several for a group
          </div>
          <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
            {others.map((p) => {
              const selected = selectedIds.includes(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => toggleSelect(p.id)}
                  style={{
                    background: selected ? "rgba(255,45,149,0.15)" : "#0d0618",
                    border: `1px solid ${selected ? "#ff2d95" : "#3d1f5c"}`,
                    borderRadius: 8, padding: "10px 14px", color: "#f5f0ff", fontSize: 13, cursor: "pointer", textAlign: "left",
                  }}
                >
                  {selected ? "✓ " : ""}{p.display_name}
                </button>
              );
            })}
          </div>
          {selectedIds.length > 1 && (
            <input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Group name (optional)"
              style={{ width: "100%", boxSizing: "border-box", background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 8, padding: "8px 12px", color: "#f5f0ff", fontSize: 13, marginBottom: 10 }}
            />
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <Btn small onClick={startThread} disabled={selectedIds.length === 0 || creating}>
              {creating ? "Starting..." : selectedIds.length > 1 ? `Start group (${selectedIds.length})` : "Start DM"}
            </Btn>
            <Btn small variant="ghost" onClick={() => { setPicking(false); setSelectedIds([]); setGroupName(""); }}>Cancel</Btn>
          </div>
        </div>
      ) : (
        <Btn small onClick={() => setPicking(true)}>+ New Chat</Btn>
      )}
    </div>
  );
}

// ─── Chat ───
// Three rooms: the main Group chat (everyone, lives in game_state — see
// lib/chatData.js), the Exile Room (auto-managed, opens the moment
// someone's actually exiled, membership kept in sync by
// lib/roundEngine.js), and Messages (1:1 DMs and player-created multi-
// member groups, both the same underlying model — see
// sql/add-group-chat.sql). Only shown at all when the host has turned
// chat on for this season (settings.chatEnabled).
export default function ChatPanel({ gameId, player, players, realName, isExiled, readOnly = false }) {
  const [mode, setMode] = useState(isExiled ? "exile" : "group"); // "group" | "exile" | "messages"
  const [openThread, setOpenThread] = useState(null);
  const [groupReadAt, setGroupReadAt] = useState(null);
  const [groupLatestAt, setGroupLatestAt] = useState(null);
  const [threadReads, setThreadReads] = useState({});
  const [threadLatest, setThreadLatest] = useState({});

  const byId = useMemo(() => {
    const m = {};
    (players || []).forEach((p) => (m[p.id] = p.display_name));
    return m;
  }, [players]);

  // Unread signals — best-effort, not pixel-perfect: group chat compares
  // the newest message's timestamp against this player's last-read mark;
  // threads do the same per-thread. Both are cheap enough to just poll
  // alongside the realtime subscriptions the underlying data already has.
  useEffect(() => {
    const unsubMessages = subscribeGroupChat(gameId, (msgs) => setGroupLatestAt(msgs.length ? msgs[msgs.length - 1].createdAt : null));
    const unsubReads = subscribeGroupChatReads(gameId, (reads) => setGroupReadAt(reads[player.id] || null));
    return () => { unsubMessages(); unsubReads(); };
  }, [gameId, player.id]);

  useEffect(() => {
    let active = true;
    const load = async () => { const m = await fetchThreadReads(player.id); if (active) setThreadReads(m); };
    load();
    const unsubscribe = subscribeThreadReads(player.id, load);
    return () => { active = false; unsubscribe(); };
  }, [player.id]);

  // Once exiled, DM/group threads that still include someone in the game
  // aren't shown at all — same restriction as MessagesView applies to
  // the actual thread list, applied here too so the unread badge doesn't
  // count activity in a conversation the player can't even open.
  const isPlayerOut = (id) => (players || []).find((p) => p.id === id)?.alive === false;

  useEffect(() => {
    let active = true;
    const load = () => {
      fetchMyThreads(gameId, player.id).then((threads) => {
        if (!active) return;
        const visible = isExiled ? threads.filter((t) => (t.memberIds || []).every((id) => id === player.id || isPlayerOut(id))) : threads;
        if (visible.length === 0) { setThreadLatest({}); return; }
        fetchLatestMessageTimestamps(visible.map((t) => t.id)).then((latest) => { if (active) setThreadLatest(latest); });
      });
    };
    load();
    const unsubscribe = subscribeAnyThreadActivity(gameId, load);
    return () => { active = false; unsubscribe(); };
  }, [gameId, player.id, isExiled]); // eslint-disable-line react-hooks/exhaustive-deps

  const groupUnread = groupLatestAt && (!groupReadAt || groupLatestAt > groupReadAt);
  const anyThreadUnread = Object.keys(threadLatest).some((id) => unreadForThread({ id }, threadReads, threadLatest[id]));

  const markGroupReadNow = () => markGroupChatRead(gameId, player.id);
  const markThreadReadNow = (threadId) => markThreadRead(threadId, player.id);

  // Once exiled, the main Group chat disappears entirely — not just a
  // new Exile tab added alongside it. "They should only see the exiled
  // chat / be able to DM players out of the game" means Group is gone,
  // not just de-emphasized.
  const tabs = [
    ...(isExiled ? [] : [{ key: "group", label: "💬 Panopticon", unread: groupUnread }]),
    ...(isExiled ? [{ key: "exile", label: "🔥 Exile" }] : []),
    { key: "messages", label: "✉️ Messages", unread: anyThreadUnread },
  ];

  return (
    <div>
      <div style={{ display: "flex", gap: 4, marginBottom: 12, borderBottom: "1px solid #3d1f5c" }}>
        {tabs.map((t) => (
          <button key={t.key} onClick={() => { setMode(t.key); setOpenThread(null); }} style={{
            flex: 1, background: mode === t.key ? "rgba(255,45,149,0.13)" : "transparent",
            color: mode === t.key ? "#ff2d95" : "#a68fd6",
            border: "none", borderRadius: "8px 8px 0 0", padding: "8px 6px",
            fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            borderBottom: mode === t.key ? "2px solid #ff2d95" : "2px solid transparent",
          }}>
            {t.label}{t.unread && <UnreadDot />}
          </button>
        ))}
      </div>

      <Card>
        {mode === "group" && !isExiled && <GroupChatView gameId={gameId} player={player} players={players} realName={realName} onRead={markGroupReadNow} readOnly={readOnly} />}
        {mode === "exile" && isExiled && <ExileRoomView gameId={gameId} player={player} players={players} byId={byId} onRead={markThreadReadNow} readOnly={readOnly} />}
        {mode === "messages" && (
          <MessagesView
            gameId={gameId} player={player} players={players} byId={byId}
            openThread={openThread} setOpenThread={setOpenThread}
            reads={{ thread: threadReads, latest: threadLatest }}
            onRead={markThreadReadNow}
            isExiled={isExiled}
            readOnly={readOnly}
          />
        )}
      </Card>
    </div>
  );
}
