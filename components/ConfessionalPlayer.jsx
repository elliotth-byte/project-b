import { useState, useEffect } from "react";
import { Btn, Card } from "./ui";
import {
  CONFESSIONAL_TAGS, submitConfessional, fetchOwnConfessionals, subscribeConfessionalPrompts,
  subscribeConfessionalsTable,
} from "../lib/confessionalsData";
import { supabase } from "../lib/supabaseClient";

// Fire-and-forget — a push notification failing to send should never
// block or show an error for the actual confessional submit, which
// already succeeded by the time this is called.
async function notifyHostsForConfessional(gameId, playerName) {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) return;
    await fetch("/api/push/notify-host-event", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ gameId, eventType: "confessional", playerName }),
    });
  } catch (e) {
    console.error("Push notify for confessional failed:", e);
  }
}

export default function ConfessionalPlayer({ gameId, player, round, readOnly = false }) {
  const [text, setText] = useState("");
  const [selectedTags, setSelectedTags] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [mine, setMine] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const hasUnseenReply = mine.some((c) => c.host_reply);
  const [allPrompts, setAllPrompts] = useState([]);

  useEffect(() => {
    const unsubscribe = subscribeConfessionalPrompts(gameId, setAllPrompts);
    return unsubscribe;
  }, [gameId]);

  // A prompt applies to this player if it's global (no targeting) or they're
  // specifically named — several can apply at once if the host sent more
  // than one.
  const prompts = allPrompts.filter((p) => !p.targetPlayerIds || p.targetPlayerIds.includes(player?.id));
  const prompt = prompts[prompts.length - 1] || null; // most recent one attaches to a new submission

  useEffect(() => {
    if (!player?.id) return;
    fetchOwnConfessionals(player.id).then(setMine);
  }, [player?.id]);

  // Live refresh — RLS already limits what comes back to this player's
  // own rows, so this is what lets a host's private reply show up here
  // without needing to leave and come back to the tab.
  useEffect(() => {
    if (!player?.id || !gameId) return;
    const unsubscribe = subscribeConfessionalsTable(gameId, () => {
      fetchOwnConfessionals(player.id).then(setMine);
    });
    return unsubscribe;
  }, [gameId, player?.id]);

  const toggleTag = (t) => setSelectedTags((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]);

  const submit = async () => {
    if (!text.trim() || !player?.id) return;
    setSubmitting(true);
    const res = await submitConfessional({
      gameId, playerId: player.id, playerName: player.name, round,
      text: text.trim(), tags: selectedTags, promptId: prompt?.id,
    });
    setSubmitting(false);
    if (res.ok) {
      setMine([res.data, ...mine]);
      setText("");
      setSelectedTags([]);
      setConfirmed(true);
      setTimeout(() => setConfirmed(false), 3500);
      notifyHostsForConfessional(gameId, player.name);
    } else {
      alert("Couldn't submit: " + res.error);
    }
  };

  return (
    <Card style={{ marginBottom: 20, borderColor: "rgba(124,58,237,0.35)", background: "linear-gradient(160deg, #150a28 0%, #150a28 100%)" }}>
      <h3 style={{ color: "#ff2d95", margin: "0 0 4px", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🎥 Confessional</h3>
      <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 12px", fontStyle: "italic" }}>
        {readOnly
          ? "Viewing this player's confessional room — read-only."
          : <>This is your private room. Tell the host what you're thinking, plotting, noticing, or feeling.
              Confessionals are visible only to you and the host — no other player can ever see them.</>}
      </p>

      {prompts.length > 0 && (
        <div style={{ marginBottom: 12, display: "grid", gap: 6 }}>
          {prompts.map((p) => (
            <div key={p.id} style={{ background: "rgba(255,45,149,0.1)", border: "1px solid rgba(255,45,149,0.3)", borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ fontSize: 10, color: "#ff2d95", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>
                {p.targetPlayerIds ? "A prompt just for you" : "Tonight's prompt"}
              </div>
              <div style={{ fontSize: 13, color: "#f5f0ff" }}>{p.prompt}</div>
            </div>
          ))}
        </div>
      )}

      {/* A read-only viewer (the host "viewing as" this player) never
          gets the submission form — an insert here would fail RLS anyway
          (it requires the real authenticated session to own this player
          row), but hiding it avoids a confusing failed-submit for the host. */}
      {!readOnly && (
        <>
          <textarea
            value={text} onChange={(e) => setText(e.target.value)} rows={4}
            placeholder="Step into the confessional. What are you thinking? Who do you trust? Who are you lying to? What just happened?"
            style={{
              width: "100%", background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 8, padding: "10px 12px",
              color: "#f5f0ff", fontSize: 14, resize: "vertical", boxSizing: "border-box", marginBottom: 8,
              fontFamily: "'Orbitron', 'Segoe UI', sans-serif", lineHeight: 1.5,
            }}
          />

          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 10 }}>
            {CONFESSIONAL_TAGS.map((t) => (
              <button key={t} onClick={() => toggleTag(t)} style={{
                fontSize: 11, padding: "4px 10px", borderRadius: 12, cursor: "pointer",
                background: selectedTags.includes(t) ? "rgba(255,45,149,0.15)" : "#0d0618",
                border: `1px solid ${selectedTags.includes(t) ? "#ff2d95" : "#3d1f5c"}`,
                color: selectedTags.includes(t) ? "#ff2d95" : "#a68fd6",
              }}>{t}</button>
            ))}
          </div>

          <Btn onClick={submit} disabled={!text.trim() || submitting}>{submitting ? "Submitting..." : "Submit Confessional"}</Btn>
          {confirmed && <p style={{ color: "#00ff9d", fontSize: 12, marginTop: 8 }}>✓ Sent to the host. Thank you for sharing.</p>}
        </>
      )}

      {mine.length > 0 && (
        <div style={{ marginTop: 14, borderTop: "1px solid #3d1f5c", paddingTop: 10 }}>
          <button onClick={() => setShowHistory(!showHistory)} style={{ background: "none", border: "none", color: "#6b4f99", fontSize: 11, cursor: "pointer" }}>
            {showHistory ? "▲ Hide" : "▼ Show"} your past confessionals ({mine.length}){hasUnseenReply && !showHistory ? " · 💬 host replied" : ""}
          </button>
          {showHistory && (
            <div style={{ marginTop: 8, display: "grid", gap: 6, maxHeight: 220, overflowY: "auto" }}>
              {mine.map((c) => (
                <div key={c.id} style={{ background: "#0d0618", borderRadius: 6, padding: "8px 10px" }}>
                  <div style={{ fontSize: 10, color: "#6b4f99", marginBottom: 3 }}>
                    {c.round ? `Round ${c.round} · ` : ""}{new Date(c.created_at).toLocaleString()}
                    {c.tags?.length > 0 && ` · ${c.tags.join(", ")}`}
                  </div>
                  <div style={{ fontSize: 12, color: "#a68fd6" }}>{c.text}</div>
                  {c.host_reply && (
                    <div style={{ marginTop: 6, background: "rgba(0,217,255,0.08)", border: "1px solid rgba(0,217,255,0.3)", borderRadius: 6, padding: "6px 8px" }}>
                      <div style={{ fontSize: 9, color: "#00d9ff", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>Host replied</div>
                      <div style={{ fontSize: 12, color: "#f5f0ff" }}>{c.host_reply}</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
