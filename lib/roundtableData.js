// Unchanged from the original artifact's vote-tally/reveal-ordering logic —
// none of this touches storage, so it needed zero changes for the Supabase
// migration. voteRows shape: [{ voterName, targetName, reason }]

export function computeVoteTally(voteRows) {
  const tally = {};
  voteRows.forEach((r) => { tally[r.targetName] = (tally[r.targetName] || 0) + 1; });
  return tally;
}

// Reorders vote rows for maximum suspense when revealing them one at a time:
// stray/singleton votes go first, major contenders alternate round-robin,
// and the decisive vote against whoever's leading goes last.
export function buildDramaticVoteOrder(voteRows) {
  if (!voteRows || voteRows.length === 0) return [];

  const tally = computeVoteTally(voteRows);
  const withTotals = voteRows.map((r) => ({ ...r, targetCurrentTotal: tally[r.targetName] || 0 }));

  const remaining = {};
  withTotals.forEach((r) => {
    if (!remaining[r.targetName]) remaining[r.targetName] = [];
    remaining[r.targetName].push(r);
  });

  const ranked = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  const topCount = ranked[0]?.[1] || 0;
  const leaders = ranked.filter(([, c]) => c === topCount).map(([name]) => name);

  const majorTargets = ranked.filter(([, c]) => c >= 2).map(([name]) => name);
  const strayTargets = ranked.filter(([name, c]) => c === 1 && !leaders.includes(name)).map(([name]) => name);
  const heldSingles = ranked.filter(([name, c]) => c === 1 && leaders.includes(name)).map(([name]) => name);

  const result = [];

  strayTargets.forEach((t) => {
    while (remaining[t] && remaining[t].length) result.push(remaining[t].shift());
  });

  const banishedTarget = ranked[0]?.[0];
  let decisiveVote = null;
  if (banishedTarget && remaining[banishedTarget] && remaining[banishedTarget].length) {
    decisiveVote = remaining[banishedTarget].pop();
  }

  const rrTargets = [...majorTargets, ...heldSingles].filter((t, i, arr) => arr.indexOf(t) === i);
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const t of rrTargets) {
      if (remaining[t] && remaining[t].length) {
        result.push(remaining[t].shift());
        progressed = true;
      }
    }
  }

  Object.values(remaining).forEach((arr) => result.push(...arr));
  if (decisiveVote) result.push(decisiveVote);

  return result;
}

export function buildVoteRevealMessage(row, cumulativeTallyText) {
  const reason = row.reason || "no reason given";
  let msg = `${row.voterName}: ${row.targetName} — ${reason}`;
  if (cumulativeTallyText) msg += ` (current tally: ${cumulativeTallyText})`;
  return msg;
}

export function cumulativeTallyThrough(order, idx) {
  const tally = {};
  for (let i = 0; i <= idx; i++) {
    tally[order[i].targetName] = (tally[order[i].targetName] || 0) + 1;
  }
  return Object.entries(tally)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => `${name}: ${count}`)
    .join(", ");
}

export const STORAGE_KEY_ROUND_INFO = "traitors:round-info";
export const VOTES_KEY_PREFIX = "traitors:votes:round-";
export const STORAGE_KEY_VOTE_HISTORY = "traitors:vote-history";
