import { storageGet, storageUpdate, subscribeGameState } from "./gameStorage";
import { GROUP_CHAT_KEY } from "./chatData";

// ─── Final Words ───
// Broadcasts a one-time message from a just-exiled player into the
// existing Panopticon group chat (see lib/chatData.js's GROUP_CHAT_KEY
// and message shape, imported directly below rather than duplicated)
// — reuses that exact same storage, not a new table or game_state key
// of its own, since a final words message genuinely IS a group chat
// message, just one flagged distinctly so the UI can style it as the
// dramatic, reality-show "exit interview" moment it's meant to be
// rather than an ordinary line of chat. Written directly here (rather
// than calling lib/chatData.js's own sendGroupMessage and then a
// follow-up update to flag it) so the isFinalWords flag lands in the
// SAME atomic write as the message itself — a separate follow-up write
// risked a real race: if another player's message landed in between,
// "the last message in the list" would no longer be this one, and the
// flag would silently attach to nothing.
//
// This works specifically because exiled players can't otherwise reach
// Panopticon at all once they're out (see ChatPanel.jsx's own tab
// list, which drops "group" entirely for an exiled player) — this is
// the app sending the message on their behalf, the one exception to
// that rule.
//
// Tracked per (playerId, eliminationRound) rather than just per player
// — re-entry means the same person can be exiled more than once in a
// season, and each exile deserves its own final-words opportunity, not
// just the first one they ever got.
const STATUS_KEY = "pb:final-words-status";

export function subscribeFinalWordsStatus(gameId, onChange) {
  return subscribeGameState(gameId, STATUS_KEY, (v) => onChange(v || {}));
}

// True once this specific exile has been resolved one way or the other
// — either they submitted something, or they explicitly skipped. Keyed
// as "playerId:eliminationRound" so a later re-entry exile at a
// different round is tracked as its own, separate opportunity.
export async function hasResolvedFinalWords(gameId, playerId, eliminationRound) {
  const status = (await storageGet(gameId, STATUS_KEY)) || {};
  return !!status[`${playerId}:${eliminationRound}`];
}

async function markResolved(gameId, playerId, eliminationRound) {
  return storageUpdate(gameId, STATUS_KEY, (fresh) => ({
    ...(fresh || {}),
    [`${playerId}:${eliminationRound}`]: true,
  }));
}

export async function submitFinalWords(gameId, player, eliminationRound, message) {
  const trimmed = message.trim();
  if (!trimmed) return { ok: false, error: "Enter a message first." };

  const sendRes = await storageUpdate(gameId, GROUP_CHAT_KEY, (fresh) => {
    const list = fresh || [];
    return [...list, {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      senderId: player.id, senderName: player.name, senderRealName: player.realName || player.name,
      body: trimmed, createdAt: Date.now(), isFinalWords: true,
    }];
  });
  if (!sendRes.ok) return { ok: false, error: "The message didn't save — try again." };

  await markResolved(gameId, player.id, eliminationRound);
  return { ok: true };
}

export async function skipFinalWords(gameId, playerId, eliminationRound) {
  await markResolved(gameId, playerId, eliminationRound);
  return { ok: true };
}
