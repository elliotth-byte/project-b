import { useState } from "react";
import { postToSlack } from "../lib/slackClient";
import { scheduleSlackPost } from "../lib/slackScheduling";

// ─── Post to Slack ───
// Posts immediately, or — via the 🕐 Schedule toggle — saves a row for
// pages/api/cron/post-scheduled.js to send later, even if the host closes
// their laptop before it fires. See sql/add-scheduled-slack-posts.sql and
// vercel.json for the pieces that make the "later" part actually work.
export default function PostToSlack({ gameId, label, text, icon = "📋" }) {
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
    const res = await postToSlack(gameId, draft);
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
    const res = await scheduleSlackPost(gameId, draft, parseLocalTime(scheduleAt));
    if (res.ok) {
      setScheduleStatus("saved");
      setTimeout(() => { setScheduleStatus(null); setScheduling(false); setScheduleAt(""); }, 2500);
    } else {
      setScheduleStatus("error");
    }
  };

  return (
    <div style={{ border: "1px solid #253550", borderRadius: 8, overflow: "hidden" }}>
      <button onClick={() => setExpanded(!expanded)} style={{
        width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
        background: "#0a1020", border: "none", padding: "8px 12px", cursor: "pointer", color: "#f0e6d3", fontSize: 12,
      }}>
        <span>{icon} {label}</span>
        <span style={{ color: "#706050" }}>{expanded ? "▲" : "▼"}</span>
      </button>
      {expanded && (
        <div style={{ padding: 10, background: "#060e1a" }}>
          <textarea
            value={draft}
            onChange={(e) => { setTouched(true); setDraft(e.target.value); }}
            rows={6}
            style={{
              width: "100%", fontSize: 11, color: "#f0e6d3", whiteSpace: "pre-wrap", fontFamily: "inherit",
              background: "#0a1020", border: "1px solid #253550", borderRadius: 6, padding: 8, margin: "0 0 8px",
              boxSizing: "border-box", resize: "vertical",
            }}
          />
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={send} disabled={status === "sending"} style={{
              padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer",
              background: "linear-gradient(135deg, #4a154b, #611f69)", color: "#fff", border: "none",
            }}>
              {status === "sending" ? "Posting..." : "📡 Post Now"}
            </button>
            <button onClick={() => setScheduling((v) => !v)} style={{
              padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer",
              background: "transparent", color: "#c9a84c", border: "1px solid #c9a84c55",
            }}>
              🕐 {scheduling ? "Cancel Schedule" : "Schedule Instead"}
            </button>
            {status === "success" && <span style={{ fontSize: 12, color: "#7a9a5c" }}>✅ Posted!</span>}
            {status === "error" && <span style={{ fontSize: 12, color: "#c45c3c" }}>{errorMsg}</span>}
          </div>

          {scheduling && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8, padding: "8px 10px", background: "#0a1020", borderRadius: 6, border: "1px solid #253550" }}>
              <input
                type="datetime-local"
                value={scheduleAt}
                onChange={(e) => setScheduleAt(e.target.value)}
                style={{ background: "#132038", border: "1px solid #253550", borderRadius: 6, padding: "6px 10px", color: "#f0e6d3", fontSize: 12, colorScheme: "dark" }}
              />
              <button onClick={submitSchedule} disabled={!scheduleAt || scheduleStatus === "saving"} style={{
                padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer",
                background: "linear-gradient(135deg, #c9a84c, #a5822f)", color: "#0c1425", border: "none",
              }}>
                {scheduleStatus === "saving" ? "Saving..." : "Confirm Schedule"}
              </button>
              {scheduleStatus === "saved" && <span style={{ fontSize: 12, color: "#7a9a5c" }}>✅ Scheduled!</span>}
              {scheduleStatus === "error" && <span style={{ fontSize: 12, color: "#c45c3c" }}>Couldn't schedule — try again.</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
