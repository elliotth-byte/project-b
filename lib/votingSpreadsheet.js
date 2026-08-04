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
