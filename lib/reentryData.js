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
// deciding for is still active and un-finalized. Eligibility itself
// (are they actually still PENDING right now) is enforced by RLS-backed
// reality, not a snapshot: ChallengePlayer.jsx only ever shows this
// button to someone whose live lib/reentryLogic.js status is PENDING, so
// there's nothing further to gate here — and gating on a frozen
// "eligible at challenge-start" list previously meant a player who
// wasn't captured in that exact snapshot (a race right after their
// exile, a host resetting the round, anything) could be silently locked
// out of ever opting in to that challenge, with no way to tell why.
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

// A reentry-eligible player can now decide BEFORE the battle they'd be
// deciding for even exists yet — as soon as its gameType is known
// (Hephaestus's own choice, or the plain auto-pick with no Hephaestus
// this round — see components/ChallengePlayer.jsx's own subscription to
// both), not just once it's already active. There's no challenge
// document to attach a real decision to yet at that point, so this
// stores it as a standing `preDecision` right on their own KEY_REENTRY
// row instead — consumed (and cleared) the moment a challenge actually
// gets created, by consumePreDecidedReentryIns below. Setting it more
// than once (changing their mind) just overwrites the previous value,
// same as setReentryDecision already allows once a challenge exists.
export async function setReentryPreDecision(gameId, playerId, decision) {
  const res = await storageUpdate(gameId, KEY_REENTRY, (fresh) => {
    const list = fresh || [];
    const idx = list.findIndex((r) => r.playerId === playerId && r.status === REENTRY_STATUS.PENDING);
    if (idx < 0) return list;
    const next = list.slice();
    next[idx] = { ...next[idx], preDecision: decision };
    return next;
  });
  return res.ok;
}

// Called once, right as a new challenge is actually created — by both
// ChallengeHost.jsx's manual Start Battle and lib/roundEngine.js's
// autoStartRandomChallenge — so anyone who pre-decided "in" (see
// setReentryPreDecision above) is folded straight into that challenge's
// own participantIds/reentryDecisions/reentryAttemptIds at creation,
// rather than needing to click "Compete this round" all over again
// after it's already live. Clears preDecision back to null on every
// PENDING row in the same update (whether or not it was "in") so a
// stale value can never leak into a LATER challenge they're still
// eligible for. Returns just the ids that actually got folded in, for
// the caller to merge into its own participant/decision arrays.
export async function consumePreDecidedReentryIns(gameId, db) {
  const update = db?.update || storageUpdate;
  let preDecidedInIds = [];
  const res = await update(gameId, KEY_REENTRY, (fresh) => {
    const list = fresh || [];
    preDecidedInIds = list.filter((r) => r.status === REENTRY_STATUS.PENDING && r.preDecision === "in").map((r) => r.playerId);
    if (!list.some((r) => r.status === REENTRY_STATUS.PENDING && r.preDecision)) return list;
    return list.map((r) => (r.status === REENTRY_STATUS.PENDING && r.preDecision ? { ...r, preDecision: null } : r));
  });
  return res.ok ? preDecidedInIds : [];
}
