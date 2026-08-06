import { storageGet, storageUpdate, subscribeGameState } from "./gameStorage";
import { KEY_REENTRY, KEY_CHALLENGE } from "./gameState";
import { REENTRY_STATUS } from "./reentryLogic";

export function subscribeReentry(gameId, onChange) {
  return subscribeGameState(gameId, KEY_REENTRY, (v) => onChange(v || []));
}

export async function getReentry(gameId) {
  return (await storageGet(gameId, KEY_REENTRY)) || [];
}

// An exiled player's deliberate, per-challenge opt in/out — see
// components/ChallengePlayer.jsx. Only valid while the challenge they're
// deciding for is still active and un-finalized, and only for a player
// actually eligible for THIS challenge (challenge.reentryEligibleIds is
// snapshotted when the challenge starts — see ChallengeHost.jsx).
//
// Opting "in" adds them to the challenge's participant list right away
// (same as any other competitor from that point on) and marks their
// lib/reentryLogic.js status COMPETING, using up their one shot the
// moment the challenge resolves. Opting "out" — or never deciding, which
// lib/roundEngine.js defaults to "out" once every alive competitor has
// finished — costs them nothing; they're still PENDING for a future
// challenge.
export async function setReentryDecision(gameId, playerId, decision) {
  const challengeRes = await storageUpdate(gameId, KEY_CHALLENGE, (fresh) => {
    if (!fresh || !fresh.active || fresh.finalized) return fresh;
    if (!(fresh.reentryEligibleIds || []).includes(playerId)) return fresh;
    const decisions = { ...(fresh.reentryDecisions || {}), [playerId]: decision };
    let participantIds = fresh.participantIds || [];
    let reentryAttemptIds = fresh.reentryAttemptIds || [];
    if (decision === "in") {
      if (!participantIds.includes(playerId)) participantIds = [...participantIds, playerId];
      if (!reentryAttemptIds.includes(playerId)) reentryAttemptIds = [...reentryAttemptIds, playerId];
    } else {
      // Reversing an earlier "in" (only possible before they've actually
      // started playing — ChallengePlayer.jsx locks it in once they have).
      participantIds = participantIds.filter((id) => id !== playerId);
      reentryAttemptIds = reentryAttemptIds.filter((id) => id !== playerId);
    }
    return { ...fresh, reentryDecisions: decisions, participantIds, reentryAttemptIds };
  });
  if (!challengeRes.ok) return false;

  await storageUpdate(gameId, KEY_REENTRY, (fresh) => {
    const list = fresh || [];
    const idx = list.findIndex((r) => r.playerId === playerId);
    if (idx < 0) return list;
    list[idx] = { ...list[idx], status: decision === "in" ? REENTRY_STATUS.COMPETING : REENTRY_STATUS.PENDING };
    return list;
  });
  return true;
}
