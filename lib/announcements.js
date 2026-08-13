import { KEY_ANNOUNCEMENTS } from "./gameState";
import { storageUpdate } from "./gameStorage";

const MAX_ANNOUNCEMENTS = 30;

// Used as lib/roundEngine.js's `postMessage` callback (see
// pages/api/advance-phase.js and pages/api/cron/advance-rounds.js) — the
// automated "Battle complete!" / "Round begins" / etc. announcements
// used to be posted to GroupMe automatically; now they're written
// in-app instead, where components/AnnouncementsFeed.jsx displays them
// to hosts and players. Keeps only the most recent MAX_ANNOUNCEMENTS —
// this is a rolling feed, not the permanent record (see HistoryTab.jsx /
// CeremonyPlayer.jsx for that).
export function makeInAppPostMessage(db, gameId) {
  return async (text) => {
    await db.update(gameId, KEY_ANNOUNCEMENTS, (fresh) => {
      const list = fresh || [];
      return [...list, { text, at: Date.now(), from: "system" }].slice(-MAX_ANNOUNCEMENTS);
    });
  };
}

// Client-side counterpart for the host sending a message directly,
// rather than the game generating one automatically — same feed, same
// cap, just tagged so AnnouncementsFeed.jsx can style it distinctly from
// an automated update.
export async function postHostAnnouncement(gameId, text) {
  const clean = (text || "").trim();
  if (!clean) return { ok: false };
  const res = await storageUpdate(gameId, KEY_ANNOUNCEMENTS, (fresh) => {
    const list = fresh || [];
    return [...list, { text: clean, at: Date.now(), from: "host" }].slice(-MAX_ANNOUNCEMENTS);
  });
  return { ok: res.ok };
}
