import { useState, useEffect } from "react";
import { Card } from "./ui";
import { subscribeGameState } from "../lib/gameStorage";
import { KEY_ANNOUNCEMENTS } from "../lib/gameState";

// The in-app replacement for what used to be automated GroupMe posts —
// see lib/announcements.js. Shown on both the host's History tab and the
// player's Ceremony tab so everyone has the same in-app record of "what
// just happened," without needing a third-party chat at all.
export default function AnnouncementsFeed({ gameId }) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    const unsubscribe = subscribeGameState(gameId, KEY_ANNOUNCEMENTS, (v) => setItems(v || []));
    return unsubscribe;
  }, [gameId]);

  if (items.length === 0) return null;

  return (
    <Card>
      <h3 style={{ color: "#f5f0ff", margin: "0 0 8px", fontSize: 14, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
        📣 Announcements
      </h3>
      <div style={{ display: "grid", gap: 8, maxHeight: 280, overflowY: "auto" }}>
        {[...items].reverse().map((a, i) => (
          <div key={i} style={{ background: "#0d0618", borderRadius: 6, padding: "8px 10px" }}>
            <div style={{ fontSize: 10, color: "#6b4f99", marginBottom: 3 }}>{new Date(a.at).toLocaleString()}</div>
            <div style={{ fontSize: 12, color: "#f5f0ff", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{a.text}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}
