import { useState, useEffect } from "react";
import { Btn, Card } from "./ui";
import {
  CONFESSIONAL_TAGS, submitConfessional, fetchOwnConfessionals, subscribeConfessionalPrompt,
} from "../lib/confessionalsData";

export default function ConfessionalPlayer({ gameId, player, round }) {
  const [text, setText] = useState("");
  const [selectedTags, setSelectedTags] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [mine, setMine] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [prompt, setPrompt] = useState(null);

  useEffect(() => {
    const unsubscribe = subscribeConfessionalPrompt(gameId, (v) => setPrompt(v?.active ? v : null));
    return unsubscribe;
  }, [gameId]);

  useEffect(() => {
    if (!player?.id) return;
    fetchOwnConfessionals(player.id).then(setMine);
  }, [player?.id]);

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
    } else {
      alert("Couldn't submit: " + res.error);
    }
  };

  return (
    <Card style={{ marginBottom: 20, borderColor: "rgba(124,58,237,0.35)", background: "linear-gradient(160deg, #150a28 0%, #150a28 100%)" }}>
      <h3 style={{ color: "#ff2d95", margin: "0 0 4px", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🎥 Confessional</h3>
      <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 12px", fontStyle: "italic" }}>
        This is your private room. Tell the host what you're thinking, plotting, noticing, or feeling.
        Confessionals are visible only to you and the host — no other player can ever see them.
      </p>

      {prompt && (
        <div style={{ background: "rgba(255,45,149,0.1)", border: "1px solid rgba(255,45,149,0.3)", borderRadius: 8, padding: "10px 12px", marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: "#ff2d95", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>Tonight's prompt</div>
          <div style={{ fontSize: 13, color: "#f5f0ff" }}>{prompt.prompt}</div>
        </div>
      )}

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

      {mine.length > 0 && (
        <div style={{ marginTop: 14, borderTop: "1px solid #3d1f5c", paddingTop: 10 }}>
          <button onClick={() => setShowHistory(!showHistory)} style={{ background: "none", border: "none", color: "#6b4f99", fontSize: 11, cursor: "pointer" }}>
            {showHistory ? "▲ Hide" : "▼ Show"} your past confessionals ({mine.length})
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
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
