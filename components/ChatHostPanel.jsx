import { useState, useEffect, useRef } from "react";
import { Card, Btn } from "./ui";
import { subscribeGroupChat, sendGroupMessage, fetchAllThreads, fetchThreadMessages, subscribeAnyThreadActivity, fetchLatestMessageTimestamps } from "../lib/chatData";
import { colorFor } from "../lib/playerColors";

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// ─── Host: Chat ───
// Group chat the host can post into like anyone else. DMs are read-only
// here on purpose — the host can see every conversation (same bar as
// confessionals — see sql/add-dms.sql), but never send AS a player; RLS
// enforces that even if this UI didn't.
export default function ChatHostPanel({ gameId, players, groupChatLabel = "💬 Panopticon" }) {
  const [mode, setMode] = useState("group");
  const [messages, setMessages] = useState([]);
  const [threads, setThreads] = useState([]);
  const [threadLatest, setThreadLatest] = useState({}); // threadId -> latest message's created_at, for most-recent-first sorting
  const [openThreadId, setOpenThreadId] = useState(null);
  const [threadMessages, setThreadMessages] = useState([]);
  const listRef = useRef(null);

  const byId = {};
  players.forEach((p) => (byId[p.id] = p.display_name));

  useEffect(() => {
    const unsubscribe = subscribeGroupChat(gameId, setMessages);
    return unsubscribe;
  }, [gameId]);

  const reloadThreads = async () => {
    const all = await fetchAllThreads(gameId);
    setThreads(all);
    if (all.length === 0) { setThreadLatest({}); return; }
    setThreadLatest(await fetchLatestMessageTimestamps(all.map((t) => t.id)));
  };
  useEffect(() => {
    reloadThreads();
    const unsubscribe = subscribeAnyThreadActivity(gameId, reloadThreads);
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
    // A more modest reduction than the 45-second fix applied elsewhere
    // in this app for the same egress problem — unlike those, this
    // specific view (an already-open DM thread) has no realtime
    // subscription backing it at all, so this poll is the ONLY thing
    // keeping it updated, not a safety net for missed events. Worth a
    // real realtime subscription here eventually (matching the pattern
    // lib/profileDms.js already uses), but that's a bigger change than
    // an urgent egress fix should risk right now.
    const interval = setInterval(load, 10000);
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
        {[{ key: "group", label: groupChatLabel }, { key: "dm", label: `✉️ Threads (${threads.length})` }].map((t) => (
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
                <span style={{ color: m.senderId === "host" ? "#ff2d95" : colorFor(players, m.senderId), fontWeight: 700 }}>
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
                <span style={{ color: colorFor(players, m.sender_id), fontWeight: 700 }}>{byId[m.sender_id] || "?"}</span>
                <span style={{ color: "#6b4f99", fontSize: 10, marginLeft: 6 }}>{fmtTime(m.created_at)}</span>
                <div style={{ color: "#a68fd6" }}>{m.body}</div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 10, color: "#6b4f99", fontStyle: "italic", textAlign: "center", marginTop: 6 }}>Read-only — hosts can watch but not post into a player's thread.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 6 }}>
          {threads.length === 0 ? (
            <p style={{ color: "#6b4f99", fontSize: 12, fontStyle: "italic" }}>No DMs or groups yet.</p>
          ) : (
            [...threads].sort((a, b) => {
              // Most-recently-active thread first — same reasoning and
              // same epoch fallback as the player-side thread list in
              // ChatPanel.jsx: a thread with no messages yet naturally
              // sorts to the very end rather than jumping to the top.
              const aLatest = threadLatest[a.id] ? new Date(threadLatest[a.id]).getTime() : 0;
              const bLatest = threadLatest[b.id] ? new Date(threadLatest[b.id]).getTime() : 0;
              return bLatest - aLatest;
            }).map((t) => (
              <button
                key={t.id}
                onClick={() => setOpenThreadId(t.id)}
                style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 8,
                  padding: "10px 14px", color: "#f5f0ff", fontSize: 13, cursor: "pointer", textAlign: "left",
                }}
              >
                <span>
                  {t.is_exile_room ? "🔥 Exile Room" : t.name || (t.memberIds || []).map((id) => byId[id] || "?").join(" ↔ ")}
                  {t.is_group && !t.is_exile_room && <span style={{ color: "#6b4f99", fontSize: 10 }}> · group ({(t.memberIds || []).length})</span>}
                </span>
                <span style={{ color: "#6b4f99", fontSize: 16 }}>›</span>
              </button>
            ))
          )}
        </div>
      )}
    </Card>
  );
}
