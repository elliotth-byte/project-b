import { useState, useEffect, useRef } from "react";
import { Card, Btn } from "./ui";
import { subscribeGroupChat, sendGroupMessage, getOrCreateThread, fetchMyThreads, subscribeThreadMessages, sendDM } from "../lib/chatData";

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function MessageBubble({ mine, name, body, time }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: mine ? "flex-end" : "flex-start", marginBottom: 8 }}>
      {!mine && <div style={{ fontSize: 10, color: "#a68fd6", marginBottom: 2, marginLeft: 4 }}>{name}</div>}
      <div style={{
        maxWidth: "80%", background: mine ? "linear-gradient(135deg, #ff2d95, #b829ff)" : "#0d0618",
        border: mine ? "none" : "1px solid #3d1f5c", color: mine ? "#05010f" : "#f5f0ff",
        borderRadius: 14, padding: "8px 12px", fontSize: 13, wordBreak: "break-word",
      }}>
        {body}
      </div>
      <div style={{ fontSize: 9, color: "#6b4f99", marginTop: 2 }}>{fmtTime(time)}</div>
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
    setText("");
    await onSend(t);
    setSending(false);
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

function GroupChatView({ gameId, player, realName }) {
  const [messages, setMessages] = useState([]);
  const listRef = useRef(null);

  useEffect(() => {
    const unsubscribe = subscribeGroupChat(gameId, setMessages);
    return unsubscribe;
  }, [gameId]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length]);

  const rows = messages.map((m) => ({
    id: m.id,
    node: <MessageBubble mine={m.senderId === player.id} name={m.senderName} body={m.body} time={m.createdAt} />,
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "60vh" }}>
      <MessageList messages={rows} containerRef={listRef} />
      <Composer placeholder="Message everyone..." onSend={(t) => sendGroupMessage(gameId, player.id, player.name, t, realName)} />
    </div>
  );
}

function DmThreadView({ thread, player, players, onBack }) {
  const [messages, setMessages] = useState([]);
  const listRef = useRef(null);
  const otherName = players.find((p) => p.id === thread.otherPlayerId)?.display_name || "?";

  useEffect(() => {
    const unsubscribe = subscribeThreadMessages(thread.id, setMessages);
    return unsubscribe;
  }, [thread.id]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length]);

  const rows = messages.map((m) => ({
    id: m.id,
    node: <MessageBubble mine={m.sender_id === player.id} name={otherName} body={m.body} time={m.created_at} />,
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "60vh" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: "#a68fd6", fontSize: 13, cursor: "pointer" }}>‹ Back</button>
        <strong style={{ color: "#f5f0ff", fontSize: 13 }}>{otherName}</strong>
      </div>
      <MessageList messages={rows} containerRef={listRef} />
      <Composer placeholder={`Message ${otherName}...`} onSend={(t) => sendDM(thread.id, player.id, t)} />
    </div>
  );
}

function DmListView({ gameId, player, players, openThread, setOpenThread }) {
  const [threads, setThreads] = useState([]);
  const [picking, setPicking] = useState(false);

  const reload = async () => setThreads(await fetchMyThreads(gameId, player.id));
  useEffect(() => { reload(); }, [gameId, player.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const startWith = async (otherId) => {
    const thread = await getOrCreateThread(gameId, player.id, otherId);
    if (thread) {
      setOpenThread({ ...thread, otherPlayerId: otherId });
      setPicking(false);
      reload();
    }
  };

  if (openThread) {
    return <DmThreadView thread={openThread} player={player} players={players} onBack={() => { setOpenThread(null); reload(); }} />;
  }

  const others = players.filter((p) => p.id !== player.id && p.approved);
  const alreadyThreaded = new Set(threads.map((t) => t.otherPlayerId));

  return (
    <div>
      {threads.length > 0 ? (
        <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
          {threads.map((t) => (
            <button
              key={t.id}
              onClick={() => setOpenThread(t)}
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 8,
                padding: "10px 14px", color: "#f5f0ff", fontSize: 13, cursor: "pointer", textAlign: "left",
              }}
            >
              {players.find((p) => p.id === t.otherPlayerId)?.display_name || "?"}
              <span style={{ color: "#6b4f99", fontSize: 16 }}>›</span>
            </button>
          ))}
        </div>
      ) : (
        !picking && <p style={{ color: "#6b4f99", fontSize: 12, fontStyle: "italic", margin: "0 0 12px" }}>No conversations yet.</p>
      )}

      {picking ? (
        <div>
          <div style={{ fontSize: 11, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Start a DM with...</div>
          <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
            {others.map((p) => (
              <button
                key={p.id}
                onClick={() => startWith(p.id)}
                style={{
                  background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 8, padding: "10px 14px",
                  color: "#f5f0ff", fontSize: 13, cursor: "pointer", textAlign: "left",
                }}
              >
                {p.display_name}{alreadyThreaded.has(p.id) && <span style={{ color: "#6b4f99", fontSize: 11 }}> (message again)</span>}
              </button>
            ))}
          </div>
          <Btn small variant="ghost" onClick={() => setPicking(false)}>Cancel</Btn>
        </div>
      ) : (
        <Btn small onClick={() => setPicking(true)}>+ New DM</Btn>
      )}
    </div>
  );
}

// ─── Chat ───
// Group chat and DMs both post as this player specifically — see
// lib/chatData.js for why group chat lives in game_state (same broad
// visibility it already needs) while DMs get their own tables (real
// privacy, host-readable — see sql/add-dms.sql). Only shown at all when
// the host has turned chat on for this season (settings.chatEnabled).
export default function ChatPanel({ gameId, player, players, realName }) {
  const [mode, setMode] = useState("group"); // "group" | "dm"
  const [openThread, setOpenThread] = useState(null);

  return (
    <div>
      <div style={{ display: "flex", gap: 4, marginBottom: 12, borderBottom: "1px solid #3d1f5c" }}>
        {[{ key: "group", label: "💬 Group" }, { key: "dm", label: "✉️ Direct Messages" }].map((t) => (
          <button key={t.key} onClick={() => { setMode(t.key); setOpenThread(null); }} style={{
            flex: 1, background: mode === t.key ? "rgba(255,45,149,0.13)" : "transparent",
            color: mode === t.key ? "#ff2d95" : "#a68fd6",
            border: "none", borderRadius: "8px 8px 0 0", padding: "8px 6px",
            fontSize: 12, fontWeight: 600, cursor: "pointer",
            borderBottom: mode === t.key ? "2px solid #ff2d95" : "2px solid transparent",
          }}>
            {t.label}
          </button>
        ))}
      </div>

      <Card>
        {mode === "group" ? (
          <GroupChatView gameId={gameId} player={player} realName={realName} />
        ) : (
          <DmListView gameId={gameId} player={player} players={players} openThread={openThread} setOpenThread={setOpenThread} />
        )}
      </Card>

      <p style={{ fontSize: 10, color: "#6b4f99", fontStyle: "italic", marginTop: 8, textAlign: "center" }}>
        The host can read direct messages, same as confessionals.
      </p>
    </div>
  );
}
