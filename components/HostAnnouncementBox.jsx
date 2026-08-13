import { useState } from "react";
import { Card, Btn } from "./ui";
import { postHostAnnouncement } from "../lib/announcements";

// ─── Host: send an announcement ───
// Lands in the same feed as automated "Battle complete!" updates (see
// lib/announcements.js / AnnouncementsFeed.jsx) — visible to the host on
// History and to players on Ceremony — just tagged so it renders
// distinctly as coming from the host rather than the game itself. Kept
// on the main Current Round tab (not buried in Admin) since sending a
// quick update is something a host does often, mid-round.
export default function HostAnnouncementBox({ gameId }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    const res = await postHostAnnouncement(gameId, text);
    setSending(false);
    if (res.ok) {
      setText("");
      setSent(true);
      window.setTimeout(() => setSent(false), 2000);
    }
  };

  return (
    <Card>
      <div style={{ fontSize: 11, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
        📣 Send an Announcement
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send(); }}
          placeholder="e.g. Battle starts in 10 minutes!"
          style={{ flex: 1, background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 6, padding: "8px 10px", color: "#f5f0ff", fontSize: 13 }}
        />
        <Btn small onClick={send} disabled={!text.trim() || sending}>{sending ? "..." : "Send"}</Btn>
      </div>
      {sent && <p style={{ fontSize: 11, color: "#00ff9d", margin: "8px 0 0" }}>Sent — visible to everyone on History/Ceremony.</p>}
    </Card>
  );
}
