import { KEY_ANNOUNCEMENTS } from "./gameState";

const MAX_ANNOUNCEMENTS = 30;

// Used as lib/roundEngine.js's `postMessage` callback (see
// pages/api/advance-phase.js and pages/api/cron/advance-rounds.js) — the
// automated "Challenge complete!" / "Round begins" / etc. announcements
// used to be posted to GroupMe automatically; now they're written
// in-app instead, where components/AnnouncementsFeed.jsx displays them
// to hosts and players. Keeps only the most recent MAX_ANNOUNCEMENTS —
// this is a rolling feed, not the permanent record (see HistoryTab.jsx /
// CeremonyPlayer.jsx for that).
export function makeInAppPostMessage(db, gameId) {
  return async (text) => {
    await db.update(gameId, KEY_ANNOUNCEMENTS, (fresh) => {
      const list = fresh || [];
      return [...list, { text, at: Date.now() }].slice(-MAX_ANNOUNCEMENTS);
    });
  };
}
