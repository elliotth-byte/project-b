// ============================================================
// Power of Khaos — random draw + the nullification effect it has on a vote.
// Pure logic, no storage dependency.
// ============================================================

// eligiblePlayers: [{ playerId, name }] — who's actually in the room able
// to receive the draw (normally every alive player casting a vote this
// round; for the finale it's every exiled player instead).
export function drawPowerOfChaos(eligiblePlayers) {
  const pool = eligiblePlayers || [];
  if (pool.length === 0) return null;
  const idx = Math.floor(Math.random() * pool.length);
  return pool[idx];
}

// Applies the chaos holder's chosen nullification to a raw vote tally.
// voteRows: [{ voterId, voterName, targetId, targetName }]
// nullifiedTargetId: the nominee/finalist whose votes don't count at all.
export function tallyWithNullification(voteRows, nullifiedTargetId) {
  const counted = (voteRows || []).filter((r) => r.targetId !== nullifiedTargetId);
  const tally = {};
  counted.forEach((r) => {
    tally[r.targetId] = (tally[r.targetId] || 0) + 1;
  });
  return { tally, counted, nullified: (voteRows || []).filter((r) => r.targetId === nullifiedTargetId) };
}
