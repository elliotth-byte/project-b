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
