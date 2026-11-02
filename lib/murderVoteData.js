// One murder vote PER FACTION, not one shared pool — see
// sql/add-faction-murder-vote.sql for why. "murder-vote:traitor-red" and
// "murder-vote:traitor-black" are two entirely separate, mutually
// invisible rows.
export const murderVoteKey = (faction) => `murder-vote:${faction}`;

export function calculateMurderVoteResult(state) {
  const voteCounts = {};
  Object.values(state.votes || {}).forEach((v) => {
    voteCounts[v.targetName] = (voteCounts[v.targetName] || 0) + 1;
  });
  const entries = Object.entries(voteCounts).sort((a, b) => b[1] - a[1]);
  const submittedCount = Object.keys(state.votes || {}).length;
  const eligibleCount = (state.eligibleVoters || []).length;

  if (entries.length === 0) {
    return { targetName: null, ruleSatisfied: false, tied: false, tiedTargets: [], voteCounts };
  }

  const topCount = entries[0][1];
  const tiedTargets = entries.filter(([, c]) => c === topCount).map(([name]) => name);
  const tied = tiedTargets.length > 1;

  if (state.votingRule === "host_decides") {
    return { targetName: null, ruleSatisfied: false, tied, tiedTargets, voteCounts };
  }

  if (state.votingRule === "unanimous") {
    const allSame = eligibleCount > 0 && submittedCount === eligibleCount && tiedTargets.length === 1 && topCount === eligibleCount;
    return { targetName: allSame ? tiedTargets[0] : null, ruleSatisfied: allSame, tied, tiedTargets, voteCounts };
  }

  if (state.votingRule === "majority") {
    const basis = state.majorityBasis === "submitted_votes" ? submittedCount : eligibleCount;
    const satisfied = !tied && topCount > basis / 2;
    return { targetName: satisfied ? tiedTargets[0] : null, ruleSatisfied: satisfied, tied, tiedTargets, voteCounts };
  }

  // plurality (default)
  return { targetName: tied ? null : tiedTargets[0], ruleSatisfied: !tied, tied, tiedTargets, voteCounts };
}

// Eligible targets for a GIVEN faction's murder vote: every living player
// EXCEPT that faction's own members. This is what makes cross-faction
// murder possible — a Red Traitor's eligible targets now include Black
// Traitors (and Faithful players), same as before; only Red's own
// teammates are excluded, not "every Traitor" the way this worked
// before factions could murder each other.
export function defaultEligibleTargets(players, roles, shielded, actingFaction, { excludeShielded = true } = {}) {
  return players
    .filter((p) => p.alive)
    .filter((p) => roles?.[p.display_name] !== actingFaction)
    .filter((p) => !excludeShielded || !shielded?.[p.display_name])
    .map((p) => p.display_name);
}

export function sameNameSet(a = [], b = []) {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return set.size === a.length && b.every((n) => set.has(n));
}

// ─── Keeping an OPEN vote's target list true to the roster ───
// An open vote snapshots its eligibleTargets when the host opens it, so
// anything that changes afterwards — a murder, banish, walk, restore, recruit,
// merge, or a shield toggled — would otherwise leave Traitors looking at a
// stale list (dead players still votable, newly shielded players still
// listed, a freshly recruited teammate still targetable). This is the ONE
// place that decides what the list should be right now:
//   * a default list is re-derived from the live roster (honoring the vote's
//     own "exclude shielded" setting);
//   * a hand-picked list keeps the host's choices, but anyone who is no longer
//     a valid target at all (dead, or on the acting faction's own side) is
//     dropped — shielded players the host picked on purpose stay.
export function reconcileEligibleTargets(vote, players, roles, shielded, faction) {
  if (vote.customTargets) {
    const pool = defaultEligibleTargets(players, roles, shielded, faction, { excludeShielded: false });
    return (vote.eligibleTargets || []).filter((n) => pool.includes(n));
  }
  return defaultEligibleTargets(players, roles, shielded, faction, { excludeShielded: !!vote.excludeShielded });
}

