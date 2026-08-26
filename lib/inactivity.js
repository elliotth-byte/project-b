// ─── Inactivity system ───
// See sql/add-inactivity-system.sql for the underlying player fields
// (inactivity_strikes, inactivity_shielded) this all reads and writes.
// Pure logic lives here, same split as lib/characterPowers.js — the
// actual database orchestration (who gets checked, when, and the writes
// themselves) lives in lib/roundEngine.js, which calls into this file.
//
// Triggers, for reference (confirmed with the season's host before any
// of this was built):
//   - Missed Fates nomination, or missed Power of Khaos decision: the
//     game picks on their behalf (nomination already did this; Khaos
//     is a new change — see roundEngine.js — from "treated as declined"
//     to "always exercised, picked at random"), PLUS a strike, PLUS the
//     existing next-battle ban (already existed for nominations, newly
//     extended to Khaos).
//   - Missed voting or missed playing a challenge they were actually
//     expected to (not someone correctly sitting out a duel-style
//     game, not someone already banned from that specific thing): one
//     strike.
//   - Missing ALL FOUR of voting, challenge participation, AND sending
//     any message (public or DM — receiving one doesn't count) in the
//     same round: instant removal, no strike step in between. Starts
//     checking from round 2 — round 1 is exempt entirely, a new
//     player's first round.
//   - 3 strikes (from either path above) also removes a player, same
//     as the instant rule — both produce the same "removed_inactivity"
//     elimination type.
//   - Strikes decay by 1 automatically at rounds 3, 6, 9, ... — every
//     player who has any, all at once, not counted from each player's
//     own most recent strike.
//   - The exemption for a legitimate ban (battle-banned from a
//     challenge, vote-banned by a power) applies consistently
//     everywhere in this system — the strike path AND the instant-
//     removal path both treat a banned requirement as satisfied, never
//     as a failure, for whoever's actually banned from it that round.
//   - The host can shield a player entirely — full immunity from every
//     punitive consequence here, for as long as the shield is on.

// Whether this player is COMPLETELY exempt from every punitive
// consequence in this system — strikes, battle-bans-for-inactivity, and
// instant removal, all of it. Does NOT exempt them from the underlying
// game-integrity guarantees that exist independent of punishment (a
// nominee always gets picked for Fates, the Power of Khaos is always
// exercised) — those still resolve on a shielded player's behalf
// exactly the same way regardless of shield status; the shield only
// removes what would otherwise happen TO them as a consequence of not
// having acted.
export function isShielded(player) {
  return !!player?.inactivity_shielded;
}

// The result of applying one strike — tells the caller both the new
// count AND whether this specific application crosses the removal
// threshold, so the actual write (which the caller performs — this
// function only computes what it should look like) can set alive/
// elimination_type in the SAME update as the strike itself, rather than
// a separate round-trip that could race with something else in between.
export function nextStrikeState(currentStrikes) {
  const newStrikes = (currentStrikes || 0) + 1;
  return { newStrikes, removed: newStrikes >= 3 };
}

// Strike decay — every 3rd round (3, 6, 9, ...), season-wide, all at
// once. Deliberately NOT per-player timing off their own most recent
// strike — confirmed as the simpler, intended version.
export function isStrikeDecayRound(roundNumber) {
  return Number.isInteger(roundNumber) && roundNumber > 0 && roundNumber % 3 === 0;
}

export function decayedStrikeCount(currentStrikes) {
  return Math.max(0, (currentStrikes || 0) - 1);
}

// Instant removal — the severe rule, no strike buffer at all. Confirmed
// precisely with the season's host: missing ALL THREE of voting,
// challenge participation, and sending any message (public OR DM —
// either one alone is enough to satisfy this leg, receiving one never
// counts) removes a player outright, the same round it happens.
// Starts at round 2 — the caller is responsible for that check, this
// function only evaluates the three-leg condition itself, not the
// round-number exemption.
//
// voteExempt/challengeExempt let a legitimate ban (Dionysus can't vote
// at all; battle-banned from this round's challenge) satisfy that ONE
// leg without it being able to contribute to removal — confirmed this
// applies here the same consistent way it applies to the strike system,
// not a separate, looser rule for the instant case. There's no
// equivalent exemption for messaging — Hera's chat exile only blocks
// the Group Chat specifically, for the deliberation window, not DMs or
// the whole round, so it was never a total block the way the other two
// bans are.
export function meetsInstantRemovalCriteria({ voted, playedChallenge, sentMessage, voteExempt, challengeExempt }) {
  // Each leg is either exempt (removed from consideration entirely) or
  // evaluated normally — confirmed this is what "exempt" actually means
  // here: NOT blanket immunity the instant any one leg is exempt, but
  // removal from that specific leg's count, leaving the remaining legs
  // to decide it on their own. Someone battle-banned who ALSO genuinely
  // didn't vote or message is still removed on those two alone — the
  // exemption only ever protects the one leg it actually applies to.
  const legs = [];
  if (!voteExempt) legs.push(voted);
  if (!challengeExempt) legs.push(playedChallenge);
  legs.push(sentMessage); // no exemption exists for this leg at all — see this file's own comment above
  return legs.every((satisfied) => !satisfied);
}
