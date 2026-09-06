import { storageSet, storageUpdate, subscribeGameState } from "../gameStorage";

// storageUpdate resolves to dbAdapter.js's own actual return shape —
// { ok, value, aborted? } — never the raw next state directly. Every
// mutation function below that needs to hand its caller the resulting
// state (so `state = await someMutation(...)` gets the state itself,
// not a wrapper object) goes through this instead of calling
// storageUpdate directly.
async function updateState(gameId, key, updater) {
  const result = await storageUpdate(gameId, key, updater);
  return result?.value ?? null;
}


// ─── Pandora's Boxes ───
// Every participant starts holding one sealed box — identified,
// throughout all of this, by whoever it originally belonged to
// (boxId === that player's own id; there's nothing else to a box worth
// tracking separately). Two rounds:
//   Round 1 — everyone gives their OWN box away to one other player,
//   simultaneously, all choices private until every last one is in.
//   Round 2 — anyone now holding one or more boxes they didn't start
//   with must give EACH of them away again, one recipient per box, to
//   anyone except themselves and except that box's own original owner
//   (returning it to whoever it came from isn't allowed) — a player
//   holding zero boxes going into round 2 (nobody gave them anything in
//   round 1) has nothing to do this round at all.
// Once every required round-2 gift is locked in, every box opens at
// once: three of them (fixed at the very start, before a single choice
// was made) hold the season's fortune — 1st, 2nd, 3rd — the rest hold
// nothing.
//
// Same trust model as Chains/Masquerade/Torched already accept in this
// app (see sql/schema.sql: any player in a game can already read this
// entire row) — prizeBoxIds below is a UI-convention secret, not a
// technically enforced one. It doesn't matter here in the way it might
// elsewhere: it's fixed before round 1 even opens, so there is no
// strategic choice anywhere in this battle that could even theoretically
// be informed by knowing it early — gifting is blind by construction,
// not just by politeness.

export const pandorasBoxesKey = (round) => `pb:pandorasboxes:${round}`;
const key = pandorasBoxesKey;

export function subscribePandorasBoxes(gameId, round, onChange) {
  return subscribeGameState(gameId, key(round), onChange);
}

// Round 2's "no returning it to where it came from" rule requires a
// third player to route a box through — with only 2 participants, the
// one other person IS always that box's original owner, making round 2
// impossible to satisfy at all. 3 is the actual structural floor, not
// just a nicety for having three distinct prizes to award.
const MIN_PARTICIPANTS = 3;
const POINTS = { first: 3, second: 2, third: 1 };

// db: optional override — see lib/games/plinkoBracketData.js's
// initPlinkoBracket for why (server-side auto-start passes its own db
// wrapper; the host's manual Start Battle click uses the default).
export async function initPandorasBoxes(gameId, round, participants, db) {
  const set = db?.set || storageSet;
  if (participants.length < MIN_PARTICIPANTS) return; // degenerate case, handled client-side

  const participantIds = participants.map((p) => p.id);
  const shuffled = [...participantIds];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const [first, second, third] = shuffled;

  await set(gameId, key(round), {
    participantIds,
    prizeBoxIds: { first, second, third },
    phase: "round1", // "round1" | "round2" | "revealed"
    round1Gifts: {}, // playerId (box owner/giver) -> recipientId
    round1LockedInAt: {},
    round1Holdings: null, // computed once round 1 fully locked in: playerId -> [boxId, ...] boxes they now hold
    round2Gifts: {}, // holderId -> { boxId -> recipientId }, one entry per box that holder received in round 1
    round2LockedInAt: {}, // holderId -> timestamp — only ever set for holders who actually had boxes to give
    finalHoldings: null, // boxId -> final holder's playerId, computed once round 2 fully resolves
    results: null, // playerId -> { placement: "first"|"second"|"third"|null, points, boxesHeld: [boxId,...] }
  });
}

// A single, atomic "give my box to X" — see chainsData.js's
// submitChain for the identical shape of this pattern: whichever
// submission turns out to be the last one needed computes round 1's
// resulting holdings in that same write, so "everyone's in" and "round
// 2 is ready" become true at the same instant for every client.
export async function submitRound1Gift(gameId, round, playerId, recipientId) {
  return updateState(gameId, key(round), (fresh) => {
    if (!fresh || fresh.phase !== "round1") return fresh;
    if (fresh.round1Gifts[playerId]) return fresh; // already locked in
    if (recipientId === playerId) return fresh;
    if (!fresh.participantIds.includes(recipientId)) return fresh;

    const nextGifts = { ...fresh.round1Gifts, [playerId]: recipientId };
    const nextLockedInAt = { ...fresh.round1LockedInAt, [playerId]: Date.now() };
    const everyoneIn = fresh.participantIds.every((id) => !!nextGifts[id]);

    if (!everyoneIn) {
      return { ...fresh, round1Gifts: nextGifts, round1LockedInAt: nextLockedInAt };
    }

    const holdings = {};
    fresh.participantIds.forEach((id) => { holdings[id] = []; });
    fresh.participantIds.forEach((ownerId) => { holdings[nextGifts[ownerId]].push(ownerId); }); // boxId === its original owner's id

    return { ...fresh, round1Gifts: nextGifts, round1LockedInAt: nextLockedInAt, round1Holdings: holdings, phase: "round2" };
  });
}