// Re-syncs ONE faction's open vote. Writes only if the list actually changes.
// `traitorStorageUpdate` is passed in to keep this module free of storage
// imports.
export function reconcileOpenMurderVote(gameId, faction, players, tr, traitorStorageUpdate) {
  return traitorStorageUpdate(gameId, murderVoteKey(faction), (fresh) => {
    if (!fresh || fresh.status !== "open") return null;
    const next = reconcileEligibleTargets(fresh, players, tr.roles, tr.shielded, faction);
    if (sameNameSet(next, fresh.eligibleTargets)) return null;
    fresh.eligibleTargets = next;
    return fresh;
  });
}

// Both factions. Call after anything that changes shields, roles or who is
// alive.
export async function refreshOpenMurderVotes(gameId, players, tr, traitorStorageUpdate) {
  await Promise.all(["traitor-red", "traitor-black"].map((faction) =>
    reconcileOpenMurderVote(gameId, faction, players, tr, traitorStorageUpdate)
  ));
}

// ─── Scarlet Dagger (single-use double murder) ───
// There is ONE Scarlet Dagger per season. Whether it has been spent lives in
// the host-only Traitor Roles state (tr.scarletDaggerUsed) — it has to
// survive a vote being reset, and a reset deletes the whole vote row. The
// vote row only carries `scarletDaggerAvailable`, a copy of "offered and not
// yet spent" taken when the host opens the vote, which is all a Traitor's
// client needs (and is allowed) to see.
//
// Each Traitor's vote may additionally carry { useDagger: true,
// secondTargetName } — "I vote to draw the dagger, and my second victim is X".
// Non-voters count as "no".

// Yes-votes needed to draw the dagger: all voters under "unanimous",
// otherwise a strict majority of every eligible voter (not just those who
// have voted).
export function scarletDaggerRequiredVotes(state) {
  const eligible = (state.eligibleVoters || []).length;
  if (eligible === 0) return 0;
  return state.votingRule === "unanimous" ? eligible : Math.floor(eligible / 2) + 1;
}

// Derived from the votes on every render, so nothing extra needs storing.
// `firstTarget` is whoever the normal vote picked (or the host chose by
// hand); second-victim picks for that same player don't count. Under
// "host_decides" the dagger never auto-activates — the host chooses.
export function calculateScarletDaggerResult(state, firstTarget = null) {
  const eligibleCount = (state.eligibleVoters || []).length;
  const yesVotes = Object.values(state.votes || {}).filter((v) => v.useDagger);
  const yes = yesVotes.length;
  const required = scarletDaggerRequiredVotes(state);
  const passed = state.votingRule !== "host_decides" && required > 0 && yes >= required;

  const secondCounts = {};
  yesVotes.forEach((v) => {
    if (v.secondTargetName && v.secondTargetName !== firstTarget) {
      secondCounts[v.secondTargetName] = (secondCounts[v.secondTargetName] || 0) + 1;
    }
  });
  const entries = Object.entries(secondCounts).sort((a, b) => b[1] - a[1]);
  let secondTiedTargets = [];
  if (entries.length > 0) {
    const top = entries[0][1];
    secondTiedTargets = entries.filter(([, c]) => c === top).map(([name]) => name);
  }
  const secondTied = secondTiedTargets.length > 1;
  const secondTarget = !secondTied && secondTiedTargets.length === 1 ? secondTiedTargets[0] : null;

  return { yes, required, eligibleCount, passed, secondCounts, secondTarget, secondTied, secondTiedTargets };
}

// Once the dagger is spent, pull it from any vote that is still open so no
// Traitor is offered a dagger that no longer exists.
export async function withdrawScarletDagger(gameId, traitorStorageUpdate) {
  await Promise.all(["traitor-red", "traitor-black"].map((faction) =>
    traitorStorageUpdate(gameId, murderVoteKey(faction), (fresh) => {
      if (!fresh || fresh.status !== "open" || !fresh.scarletDaggerAvailable) return null;
      fresh.scarletDaggerAvailable = false;
      return fresh;
    })
  ));
}
