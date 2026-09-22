import { useState, useEffect, useRef } from "react";
import { Btn } from "./traitorsUi";
import { postToSlack } from "../lib/slackClient";
import { scheduleStaggeredPosts } from "../lib/slackScheduling";

// Ported from the original artifact's StaggeredTeaPost, generalized so any
// batch of lines can use it (used first for Afternoon Tea arrivals).
// "Post Now (Staggered)" sends them one at a time with a countdown between
// each; "Schedule All" instead writes every post as a scheduled row, timed
// `intervalMinutes` apart starting from a chosen time — see
// pages/api/cron/post-scheduled.js for how those actually go out later.
export default function StaggeredSlackPost({ gameId, lines, label = "Afternoon Tea Arrivals", icon = "☕", intervalMinutes: defaultInterval = 5 }) {
  const [statuses, setStatuses] = useState([]); // "pending" | "sending" | "success" | "error" | "waiting" | "scheduled"
  const [running, setRunning] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [editedLines, setEditedLines] = useState(lines);
  const [editing, setEditing] = useState(false);
  const [interval, setInterval_] = useState(defaultInterval);
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleStart, setScheduleStart] = useState("");
  const timerRef = useRef(null);
  const countdownRef = useRef(null);
  const cancelledRef = useRef(false);

  useEffect(() => { setEditedLines(lines); }, [lines.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  const resetAll = () => {
    setRunning(false);
    setStatuses([]);
    setCountdown(0);
    cancelledRef.current = true;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    if (countdownRef.current) window.clearInterval(countdownRef.current);
  };

  const parseLocalTime = (dtString) => {
    const [datePart, timePart] = dtString.split("T");
    const [y, mo, d] = datePart.split("-").map(Number);
    const [h, mi] = timePart.split(":").map(Number);
    return new Date(y, mo - 1, d, h, mi);
  };

  const scheduleStaggered = async () => {
    if (!scheduleStart) return;
    setRunning(true);
    setStatuses(editedLines.map(() => "sending"));
    const results = await scheduleStaggeredPosts(gameId, editedLines, parseLocalTime(scheduleStart), interval);
    setStatuses(results.map((r) => (r.ok ? "scheduled" : "error")));
    setRunning(false);
    setShowSchedule(false);
  };

  const startStaggered = async () => {
    cancelledRef.current = false;
    setRunning(true);
    setStatuses(editedLines.map(() => "pending"));

    for (let i = 0; i < editedLines.length; i++) {
      if (cancelledRef.current) break;
      setStatuses((prev) => prev.map((s, j) => (j === i ? "sending" : s)));

      const res = await postToSlack(gameId, editedLines[i]);
      if (cancelledRef.current) break;
      setStatuses((prev) => prev.map((s, j) => (j === i ? (res.ok ? "success" : "error") : s)));

      if (i < editedLines.length - 1 && !cancelledRef.current) {
        const waitSec = interval * 60;
        setCountdown(waitSec);
        setStatuses((prev) => prev.map((s, j) => (j === i + 1 ? "waiting" : s)));

        let remaining = waitSec;
        await new Promise((resolve) => {
          countdownRef.current = window.setInterval(() => {
            remaining -= 1;
            setCountdown(remaining);
            if (remaining <= 0 || cancelledRef.current) {
              window.clearInterval(countdownRef.current);
              resolve();
            }
          }, 1000);
        });
      }
    }
    setRunning(false);
    setCountdown(0);
  };

  const formatCountdown = (sec) => `${Math.floor(sec / 60)}:${(sec % 60).toString().padStart(2, "0")}`;
  const statusIcon = (s) => ({ pending: "⏳", sending: "📡", success: "✅", scheduled: "🕐", error: "❌", waiting: "⏱️" }[s] || "•");

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
        <span style={{ color: "#a09080", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8 }}>
          {icon} {label} — Staggered
        </span>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ color: "#706050", fontSize: 11 }}>Interval:</label>
          <select value={interval} onChange={(e) => setInterval_(+e.target.value)} disabled={running}
            style={{ background: "#0a1020", border: "1px solid #253550", borderRadius: 6, padding: "3px 6px", color: "#f0e6d3", fontSize: 12 }}>
            {[1, 2, 3, 5, 10, 15].map((m) => <option key={m} value={m}>{m} min</option>)}
          </select>
          <Btn small variant="ghost" onClick={() => setEditing(!editing)} disabled={running}>{editing ? "Done" : "Edit"}</Btn>
          <Btn small variant="ghost" onClick={() => setShowSchedule(!showSchedule)} disabled={running}>{showSchedule ? "Hide" : "🕐 Schedule"}</Btn>
          {running ? (
            <Btn small variant="danger" onClick={resetAll}>Cancel</Btn>
          ) : (
            <Btn small variant="slack" onClick={startStaggered} disabled={editedLines.length === 0}>Post Now (Staggered)</Btn>
          )}
        </div>
      </div>

      {showSchedule && !running && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, padding: "10px 14px", background: "#0a1020", borderRadius: 8, border: "1px solid #253550", flexWrap: "wrap" }}>
          <span style={{ color: "#a09080", fontSize: 12, flexShrink: 0 }}>🕐 First arrival at:</span>
          <input type="datetime-local" value={scheduleStart} onChange={(e) => setScheduleStart(e.target.value)}
            style={{ flex: 1, minWidth: 180, background: "#132038", border: "1px solid #253550", borderRadius: 6, padding: "6px 10px", color: "#f0e6d3", fontSize: 12, colorScheme: "dark" }} />
          <Btn small variant="primary" onClick={scheduleStaggered} disabled={!scheduleStart || running}>Schedule All</Btn>
          <span style={{ fontSize: 11, color: "#706050", width: "100%" }}>
            {scheduleStart && editedLines.length > 0 && (() => {
              const start = parseLocalTime(scheduleStart);
              const times = editedLines.map((_, i) => new Date(start.getTime() + i * interval * 60 * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
              return `Posts at: ${times.join(" → ")}`;
            })()}
          </span>
        </div>
      )}

      <div style={{ display: "grid", gap: 6 }}>
        {editedLines.map((line, i) => (
          <div key={i} style={{
            display: "flex", gap: 10, alignItems: "center",
            background: statuses[i] === "success" ? "rgba(122,154,92,0.08)" : statuses[i] === "error" ? "rgba(196,92,60,0.08)" : "#0a1020",
            border: `1px solid ${statuses[i] === "success" ? "rgba(122,154,92,0.25)" : statuses[i] === "error" ? "rgba(196,92,60,0.25)" : "#253550"}`,
            borderRadius: 8, padding: "10px 14px",
          }}>
            <span style={{ fontSize: 16, flexShrink: 0, width: 24, textAlign: "center" }}>{statuses.length > 0 ? statusIcon(statuses[i]) : `${i + 1}.`}</span>
            <div style={{ flex: 1 }}>
              {editing && !running ? (
                <input value={line} onChange={(e) => { const u = [...editedLines]; u[i] = e.target.value; setEditedLines(u); }}
                  style={{ width: "100%", background: "transparent", border: "1px solid #253550", borderRadius: 6, padding: "4px 8px", color: "#f0e6d3", fontSize: 13, fontFamily: "'Courier New', Courier, monospace", outline: "none", boxSizing: "border-box" }} />
              ) : (
                <span style={{ fontSize: 13, color: statuses[i] === "success" ? "#7a9a5c" : statuses[i] === "scheduled" ? "#c9a84c" : "#f0e6d3", fontFamily: "'Courier New', Courier, monospace" }}>
                  {line}
                  {statuses[i] === "scheduled" && scheduleStart && (
                    <span style={{ color: "#706050", fontSize: 11, marginLeft: 8 }}>
                      ({new Date(parseLocalTime(scheduleStart).getTime() + i * interval * 60 * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })})
                    </span>
                  )}
                </span>
              )}
            </div>
            {statuses[i] === "waiting" && countdown > 0 && (
              <span style={{ fontSize: 13, fontWeight: 700, color: "#c9a84c", fontFamily: "'Courier New', Courier, monospace" }}>{formatCountdown(countdown)}</span>
            )}
          </div>
        ))}
      </div>

      {running && (
        <div style={{ marginTop: 8, padding: "8px 14px", borderRadius: 8, fontSize: 12, background: "rgba(201,168,76,0.1)", color: "#c9a84c", border: "1px solid rgba(201,168,76,0.25)" }}>
          📡 Posting — {editedLines.filter((_, i) => statuses[i] === "success").length}/{editedLines.length} sent
          {countdown > 0 && ` · Next post in ${formatCountdown(countdown)}`}
        </div>
      )}
      {!running && statuses.length > 0 && (statuses.every((s) => s === "success") || statuses.every((s) => s === "scheduled")) && (
        <div style={{ marginTop: 8, padding: "8px 14px", borderRadius: 8, fontSize: 12, background: statuses[0] === "scheduled" ? "rgba(201,168,76,0.1)" : "rgba(122,154,92,0.1)", color: statuses[0] === "scheduled" ? "#c9a84c" : "#7a9a5c", border: `1px solid ${statuses[0] === "scheduled" ? "rgba(201,168,76,0.25)" : "rgba(122,154,92,0.25)"}` }}>
          {statuses[0] === "scheduled" ? "🕐 All arrival groups scheduled!" : "✅ All arrival groups posted!"}
        </div>
      )}
    </div>
  );
}
