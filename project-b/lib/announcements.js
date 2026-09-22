import { KEY_ANNOUNCEMENTS } from "./gameState";
import { GROUP_CHAT_KEY, sendGroupMessage } from "./chatData";

// ============================================================
// Announcements now go into the group chat thread instead of their own
// separate one-way feed — players/host see them right where they're
// already looking (Group Chat), rather than needing a separate
// History/Ceremony tab. See components/ChatPanel.jsx's MessageBubble
// for how a `senderId: "system"` message renders distinctly (centered,
// muted, no avatar) from an ordinary chat bubble, and
// components/ChatHostPanel.jsx for the pre-existing
// `sendGroupMessage(gameId, "host", postAsName, text)` host-post
// convention this reuses for host-authored announcements.
//
// KEY_ANNOUNCEMENTS / AnnouncementsFeed.jsx are deliberately left in
// place (not deleted) even though nothing writes NEW entries here any
// more — any season already mid-play keeps whatever historical
// announcements it already has, rather than losing that data or having
// HistoryTab.jsx/CeremonyPlayer.jsx break on a now-missing feed. It
// simply stops growing from this point on.
// ============================================================

// Used as lib/roundEngine.js's `postMessage` callback (see
// pages/api/advance-phase.js and pages/api/cron/advance-rounds.js) for
// every automated "Battle complete!" / "Round begins" / etc.
// game-state-transition announcement. Runs server-side against the
// service-role `db` adapter that's already passed in here (bypassing
// the group chat table's normal RLS, same as everything else
// roundEngine.js does) — deliberately NOT routed through
// lib/chatData.js's sendGroupMessage, which is bound to the anon
// browser client via lib/gameStorage.js and would have no logged-in
// session to satisfy that RLS from a server-only context. Writes the
// exact same message shape sendGroupMessage produces, tagged with the
// "system" sentinel senderId (never a real player id) so
// ChatPanel.jsx's MessageBubble renders it as a system line.
export function makeInAppPostMessage(db, gameId) {
  return async (text) => {
    const clean = (text || "").trim();
    if (!clean) return;
    await db.update(gameId, GROUP_CHAT_KEY, (fresh) => {
      const list = fresh || [];
      return [...list, {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        senderId: "system", senderName: "System", senderRealName: "System",
        body: clean, createdAt: Date.now(),
      }];
    });
  };
}

// Client-side: the host typing an announcement directly (see
// components/HostAnnouncementBox.jsx), rather than the game generating
// one automatically. Posts into the same group chat thread as an
// ordinary host chat message would (see components/ChatHostPanel.jsx's
// pre-existing `sendGroupMessage(gameId, "host", ...)` convention) — a
// host announcement now just reads like a host chat message once both
// go through the same call, which is the point of consolidating these.
export async function postHostAnnouncement(gameId, text) {
  const clean = (text || "").trim();
  if (!clean) return { ok: false };
  return sendGroupMessage(gameId, "host", "Host", clean);
}

// A one-off "system" flavor post (e.g. the season-opening intro) fired
// from client-side code that doesn't have access to roundEngine.js's
// `db` adapter — same destination (group chat) and same "system"
// sentinel senderId as makeInAppPostMessage's automated posts, just not
// actually generated from a game state transition the way those are.
export async function postSystemAnnouncement(gameId, text) {
  const clean = (text || "").trim();
  if (!clean) return { ok: false };
  return sendGroupMessage(gameId, "system", "System", clean);
}
