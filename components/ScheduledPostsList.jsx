import { useState, useEffect } from "react";
import { Card, Btn } from "./ui";
import { listScheduledPosts, cancelScheduledPost } from "../lib/groupmeScheduling";

// Polling rather than realtime — this list changes rarely (a host
// scheduling or cancelling something) and isn't worth a dedicated
// subscription. Also re-fetches after any cancel so the list stays honest
// about what's actually still pending.
export default function ScheduledPostsList({ gameId }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    const data = await listScheduledPosts(gameId);
    setPosts(data);
    setLoading(false);
  };

  useEffect(() => {
    reload();
    const interval = window.setInterval(reload, 15000);
    return () => window.clearInterval(interval);
  }, [gameId]); // eslint-disable-line react-hooks/exhaustive-deps

  const cancel = async (id) => {
    await cancelScheduledPost(id);
    reload();
  };

  if (loading) return null;
  if (posts.length === 0) return null;

  return (
    <Card style={{ borderColor: "rgba(255,45,149,0.3)" }}>
      <h3 style={{ color: "#f5f0ff", margin: "0 0 8px", fontSize: 14, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
        🕐 Scheduled GroupMe Posts ({posts.length})
      </h3>
      <div style={{ display: "grid", gap: 6 }}>
        {posts.map((p) => (
          <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 8, padding: "8px 12px" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: "#ff2d95", marginBottom: 2 }}>{new Date(p.post_at).toLocaleString()}</div>
              <div style={{ fontSize: 12, color: "#a68fd6", whiteSpace: "pre-wrap" }}>{p.text.length > 140 ? p.text.slice(0, 140) + "…" : p.text}</div>
              {p.error && <div style={{ fontSize: 11, color: "#ff3860", marginTop: 2 }}>Last attempt failed: {p.error}</div>}
            </div>
            <Btn small variant="ghost" onClick={() => cancel(p.id)}>Cancel</Btn>
          </div>
        ))}
      </div>
    </Card>
  );
}
