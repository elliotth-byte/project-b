import { useState } from "react";

// ─── Copy a message ───
// Replaces the old "Post to GroupMe" button. Messages are now either
// shown in-app (see AnnouncementsFeed.jsx / lib/announcements.js for the
// automated ones) or copied out by the host to paste wherever they
// actually want it — GroupMe, Slack, a group text, whatever.
export default function CopyMessage({ label, text, icon = "📋" }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [draft, setDraft] = useState(text);

  // Keep the draft in sync with the incoming text unless the host has
  // already started editing it — otherwise a live prop change (e.g. a new
  // vote coming in) would blow away an in-progress edit.
  const [touched, setTouched] = useState(false);
  if (!touched && draft !== text) setDraft(text);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can fail (permissions, non-HTTPS, older browsers) —
      // the textarea below is still right there for a manual select-and-copy.
    }
  };

  return (
    <div style={{ border: "1px solid #3d1f5c", borderRadius: 8, overflow: "hidden" }}>
      <button onClick={() => setExpanded(!expanded)} style={{
        width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
        background: "#0d0618", border: "none", padding: "8px 12px", cursor: "pointer", color: "#f5f0ff", fontSize: 12,
      }}>
        <span>{icon} {label}</span>
        <span style={{ color: "#6b4f99" }}>{expanded ? "▲" : "▼"}</span>
      </button>
      {expanded && (
        <div style={{ padding: 10, background: "#0d0618" }}>
          <textarea
            value={draft}
            onChange={(e) => { setTouched(true); setDraft(e.target.value); }}
            rows={6}
            style={{
              width: "100%", fontSize: 11, color: "#f5f0ff", whiteSpace: "pre-wrap", fontFamily: "inherit",
              background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 6, padding: 8, margin: "0 0 8px",
              boxSizing: "border-box", resize: "vertical",
            }}
          />
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={copy} style={{
              padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer",
              background: "linear-gradient(135deg, #00d9ff, #0099cc)", color: "#fff", border: "none",
            }}>
              {copied ? "✅ Copied!" : "📋 Copy"}
            </button>
            <span style={{ fontSize: 11, color: "#6b4f99" }}>Paste it wherever you want players to see it.</span>
          </div>
        </div>
      )}
    </div>
  );
}
