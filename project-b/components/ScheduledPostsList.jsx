import { useState, useEffect } from "react";
import { Card, Btn } from "./traitorsUi";
import { listScheduledPosts, cancelScheduledPost } from "../lib/slackScheduling";

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
    <Card style={{ borderColor: "rgba(201,168,76,0.3)" }}>
      <h3 style={{ color: "#f0e6d3", margin: "0 0 8px", fontSize: 14, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>
        🕐 Scheduled Slack Posts ({posts.length})
      </h3>
      <div style={{ display: "grid", gap: 6 }}>
        {posts.map((p) => (
          <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, background: "#0a1020", border: "1px solid #253550", borderRadius: 8, padding: "8px 12px" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: "#c9a84c", marginBottom: 2 }}>{new Date(p.post_at).toLocaleString()}</div>
              <div style={{ fontSize: 12, color: "#a09080", whiteSpace: "pre-wrap" }}>{p.text.length > 140 ? p.text.slice(0, 140) + "…" : p.text}</div>
              {p.error && <div style={{ fontSize: 11, color: "#c45c3c", marginTop: 2 }}>Last attempt failed: {p.error}</div>}
            </div>
            <Btn small variant="ghost" onClick={() => cancel(p.id)}>Cancel</Btn>
          </div>
        ))}
      </div>
    </Card>
  );
}
