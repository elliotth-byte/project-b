import { useState, useEffect, useRef } from "react";
import { Card, Btn } from "./ui";
import { subscribeGroupChat, sendGroupMessage, fetchAllThreads, fetchThreadMessages, subscribeAnyDmActivity } from "../lib/chatData";

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// ─── Host: Chat ───
// Group chat the host can post into like anyone else. DMs are read-only
// here on purpose — the host can see every conversation (same bar as
// confessionals — see sql/add-dms.sql), but never send AS a player; RLS
// enforces that even if this UI didn't.
export default function ChatHostPanel({ gameId, players }) {
  const [mode, setMode] = useState("group");
  const [messages, setMessages] = useState([]);
  const [threads, setThreads] = useState([]);
  const [openThreadId, setOpenThreadId] = useState(null);
  const [threadMessages, setThreadMessages] = useState([]);
  const listRef = useRef(null);

  const byId = {};
  players.forEach((p) => (byId[p.id] = p.display_name));

  useEffect(() => {
    const unsubscribe = subscribeGroupChat(gameId, setMessages);
    return unsubscribe;
  }, [gameId]);

  const reloadThreads = async () => setThreads(await fetchAllThreads(gameId));
  useEffect(() => {
    reloadThreads();
    const unsubscribe = subscribeAnyDmActivity(gameId, reloadThreads);
    return unsubscribe;
  }, [gameId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!openThreadId) return;
    let active = true;
    const load = async () => {
      const msgs = await fetchThreadMessages(openThreadId);
      if (active) setThreadMessages(msgs);
    };
    load();
    const interval = setInterval(load, 4000);
    return () => { active = false; clearInterval(interval); };
  }, [openThreadId]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length, threadMessages.length]);

  const sendAsHost = async (text) => {
    const t = text.trim();
    if (!t) return;
    await sendGroupMessage(gameId, "host", "Host", t);
  };

  const [draft, setDraft] = useState("");

  return (
    <Card>
      <div style={{ display: "flex", gap: 4, marginBottom: 12, borderBottom: "1px solid #3d1f5c" }}>
        {[{ key: "group", label: "💬 Group Chat" }, { key: "dm", label: `✉️ Player DMs (${threads.length})` }].map((t) => (
          <button key={t.key} onClick={() => { setMode(t.key); setOpenThreadId(null); }} style={{
            background: mode === t.key ? "rgba(255,45,149,0.13)" : "transparent",
            color: mode === t.key ? "#ff2d95" : "#a68fd6",
            border: "none", borderRadius: "8px 8px 0 0", padding: "8px 12px",
            fontSize: 12, fontWeight: 600, cursor: "pointer",
            borderBottom: mode === t.key ? "2px solid #ff2d95" : "2px solid transparent",
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {mode === "group" ? (
        <div style={{ display: "flex", flexDirection: "column", height: "50vh" }}>
          <div ref={listRef} style={{ flex: 1, overflowY: "auto", padding: "8px 4px" }}>
            {messages.length === 0 && <p style={{ color: "#6b4f99", fontSize: 12, fontStyle: "italic" }}>No messages yet.</p>}
            {messages.map((m) => (
              <div key={m.id} style={{ marginBottom: 8, fontSize: 12 }}>
                <span style={{ color: m.senderId === "host" ? "#ff2d95" : "#f5f0ff", fontWeight: 700 }}>
                  {m.senderRealName && m.senderRealName !== m.senderName ? `${m.senderRealName} (${m.senderName})` : m.senderRealName || m.senderName}
                </span>
                <span style={{ color: "#6b4f99", fontSize: 10, marginLeft: 6 }}>{fmtTime(m.createdAt)}</span>
                <div style={{ color: "#a68fd6" }}>{m.body}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, paddingTop: 8 }}>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { sendAsHost(draft); setDraft(""); } }}
              placeholder="Message everyone as Host..."
              style={{ flex: 1, background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 20, padding: "10px 14px", color: "#f5f0ff", fontSize: 13 }}
            />
            <Btn small onClick={() => { sendAsHost(draft); setDraft(""); }} disabled={!draft.trim()}>Send</Btn>
          </div>
        </div>
      ) : openThreadId ? (
        <div style={{ display: "flex", flexDirection: "column", height: "50vh" }}>
          <button onClick={() => setOpenThreadId(null)} style={{ alignSelf: "flex-start", background: "none", border: "none", color: "#a68fd6", fontSize: 13, cursor: "pointer", marginBottom: 8 }}>
            ‹ Back to threads
          </button>
          <div ref={listRef} style={{ flex: 1, overflowY: "auto", padding: "8px 4px" }}>
            {threadMessages.length === 0 && <p style={{ color: "#6b4f99", fontSize: 12, fontStyle: "italic" }}>No messages in this thread yet.</p>}
            {threadMessages.map((m) => (
              <div key={m.id} style={{ marginBottom: 8, fontSize: 12 }}>
                <span style={{ color: "#f5f0ff", fontWeight: 700 }}>{byId[m.sender_id] || "?"}</span>
                <span style={{ color: "#6b4f99", fontSize: 10, marginLeft: 6 }}>{fmtTime(m.created_at)}</span>
                <div style={{ color: "#a68fd6" }}>{m.body}</div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 10, color: "#6b4f99", fontStyle: "italic", textAlign: "center", marginTop: 6 }}>Read-only — hosts can watch but not post into a player's DM.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 6 }}>
          {threads.length === 0 ? (
            <p style={{ color: "#6b4f99", fontSize: 12, fontStyle: "italic" }}>No DM conversations yet.</p>
          ) : (
            threads.map((t) => (
              <button
                key={t.id}
                onClick={() => setOpenThreadId(t.id)}
                style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 8,
                  padding: "10px 14px", color: "#f5f0ff", fontSize: 13, cursor: "pointer", textAlign: "left",
                }}
              >
                {byId[t.player_a_id] || "?"} ↔ {byId[t.player_b_id] || "?"}
                <span style={{ color: "#6b4f99", fontSize: 16 }}>›</span>
              </button>
            ))
          )}
        </div>
      )}
    </Card>
  );
}
