// Turns the archived vote history (see lib/roundEngine.js, where each
// exile round and the finale get their raw voteRows saved once revealed)
// into flat rows suitable for a table or a CSV export. No storage
// dependency — pure data transformation.

export function buildVotingRows(exileHistory, finaleState, byId) {
  const rows = [];

  (exileHistory || []).forEach((e) => {
    (e.voteRows || []).forEach((v) => {
      rows.push({
        context: `Round ${e.round}`,
        mode: e.mode === "save" ? "Save" : "Eliminate",
        voter: byId[v.voterId] || v.voterId,
        target: byId[v.targetId] || v.targetId || "—",
        reason: v.reason || "",
        chaosHolder: byId[e.chaosHolderId] || "",
        nullified: e.nullifiedId && v.targetId === e.nullifiedId ? "Yes" : "",
        tieBreak: e.tieBreakChoiceId ? (byId[e.tieBreakChoiceId] || "") : "",
        exiled: (e.exiledIds || []).includes(v.targetId) ? "Yes" : "",
      });
    });
  });

  if (finaleState?.voteRows?.length) {
    finaleState.voteRows.forEach((v) => {
      rows.push({
        context: "Finale",
        mode: "Vote for winner",
        voter: byId[v.voterId] || v.voterId,
        target: byId[v.targetId] || v.targetId || "—",
        reason: v.reason || "",
        chaosHolder: byId[finaleState.chaosHolderId] || "",
        nullified: finaleState.nullifiedFinalistId && v.targetId === finaleState.nullifiedFinalistId ? "Yes" : "",
        tieBreak: finaleState.tieBreakChoiceId ? (byId[finaleState.tieBreakChoiceId] || "") : "",
        exiled: finaleState.winnerId && v.targetId === finaleState.winnerId ? "Winner" : "",
      });
    });
  }

  return rows;
}

const CSV_COLUMNS = [
  ["context", "Round"], ["mode", "Mode"], ["voter", "Voter"], ["target", "Voted For"],
  ["reason", "Reason"], ["chaosHolder", "Power of Khaos"], ["nullified", "Nullified?"],
  ["tieBreak", "Tie Broken For"], ["exiled", "Result"],
];