// One holder's COMPLETE set of round-2 gifts, submitted together —
// giftsByBoxId must cover every box (and only those boxes) this holder
// received in round 1: { [boxId]: recipientId }. Rejected outright
// (silent no-op, same as an invalid chain in chainsData.js) if it's
// missing a box, includes one this player never held, sends a box to
// its own original owner, or sends it back to the giver themselves.
export async function submitRound2Gifts(gameId, round, playerId, giftsByBoxId) {
  return updateState(gameId, key(round), (fresh) => {
    if (!fresh || fresh.phase !== "round2") return fresh;
    if (fresh.round2LockedInAt[playerId]) return fresh; // already locked in
    const myBoxes = fresh.round1Holdings?.[playerId] || [];
    if (myBoxes.length === 0) return fresh; // nothing to give — this holder shouldn't be calling this at all
    if (Object.keys(giftsByBoxId || {}).length !== myBoxes.length) return fresh;

    for (const boxId of myBoxes) {
      const recipientId = giftsByBoxId[boxId];
      if (!recipientId) return fresh;
      if (recipientId === playerId) return fresh;
      if (recipientId === boxId) return fresh; // boxId doubles as that box's original owner's playerId — the "not back to where it came from" rule
      if (!fresh.participantIds.includes(recipientId)) return fresh;
    }

    const nextRound2Gifts = { ...fresh.round2Gifts, [playerId]: giftsByBoxId };
    const nextLockedInAt = { ...fresh.round2LockedInAt, [playerId]: Date.now() };
    const requiredHolders = fresh.participantIds.filter((id) => (fresh.round1Holdings[id] || []).length > 0);
    const everyoneIn = requiredHolders.every((id) => !!nextLockedInAt[id]);

    if (!everyoneIn) {
      return { ...fresh, round2Gifts: nextRound2Gifts, round2LockedInAt: nextLockedInAt };
    }

    const finalHoldings = {};
    fresh.participantIds.forEach((holderId) => {
      (fresh.round1Holdings[holderId] || []).forEach((boxId) => {
        finalHoldings[boxId] = nextRound2Gifts[holderId]?.[boxId];
      });
    });

    const results = {};
    fresh.participantIds.forEach((id) => { results[id] = { placement: null, points: 0, boxesHeld: [] }; });
    Object.entries(finalHoldings).forEach(([boxId, holderId]) => {
      if (results[holderId]) results[holderId].boxesHeld.push(boxId);
    });
    // A player CAN end up holding more than one prize box (nothing
    // stops two different round-2 gifts from landing on the same
    // recipient) — points simply add up; `placement` just reflects
    // whichever single one is best, for display purposes only.
    Object.entries(fresh.prizeBoxIds).forEach(([place, boxId]) => {
      const holderId = finalHoldings[boxId];
      if (!results[holderId]) return;
      results[holderId].points += POINTS[place];
      if (!results[holderId].placement || POINTS[place] > POINTS[results[holderId].placement]) {
        results[holderId].placement = place;
      }
    });

    return { ...fresh, round2Gifts: nextRound2Gifts, round2LockedInAt: nextLockedInAt, finalHoldings, results, phase: "revealed" };
  });
}

// The value reported via reportScore, same tie-break-encoding trick as
// chainsData.js's placementValue (points dominate; within equal points,
// an earlier lock-in produces a strictly higher value) — necessary for
// the identical reason: every participant's result becomes known at the
// same instant (whichever round-2 submission was the last one needed),
// so reportScore's own finishedAt timestamp can't tell who was actually
// faster to decide.
const TIE_BREAK_REFERENCE_MS = 9999999999999; // year ~2286 — comfortably past any real lock-in timestamp this app will ever see
export function placementValue(state, playerId) {
  if (state.phase !== "revealed") return 0;
  const r = state.results?.[playerId];
  if (!r) return 0;
  // A holder with nothing to give away in round 2 has no round2LockedInAt
  // of their own — falls back to their round 1 lock-in time so they're
  // still placed consistently among equal-points players, rather than
  // always sorting dead-last for having had no round-2 action to take.
  const lockedInAt = state.round2LockedInAt?.[playerId] || state.round1LockedInAt?.[playerId] || 0;
  return r.points * 1e13 + (TIE_BREAK_REFERENCE_MS - lockedInAt);
}
