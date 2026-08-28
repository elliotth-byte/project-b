import { useState, useEffect, useRef } from "react";
import HomeLink from "../components/HomeLink";
import { supabase } from "../lib/supabaseClient";
import {
  searchPeopleToDm, getOrCreateThread, fetchMyThreads, fetchMessages,
  sendMessage, subscribeToThreadMessages, reportMessage,
} from "../lib/profileDms";

// ─── Cross-season Messages ───
// See sql/add-profile-dms.sql for the full design reasoning — this is
// the first messaging surface in this app that isn't scoped to a
// single season. Combines the inbox and "find someone new to message"
// into one page rather than a separate browse-profiles page, since
// searching for a person only really matters in service of messaging
// them right now.
export default function MessagesPage() {
  const [user, setUser] = useState(undefined);
  const [threads, setThreads] = useState(null);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [openThread, setOpenThread] = useState(null); // { threadId, otherUserId, otherDisplayName }
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [reportingId, setReportingId] = useState(null);
  const [reportReason, setReportReason] = useState("");
  const [reportStatus, setReportStatus] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user || null));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    fetchMyThreads(user.id).then(setThreads);
  }, [user]);

  useEffect(() => {
    if (!openThread) return;
    fetchMessages(openThread.threadId).then(setMessages);
    const unsubscribe = subscribeToThreadMessages(openThread.threadId, (msg) => setMessages((m) => [...m, msg]));
    return unsubscribe;
  }, [openThread]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const runSearch = async (e) => {
    e.preventDefault();
    setSearching(true);
    const res = await searchPeopleToDm(query);
    setSearching(false);
    setSearchResults(res);
  };

  const openWith = async (otherUserId, otherDisplayName) => {
    const thread = await getOrCreateThread(user.id, otherUserId);
    if (!thread) return;
    setOpenThread({ threadId: thread.id, otherUserId, otherDisplayName });
    setSearchResults(null);
    setQuery("");
    // Refresh the inbox so a brand new thread shows up there next time
    // this page loads, not just for this session.
    fetchMyThreads(user.id).then(setThreads);
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!draft.trim()) return;
    setSending(true);
    const res = await sendMessage(openThread.threadId, user.id, draft);
    setSending(false);
    if (res.ok) setDraft("");
  };

  const submitReport = async (messageId) => {
    const res = await reportMessage(messageId, user.id, reportReason);
    setReportStatus(res.ok ? "Reported. A platform admin will review it." : (res.error || "Couldn't submit that report."));
    if (res.ok) { setReportingId(null); setReportReason(""); }
  };

  if (user === undefined) return <div style={pageStyle}><p>Loading...</p></div>;
  if (!user) return <div style={pageStyle}><p>You need to be logged in. <a href="/login" style={{ color: "#ff2d95" }}>Log in</a></p></div>;

  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 480, width: "100%", margin: "0 auto" }}>
        <div style={{ marginBottom: 20, display: "flex", justifyContent: "space-between" }}>
          <HomeLink />
          {openThread && (
            <button onClick={() => setOpenThread(null)} style={{ background: "none", border: "none", color: "#a68fd6", fontSize: 12, cursor: "pointer" }}>
              ← Back to messages
            </button>
          )}
        </div>

        {!openThread ? (
          <>
            <form onSubmit={runSearch} style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <input
                type="text" value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Find someone to message..."
                style={{ flex: 1, background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 8, padding: "10px 12px", color: "#f5f0ff", fontSize: 14 }}
              />
              <button type="submit" disabled={searching || !query.trim()} style={{
                padding: "10px 16px", borderRadius: 8, border: "none", cursor: "pointer",
                background: "linear-gradient(135deg, #ff2d95, #b829ff)", color: "#05010f", fontSize: 13, fontWeight: 700,
              }}>
                {searching ? "..." : "Search"}
              </button>
            </form>

            {searchResults !== null && (
              <div style={{ marginBottom: 20 }}>
                {searchResults.length === 0 ? (
                  <p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic" }}>No matches.</p>
                ) : (
                  <div style={{ display: "grid", gap: 8 }}>
                    {searchResults.map((p) => (
                      <button
                        key={p.userId} onClick={() => openWith(p.userId, p.profileDisplayName || p.matchedName)}
                        style={{ display: "flex", alignItems: "center", gap: 10, background: "#1a0a2e", border: "1px solid #3d1f5c", borderRadius: 8, padding: "10px 12px", cursor: "pointer", textAlign: "left" }}
                      >
                        <PersonAvatar photoUrl={p.photoUrl} />
                        <span style={{ color: "#f5f0ff", fontSize: 13, fontWeight: 600 }}>{p.profileDisplayName || p.matchedName}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div style={{ fontSize: 12, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
              Your Messages
            </div>
            {threads === null ? (
              <p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic" }}>Loading...</p>
            ) : threads.length === 0 ? (
              <p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic" }}>No conversations yet — search above to start one.</p>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {threads.map((t) => (
                  <button
                    key={t.threadId} onClick={() => openWith(t.otherUserId, t.otherDisplayName)}
                    style={{ display: "flex", alignItems: "center", gap: 10, background: "#1a0a2e", border: "1px solid #3d1f5c", borderRadius: 8, padding: "10px 12px", cursor: "pointer", textAlign: "left" }}
                  >
                    <PersonAvatar photoUrl={t.otherPhotoUrl} />
                    <span style={{ color: "#f5f0ff", fontSize: 13, fontWeight: 600 }}>{t.otherDisplayName || "Unknown"}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <div>
            <h2 style={{ fontSize: 16, marginBottom: 12 }}>{openThread.otherDisplayName || "Conversation"}</h2>
            <div style={{ background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 12, padding: 12, height: 360, overflowY: "auto", marginBottom: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              {messages.map((m) => (
                <div key={m.id} style={{ alignSelf: m.sender_id === user.id ? "flex-end" : "flex-start", maxWidth: "80%" }}>
                  <div style={{
                    background: m.sender_id === user.id ? "linear-gradient(135deg, #ff2d95, #b829ff)" : "#1a0a2e",
                    color: m.sender_id === user.id ? "#05010f" : "#f5f0ff",
                    borderRadius: 10, padding: "8px 12px", fontSize: 13,
                  }}>
                    {m.body}
                  </div>
                  {m.sender_id !== user.id && (
                    reportingId === m.id ? (
                      <div style={{ marginTop: 4 }}>
                        <input
                          type="text" value={reportReason} onChange={(e) => setReportReason(e.target.value)}
                          placeholder="Why are you reporting this?"
                          style={{ width: "100%", background: "#1a0a2e", border: "1px solid #ff3860", borderRadius: 6, padding: "5px 8px", color: "#f5f0ff", fontSize: 11, boxSizing: "border-box" }}
                        />
                        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                          <button onClick={() => submitReport(m.id)} style={{ background: "#ff3860", border: "none", borderRadius: 5, color: "#05010f", fontSize: 10, fontWeight: 700, padding: "4px 8px", cursor: "pointer" }}>Submit</button>
                          <button onClick={() => { setReportingId(null); setReportReason(""); }} style={{ background: "none", border: "1px solid #3d1f5c", borderRadius: 5, color: "#a68fd6", fontSize: 10, padding: "4px 8px", cursor: "pointer" }}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => { setReportingId(m.id); setReportStatus(""); }} style={{ background: "none", border: "none", color: "#6b4f99", fontSize: 10, cursor: "pointer", padding: "2px 0" }}>
                        Report
                      </button>
                    )
                  )}
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
            {reportStatus && <p style={{ fontSize: 11, color: "#a68fd6", marginBottom: 10 }}>{reportStatus}</p>}
            <form onSubmit={handleSend} style={{ display: "flex", gap: 8 }}>
              <input
                type="text" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={2000}
                placeholder="Type a message..."
                style={{ flex: 1, background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 8, padding: "10px 12px", color: "#f5f0ff", fontSize: 14 }}
              />
              <button type="submit" disabled={sending || !draft.trim()} style={{
                padding: "10px 16px", borderRadius: 8, border: "none", cursor: "pointer",
                background: "linear-gradient(135deg, #ff2d95, #b829ff)", color: "#05010f", fontSize: 13, fontWeight: 700,
              }}>
                {sending ? "..." : "Send"}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

function PersonAvatar({ photoUrl }) {
  return (
    <div style={{ width: 32, height: 32, borderRadius: "50%", overflow: "hidden", flexShrink: 0, background: "#0d0618", border: "1px solid #3d1f5c", display: "flex", alignItems: "center", justifyContent: "center" }}>
      {photoUrl ? <img src={photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 14, color: "#3d1f5c" }}>👤</span>}
    </div>
  );
}

const pageStyle = {
  minHeight: "100vh",
  background: "linear-gradient(180deg, #05010f, #1a0a2e)",
  color: "#f5f0ff",
  fontFamily: "'Orbitron', 'Segoe UI', sans-serif",
  padding: 24,
};
