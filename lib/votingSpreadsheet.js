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
  ["reason", "Reason"], ["chaosHolder", "Power of Chaos"], ["nullified", "Nullified?"],
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
// recap on the Ceremony/History tabs instead. Row order: the winner,
// then the other finalists, then everyone else in reverse exile order
// (most recently exiled nearest the top) — the same convention both
// shows' wiki voting-history tables use.
export function buildVotingGrid(exileHistory, finaleState, players) {
  const byId = {};
  (players || []).forEach((p) => (byId[p.id] = p.display_name));

  const rounds = [...(exileHistory || [])].sort((a, b) => a.round - b.round);
  const hasFinale = !!finaleState?.revealed;

  const columns = rounds.map((e) => ({ key: `r${e.round}`, label: `R${e.round}` }));
  if (hasFinale) columns.push({ key: "finale", label: "Finale" });

  // Column key -> { voterId: targetName }
  const votesByColumn = {};
  rounds.forEach((e) => {
    const map = {};
    (e.voteRows || []).forEach((v) => { map[v.voterId] = byId[v.targetId] || v.targetId || "?"; });
    votesByColumn[`r${e.round}`] = map;
  });
  if (hasFinale) {
    const map = {};
    (finaleState.voteRows || []).forEach((v) => { map[v.voterId] = byId[v.targetId] || v.targetId || "?"; });
    votesByColumn.finale = map;
  }

  // Column key -> names exiled that round (for a header row) — the
  // Finale's "column" instead just flags the winner.
  const exiledByColumn = {};
  rounds.forEach((e) => {
    exiledByColumn[`r${e.round}`] = (e.exiledIds || []).map((id) => byId[id] || id);
  });

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

  const exiledOrder = [];
  rounds.forEach((e) => (e.exiledIds || []).forEach((id) => exiledOrder.push(id)));

  let orderedIds = [];
  if (hasFinale) {
    const winnerId = finaleState.winnerId;
    const otherFinalists = (finaleState.finalists || []).map((f) => f.playerId).filter((id) => id !== winnerId);
    orderedIds = [winnerId, ...otherFinalists].filter(Boolean);
  }
  [...exiledOrder].reverse().forEach((id) => { if (!orderedIds.includes(id)) orderedIds.push(id); });
  allIds.forEach((id) => { if (!orderedIds.includes(id)) orderedIds.push(id); });

  const playerRows = orderedIds.map((id) => ({
    playerId: id,
    name: byId[id] || "?",
    isWinner: hasFinale && finaleState.winnerId === id,
    cells: columns.map((c) => votesByColumn[c.key]?.[id] ?? null),
  }));

  return { columns, playerRows, exiledByColumn };
}

export function votingGridToCSV(grid) {
  const header = ["Player", ...grid.columns.map((c) => c.label)].map(csvEscape).join(",");
  const exiledLine = ["Exiled", ...grid.columns.map((c) => (grid.exiledByColumn[c.key] || []).join("; "))].map(csvEscape).join(",");
  const lines = grid.playerRows.map((r) => [r.name, ...r.cells.map((c) => c ?? "")].map(csvEscape).join(","));
  return [header, exiledLine, ...lines].join("\n");
}
