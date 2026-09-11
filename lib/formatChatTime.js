// ─── Chat timestamp formatting ───
// Shared by components/ChatPanel.jsx (player-facing group chat + in-
// game DMs) and components/ChatHostPanel.jsx (the host's view of the
// exact same messages) — previously duplicated identically in both
// files, which is exactly how a fix to one and not the other happens.
//
// Time-only for anything from the last 24 hours ("3:45 PM") — for
// anything older, the date is genuinely necessary context: this app
// routinely runs rounds lasting many hours (even a full 16-hour preset,
// see lib/challenges/registry.js), so a message's chat history can span
// multiple real days, and "3:45 PM" on its own stops being enough
// information to know which day that actually was. Compact "Jan 5,
// 3:45 PM" for the common case; only adds the year on top of that
// ("Jan 5, 2025, 3:45 PM") if the message is old enough to be from a
// different calendar year, which most seasons will never hit.
export function formatChatTime(ts) {
  const date = new Date(ts);
  const timeStr = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const isOld = Date.now() - date.getTime() > 24 * 60 * 60 * 1000;
  if (!isOld) return timeStr;
  const sameYear = date.getFullYear() === new Date().getFullYear();
  const dateStr = date.toLocaleDateString([], sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
  return `${dateStr}, ${timeStr}`;
}
