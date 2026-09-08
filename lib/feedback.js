import { storageUpdate, subscribeGameState } from "./gameStorage";

// ─── Player Feedback ───
// A small, free-text "tell the host something" channel, reachable from
// a footer button on every tab — not scoped to Project B specifically
// (no "pb:" prefix — see lib/gameState.js's own header comment on that
// convention), since Traitors and Stereo Types players should be able
// to send feedback exactly the same way. Lives in game_state rather
// than a new SQL table: feedback is meaningful for the life of one
// season, same trust model as everything else in this table (see
// sql/schema.sql — any player in a game can already read this whole
// row), and doesn't need to survive past it or be queried across
// seasons the way achievements/profiles do.
export const KEY_FEEDBACK = "feedback";

export function subscribeFeedback(gameId, onChange) {
  return subscribeGameState(gameId, KEY_FEEDBACK, onChange);
}

// One entry per submission, newest first — appended, never edited by
// the player afterward (there's no "take it back" once sent, same as
// a real note handed to someone). `page` is whichever tab the player
// was actually on when they tapped the feedback button (see
// components/FeedbackButton.jsx), not a URL — this app is a single
// route with tabs, not multiple pages, so "which page" means "which
// tab" here.
export async function submitFeedback(gameId, playerId, playerName, page, message) {
  const trimmed = (message || "").trim();
  if (!trimmed) return null;
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    playerId,
    playerName,
    page,
    message: trimmed.slice(0, 1000), // a generous cap, not a real limit — just a guard against something pathological
    submittedAt: Date.now(),
    read: false,
  };
  const result = await storageUpdate(gameId, KEY_FEEDBACK, (fresh) => [entry, ...(fresh || [])]);
  return result?.value ?? null;
}

export async function markFeedbackRead(gameId, feedbackId) {
  const result = await storageUpdate(gameId, KEY_FEEDBACK, (fresh) =>
    (fresh || []).map((f) => (f.id === feedbackId ? { ...f, read: true } : f))
  );
  return result?.value ?? null;
}

export async function clearAllFeedback(gameId) {
  const result = await storageUpdate(gameId, KEY_FEEDBACK, () => []);
  return result?.value ?? null;
}
