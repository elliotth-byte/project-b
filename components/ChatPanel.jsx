import { useState, useEffect, useRef, useMemo } from "react";
import { Card, Btn } from "./ui";
import {
  subscribeGroupChat, sendGroupMessage, subscribeGroupChatReads, markGroupChatRead,
  createOrGetThread, fetchMyThreads, fetchExileRoom, subscribeThreadMessages, sendThreadMessage,
  markThreadRead, fetchThreadReads, subscribeThreadReads, fetchLatestMessageTimestamps, subscribeAnyThreadActivity,
} from "../lib/chatData";

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function UnreadDot() {
  return <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: "#ff3860", marginLeft: 5 }} />;
}

function MessageBubble({ mine, name, avatarUrl, body, time }) {
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
        {!mine && <div style={{ fontSize: 10, color: "#a68fd6", marginBottom: 2, marginLeft: 4 }}>{name}</div>}
        <div style={{
          background: mine ? "linear-gradient(135deg, #ff2d95, #b829ff)" : "#0d0618",
          border: mine ? "none" : "1px solid #3d1f5c", color: mine ? "#05010f" : "#f5f0ff",
          borderRadius: 14, padding: "8px 12px", fontSize: 13, wordBreak: "break-word",
        }}>
          {body}
        </div>
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

function Composer({ onSend, placeholder }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const submit = async () => {
    const t = text.trim();
    if (!t || sending) return;
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

function GroupChatView({ gameId, player, players, realName, onRead }) {
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
    node: <MessageBubble mine={m.senderId === player.id} name={m.senderName} avatarUrl={(players || []).find((p) => p.id === m.senderId)?.effectiveAvatarUrl} body={m.body} time={m.createdAt} />,
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "60vh" }}>
      <MessageList messages={rows} containerRef={listRef} />
      <Composer placeholder="Message everyone..." onSend={(t) => sendGroupMessage(gameId, player.id, player.name, t, realName)} />
    </div>
  );
}

function threadLabel(thread, player, byId) {
  if (thread.name) return thread.name;
  const others = (thread.otherMemberIds || thread.memberIds?.filter((id) => id !== player.id) || []);
  return others.map((id) => byId[id] || "?").join(", ") || "?";
}

function ThreadView({ thread, player, players, byId, onBack, onRead }) {
  const [messages, setMessages] = useState([]);
  const listRef = useRef(null);
  const label = threadLabel(thread, player, byId);

  useEffect(() => {
    const unsubscribe = subscribeThreadMessages(thread.id, setMessages);
    return unsubscribe;
  }, [thread.id]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length]);

  useEffect(() => { onRead?.(thread.id); }, [thread.id, messages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = messages.map((m) => ({
    id: m.id,
    node: <MessageBubble mine={m.sender_id === player.id} name={byId[m.sender_id] || "?"} avatarUrl={(players || []).find((p) => p.id === m.sender_id)?.effectiveAvatarUrl} body={m.body} time={m.created_at} />,
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "60vh" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: "#a68fd6", fontSize: 13, cursor: "pointer" }}>‹ Back</button>
        <strong style={{ color: "#f5f0ff", fontSize: 13 }}>{label}</strong>
      </div>
      <MessageList messages={rows} containerRef={listRef} />
      <Composer placeholder={`Message ${label}...`} onSend={(t) => sendThreadMessage(thread.id, player.id, t)} />
    </div>
  );
}

function unreadForThread(thread, reads, lastMessageAt) {
  if (!lastMessageAt) return false;
  const readAt = reads[thread.id];
  if (!readAt) return true;
  return new Date(lastMessageAt).getTime() > new Date(readAt).getTime();
}

function ExileRoomView({ gameId, player, players, byId, onRead }) {
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
  return <ThreadView thread={thread} player={player} players={players} byId={byId} onBack={() => {}} onRead={onRead} />;
}

function MessagesView({ gameId, player, players, byId, openThread, setOpenThread, reads, onRead }) {
  const [threads, setThreads] = useState([]);
  const [picking, setPicking] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [groupName, setGroupName] = useState("");
  const [creating, setCreating] = useState(false);

  const reload = async () => setThreads(await fetchMyThreads(gameId, player.id));
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
    setThreads(fresh);
    const found = fresh.find((t) => t.id === threadId);
    setOpenThread(found || { id: threadId, memberIds: [player.id, ...selectedIds], otherMemberIds: selectedIds });
  };

  if (openThread) {
    return <ThreadView thread={openThread} player={player} players={players} byId={byId} onBack={() => { setOpenThread(null); reload(); }} onRead={onRead} />;
  }

  const others = players.filter((p) => p.id !== player.id && p.approved);

  return (
    <div>
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

      {picking ? (
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
export default function ChatPanel({ gameId, player, players, realName, isExiled }) {
  const [mode, setMode] = useState("group"); // "group" | "exile" | "messages"
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

  useEffect(() => {
    let active = true;
    const load = () => {
      fetchMyThreads(gameId, player.id).then((threads) => {
        if (!active || threads.length === 0) return;
        fetchLatestMessageTimestamps(threads.map((t) => t.id)).then((latest) => { if (active) setThreadLatest(latest); });
      });
    };
    load();
    const unsubscribe = subscribeAnyThreadActivity(gameId, load);
    return () => { active = false; unsubscribe(); };
  }, [gameId, player.id]);

  const groupUnread = groupLatestAt && (!groupReadAt || groupLatestAt > groupReadAt);
  const anyThreadUnread = Object.keys(threadLatest).some((id) => unreadForThread({ id }, threadReads, threadLatest[id]));

  const markGroupReadNow = () => markGroupChatRead(gameId, player.id);
  const markThreadReadNow = (threadId) => markThreadRead(threadId, player.id);

  const tabs = [
    { key: "group", label: "💬 Group", unread: groupUnread },
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
        {mode === "group" && <GroupChatView gameId={gameId} player={player} players={players} realName={realName} onRead={markGroupReadNow} />}
        {mode === "exile" && isExiled && <ExileRoomView gameId={gameId} player={player} players={players} byId={byId} onRead={markThreadReadNow} />}
        {mode === "messages" && (
          <MessagesView
            gameId={gameId} player={player} players={players} byId={byId}
            openThread={openThread} setOpenThread={setOpenThread}
            reads={{ thread: threadReads, latest: threadLatest }}
            onRead={markThreadReadNow}
          />
        )}
      </Card>
    </div>
  );
}
