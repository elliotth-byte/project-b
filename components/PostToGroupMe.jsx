import { useState } from "react";
import { postToGroupMe } from "../lib/groupmeClient";
import { scheduleGroupMePost } from "../lib/groupmeScheduling";

// ─── Post to GroupMe ───
// Posts immediately, or — via the 🕐 Schedule toggle — saves a row for
// pages/api/cron/post-scheduled.js (GroupMe edition) to send later, even if the host closes
// their laptop before it fires. See sql/add-scheduled-groupme-posts.sql and
// vercel.json for the pieces that make the "later" part actually work.
export default function PostToGroupMe({ gameId, label, text, icon = "📋" }) {
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState(null); // null | "sending" | "success" | "error"
  const [errorMsg, setErrorMsg] = useState("");
  const [draft, setDraft] = useState(text);
  const [scheduling, setScheduling] = useState(false);
  const [scheduleAt, setScheduleAt] = useState("");
  const [scheduleStatus, setScheduleStatus] = useState(null); // null | "saving" | "saved" | "error"

  // Keep the draft in sync with the incoming text unless the host has
  // already started editing it — otherwise a live prop change (e.g. a new
  // vote coming in) would blow away an in-progress edit.
  const [touched, setTouched] = useState(false);
  if (!touched && draft !== text) setDraft(text);

  const send = async () => {
    setStatus("sending");
    const res = await postToGroupMe(gameId, draft);
    if (res.ok) {
      setStatus("success");
      setTimeout(() => setStatus(null), 3000);
    } else {
      setStatus("error");
      setErrorMsg(res.error);
    }
  };

  const parseLocalTime = (dtString) => {
    const [datePart, timePart] = dtString.split("T");
    const [y, mo, d] = datePart.split("-").map(Number);
    const [h, mi] = timePart.split(":").map(Number);
    return new Date(y, mo - 1, d, h, mi);
  };

  const submitSchedule = async () => {
    if (!scheduleAt) return;
    setScheduleStatus("saving");
    const res = await scheduleGroupMePost(gameId, draft, parseLocalTime(scheduleAt));
    if (res.ok) {
      setScheduleStatus("saved");
      setTimeout(() => { setScheduleStatus(null); setScheduling(false); setScheduleAt(""); }, 2500);
    } else {
      setScheduleStatus("error");
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
            <button onClick={send} disabled={status === "sending"} style={{
              padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer",
              background: "linear-gradient(135deg, #00d9ff, #0099cc)", color: "#fff", border: "none",
            }}>
              {status === "sending" ? "Posting..." : "📡 Post Now"}
            </button>
            <button onClick={() => setScheduling((v) => !v)} style={{
              padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer",
              background: "transparent", color: "#ff2d95", border: "1px solid #ff2d9555",
            }}>
              🕐 {scheduling ? "Cancel Schedule" : "Schedule Instead"}
            </button>
            {status === "success" && <span style={{ fontSize: 12, color: "#00ff9d" }}>✅ Posted!</span>}
            {status === "error" && <span style={{ fontSize: 12, color: "#ff3860" }}>{errorMsg}</span>}
          </div>

          {scheduling && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8, padding: "8px 10px", background: "#0d0618", borderRadius: 6, border: "1px solid #3d1f5c" }}>
              <input
                type="datetime-local"
                value={scheduleAt}
                onChange={(e) => setScheduleAt(e.target.value)}
                style={{ background: "#1a0a2e", border: "1px solid #3d1f5c", borderRadius: 6, padding: "6px 10px", color: "#f5f0ff", fontSize: 12, colorScheme: "dark" }}
              />
              <button onClick={submitSchedule} disabled={!scheduleAt || scheduleStatus === "saving"} style={{
                padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer",
                background: "linear-gradient(135deg, #ff2d95, #b829ff)", color: "#05010f", border: "none",
              }}>
                {scheduleStatus === "saving" ? "Saving..." : "Confirm Schedule"}
              </button>
              {scheduleStatus === "saved" && <span style={{ fontSize: 12, color: "#00ff9d" }}>✅ Scheduled!</span>}
              {scheduleStatus === "error" && <span style={{ fontSize: 12, color: "#ff3860" }}>Couldn't schedule — try again.</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
