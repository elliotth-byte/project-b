import { useState, useEffect } from "react";
import { Card as DefaultCard, Btn as DefaultBtn } from "./ui";
import { subscribeFeedback, markFeedbackRead, clearAllFeedback } from "../lib/feedback";

// ─── Feedback Inbox — host side ───
// Everything players send via components/FeedbackButton.jsx's footer
// button, newest first. Marking one read is purely a host-side "seen
// it" convenience — nothing about a player's own experience changes
// either way, and there's no confirmation sent back to them.
//
// Card/Btn and the color palette are all injectable, defaulting to
// Panopticon's own (./ui) — this same component is also embedded in
// components/TraitorsAdminHost.jsx, which has its own distinct gold/
// parchment/serif look (./traitorsUi) that hardcoded neon-pink/purple
// colors would clash with. One shared component, two skins, rather
// than forking the whole file for a difference that's purely visual.
const DEFAULT_COLORS = {
  muted: "#6b4f99",
  text: "#f5f0ff",
  accent: "#a68fd6",
  body: "#e0d4ff",
  unread: "#ff2d95",
  read: "#3d1f5c",
};

export default function FeedbackInbox({ gameId, Card = DefaultCard, Btn = DefaultBtn, colors = DEFAULT_COLORS }) {
  const [entries, setEntries] = useState(null);
  const c = { ...DEFAULT_COLORS, ...colors };

  useEffect(() => {
    const unsubscribe = subscribeFeedback(gameId, (v) => setEntries(v || []));
    return unsubscribe;
  }, [gameId]);

  if (entries === null) {
    return <Card><p style={{ color: c.muted, fontStyle: "italic" }}>Loading...</p></Card>;
  }

  if (entries.length === 0) {
    return <Card><p style={{ color: c.muted, fontStyle: "italic", margin: 0 }}>No feedback yet — it'll show up here the moment someone sends something.</p></Card>;
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ textAlign: "right" }}>
        <button
          onClick={() => { if (confirm("Clear all feedback? This can't be undone.")) clearAllFeedback(gameId); }}
          style={{ background: "none", border: "none", color: c.muted, fontSize: 11, cursor: "pointer", textDecoration: "underline" }}
        >
          Clear all
        </button>
      </div>
      {entries.map((f) => (
        <Card key={f.id} style={{ opacity: f.read ? 0.6 : 1, borderColor: f.read ? c.read : c.unread }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
            <div>
              <span style={{ fontSize: 13, fontWeight: 700, color: c.text }}>{f.playerName || "Someone"}</span>
              <span style={{ fontSize: 11, color: c.accent, marginLeft: 8 }}>from {f.page}</span>
            </div>
            <span style={{ fontSize: 10, color: c.muted }}>{new Date(f.submittedAt).toLocaleString()}</span>
          </div>
          <p style={{ fontSize: 13, color: c.body, margin: "0 0 8px", whiteSpace: "pre-wrap" }}>{f.message}</p>
          {!f.read && (
            <Btn small variant="ghost" onClick={() => markFeedbackRead(gameId, f.id)}>Mark read</Btn>
          )}
        </Card>
      ))}
    </div>
  );
}