function csvEscape(val) {
  const s = String(val ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function rowsToCSV(rows) {
  const header = CSV_COLUMNS.map(([, label]) => csvEscape(label)).join(",");
  const lines = rows.map((r) => CSV_COLUMNS.map(([key]) => csvEscape(r[key])).join(","));
  return [header, ...lines].join("\n");
}

// ============================================================
// A Survivor/Big Brother-style voting grid — one column per round (plus
// the Finale), one row per player, each cell showing who that player
// voted for that round (blank if they weren't voting that round — not
// yet exiled/finalist, no longer eligible, etc). No Mode or Reason
// columns; those live in buildVotingRows above for the round-by-round
// recap on the Ceremony/History tabs instead.
//
// Header rows above the grid (Big Brother's sheet stacks HOH / Nominations
// / Veto rows above its player grid the same way): Challenge Winner (that
// round's immune 1st place — the Big Brother equivalent of HOH), Fates
// Winners (the top 3 who earned a nomination), Nominees (who was up), 🃏
// Power of Khaos (that round's holder), then Exiled (the outcome) right
// before the grid itself starts.
//
// Row order: players never exiled (still in it, or finalists/the winner),
// alphabetically — then everyone who WAS exiled, most recently exiled
// first, in elimination order.
export function buildVotingGrid(exileHistory, finaleState, players, challengeHistory) {
  const byId = {};
  (players || []).forEach((p) => (byId[p.id] = p.display_name));

  const rounds = [...(exileHistory || [])].sort((a, b) => a.round - b.round);
  const challengeByRound = {};
  (challengeHistory || []).forEach((c) => { challengeByRound[c.round] = c; });
  const hasFinale = !!finaleState?.revealed;

  const columns = rounds.map((e) => ({ key: `r${e.round}`, label: `R${e.round}` }));
  if (hasFinale) columns.push({ key: "finale", label: "Finale" });

  // Column key -> { voterId: { target, nullified } } — nullified means the
  // Power of Khaos holder zeroed out every vote cast for that target that
  // round (not just one voter's), so this is keyed off the target, not
  // the individual vote.
  const votesByColumn = {};
  rounds.forEach((e) => {
    const map = {};
    (e.voteRows || []).forEach((v) => {
      map[v.voterId] = { target: byId[v.targetId] || v.targetId || "?", nullified: !!e.nullifiedId && v.targetId === e.nullifiedId };
    });
    votesByColumn[`r${e.round}`] = map;
  });
  if (hasFinale) {
    const map = {};
    (finaleState.voteRows || []).forEach((v) => {
      map[v.voterId] = { target: byId[v.targetId] || v.targetId || "?", nullified: !!finaleState.nullifiedFinalistId && v.targetId === finaleState.nullifiedFinalistId };
    });
    votesByColumn.finale = map;
  }

  // Header rows, one lookup per column key.
  const winnerByColumn = {};
  const fatesWinnersByColumn = {};
  const nomineesByColumn = {};
  const chaosByColumn = {};
  const voteCountByColumn = {};
  const exiledByColumn = {};

  // Raw vote tally per nominee, sorted highest first, formatted
  // "Name (n)" — includes nullified votes in the count (those are shown
  // struck-through in the grid itself, not hidden from the tally here).
  const tally = (voteRows, candidates) => {
    const counts = {};
    (voteRows || []).forEach((v) => { counts[v.targetId] = (counts[v.targetId] || 0) + 1; });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([id, n]) => `${byId[id] || candidates?.find((c) => c.playerId === id)?.name || "?"} (${n})`);
  };

  rounds.forEach((e) => {
    const key = `r${e.round}`;
    const challengeWinnerId = challengeByRound[e.round]?.placements?.find((p) => p.place === 1)?.playerId;
    winnerByColumn[key] = challengeWinnerId ? [byId[challengeWinnerId] || challengeWinnerId] : [];
    fatesWinnersByColumn[key] = (e.fatesNominatorOrder || []).map((n) => n.name || byId[n.playerId] || n.playerId);
    nomineesByColumn[key] = (e.nominees || []).map((n) => n.name || byId[n.playerId] || n.playerId);
    // "Won it" and "used on" are two different people (or the same round
    // can have a holder who hasn't picked yet, mid-round) — spell out
    // both instead of just naming the holder.
    if (e.chaosHolderId) {
      const holderName = byId[e.chaosHolderId] || e.chaosHolderId;
      chaosByColumn[key] = [e.nullifiedId ? `${holderName} won it, used on ${byId[e.nullifiedId] || e.nullifiedId}` : `${holderName} won it (no pick yet)`];
    } else {
      chaosByColumn[key] = [];
    }
    voteCountByColumn[key] = tally(e.voteRows, e.nominees);
    exiledByColumn[key] = (e.exiledIds || []).map((id) => byId[id] || id);
  });
  if (hasFinale) {
    winnerByColumn.finale = [];
    fatesWinnersByColumn.finale = [];
    nomineesByColumn.finale = (finaleState.finalists || []).map((f) => f.name || byId[f.playerId] || f.playerId);
    if (finaleState.chaosHolderId) {
      const holderName = byId[finaleState.chaosHolderId] || finaleState.chaosHolderId;
      chaosByColumn.finale = [finaleState.nullifiedFinalistId ? `${holderName} won it, used on ${byId[finaleState.nullifiedFinalistId] || finaleState.nullifiedFinalistId}` : `${holderName} won it (no pick yet)`];
    } else {
      chaosByColumn.finale = [];
    }
    voteCountByColumn.finale = tally(finaleState.voteRows, finaleState.finalists);
    exiledByColumn.finale = finaleState.winnerId ? [`${byId[finaleState.winnerId] || "?"} wins`] : [];
  }

  // Every player who shows up anywhere in the record, so no one's silently missing.
  const allIds = new Set();
  rounds.forEach((e) => {
    (e.voteRows || []).forEach((v) => { allIds.add(v.voterId); allIds.add(v.targetId); });
    (e.nominees || []).forEach((n) => allIds.add(n.playerId));
  });
  if (finaleState) {
    (finaleState.finalists || []).forEach((f) => allIds.add(f.playerId));
    (finaleState.voteRows || []).forEach((v) => { allIds.add(v.voterId); allIds.add(v.targetId); });
  }
  (players || []).forEach((p) => allIds.add(p.id));

  const exiledIdSet = new Set();
  const exiledOrder = []; // ascending — first exiled first
  const exiledRoundById = {};
  rounds.forEach((e) => (e.exiledIds || []).forEach((id) => {
    exiledIdSet.add(id);
    exiledOrder.push(id);
    exiledRoundById[id] = e.round;
  }));

  // "Remaining" = never exiled in this record — covers finalists/the
  // winner once the game's over, or whoever's currently still alive if
  // it's a mid-game snapshot. Alive is the more authoritative signal
  // when we have it (players[].alive); falls back to "not in exiledIds"
  // for anyone that data doesn't cover.
  const aliveById = {};
  const eliminationTypeById = {};
  (players || []).forEach((p) => { aliveById[p.id] = p.alive; eliminationTypeById[p.id] = p.elimination_type; });
  const isRemaining = (id) => (aliveById[id] !== undefined ? aliveById[id] : !exiledIdSet.has(id));

  const remainingIds = [...allIds].filter((id) => isRemaining(id));
  remainingIds.sort((a, b) => (byId[a] || "").localeCompare(byId[b] || ""));

  const eliminatedOrdered = [...exiledOrder].reverse().filter((id) => !isRemaining(id));
  // catch-all for anyone eliminated-looking but missed by the exiledIds scan above
  allIds.forEach((id) => {
    if (!isRemaining(id) && !eliminatedOrdered.includes(id)) eliminatedOrdered.push(id);
  });

  const orderedIds = [...remainingIds, ...eliminatedOrdered];

  // A quick label for what happened to a player, shown right on their
  // row — "left/removed" is one bucket because the data itself can't
  // tell them apart (see lib/playerRemoval.js: a host-removal and a
  // voluntary quit both just set elimination_type "quit").
  const statusFor = (id) => {
    if (hasFinale && finaleState.winnerId === id) return { label: "Winner", color: "#00ff9d" };
    if (eliminationTypeById[id] === "quit") return { label: "Left/Removed", color: "#6b4f99" };
    if (exiledRoundById[id] != null) return { label: `Exiled R${exiledRoundById[id]}`, color: "#ff3860" };
    return null;
  };

  const playerRows = orderedIds.map((id) => ({
    playerId: id,
    name: byId[id] || "?",
    isWinner: hasFinale && finaleState.winnerId === id,
    status: statusFor(id),
    cells: columns.map((c) => votesByColumn[c.key]?.[id] ?? null),
  }));

  return { columns, playerRows, winnerByColumn, fatesWinnersByColumn, nomineesByColumn, chaosByColumn, voteCountByColumn, exiledByColumn };
}

export function votingGridToCSV(grid) {
  const headerRow = (label, byColumn) => [label, ...grid.columns.map((c) => (byColumn[c.key] || []).join("; "))].map(csvEscape).join(",");
  const header = ["Player", ...grid.columns.map((c) => c.label)].map(csvEscape).join(",");
  const lines = grid.playerRows.map((r) => [
    r.status ? `${r.name} (${r.status.label})` : r.name,
    ...r.cells.map((c) => (c ? c.target + (c.nullified ? " (nullified)" : "") : "")),
  ].map(csvEscape).join(","));
  return [
    header,
    headerRow("Battle Winner", grid.winnerByColumn),
    headerRow("Fates Winners", grid.fatesWinnersByColumn),
    headerRow("Nominees", grid.nomineesByColumn),
    headerRow("Vote Count", grid.voteCountByColumn),
    headerRow("Power of Khaos", grid.chaosByColumn),
    headerRow("Exiled", grid.exiledByColumn),
    ...lines,
  ].join("\n");
}
