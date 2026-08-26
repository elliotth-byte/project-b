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
// Row order: players never removed (still in it, or finalists/the
// winner), alphabetically — then everyone who left the game for any
// reason (exiled, quit, host-removed, or removed for inactivity),
// ordered by the actual round they left in, most recent first. See
// eliminationRoundById below for where that round comes from.
export function buildVotingGrid(exileHistory, finaleState, players, challengeHistory) {
  // Deliberately alias-only everywhere in this grid (vote targets,
  // nominees, header rows, everything) even for the host, whose own
  // players array normally arrives with real name and alias already
  // combined into display_name (see lib/playerIdentity.js's
  // resolveIdentitiesForHost — used almost everywhere else on the host
  // side specifically so both are visible together). Recomputed here
  // from the underlying real_display_name/alias fields that resolver
  // already preserves, rather than trusting display_name directly,
  // because showing "Real (Alias)" in every single cell of a whole
  // grid is a wall of repeated real names, not a clean sheet — the
  // real name belongs in exactly one place (see realNameById below,
  // used only for the player row itself, and only when the host turns
  // it on).
  const byId = {};
  const realNameById = {};
  (players || []).forEach((p) => {
    byId[p.id] = p.alias || p.real_display_name || p.display_name;
    realNameById[p.id] = p.real_display_name || p.display_name;
  });

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
    // A tie among the top vote-getters is broken by whoever holds the
    // Power of Khaos that round (see lib/exileLogic.js) — tieBreakChoiceId
    // is only ever set when that actually happened, so this only adds
    // the note for rounds where it's genuinely relevant.
    exiledByColumn[key] = (e.exiledIds || []).map((id) => {
      const name = byId[id] || id;
      if (id === e.tieBreakChoiceId) return `${name} (tie broken by ${byId[e.chaosHolderId] || "the Power of Khaos holder"})`;
      return name;
    });
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
    if (finaleState.winnerId) {
      const winnerName = byId[finaleState.winnerId] || "?";
      exiledByColumn.finale = [
        finaleState.winnerId === finaleState.tieBreakChoiceId
          ? `${winnerName} wins (tie broken by ${byId[finaleState.chaosHolderId] || "the Power of Khaos holder"})`
          : `${winnerName} wins`,
      ];
    } else {
      exiledByColumn.finale = [];
    }
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
  const exiledRoundById = {}; // from exileHistory specifically — normal vote-exiles only, kept as a fallback for pre-migration data below
  rounds.forEach((e) => (e.exiledIds || []).forEach((id) => {
    exiledIdSet.add(id);
    exiledRoundById[id] = e.round;
  }));

  // "Remaining" = never exiled in this record — covers finalists/the
  // winner once the game's over, or whoever's currently still alive if
  // it's a mid-game snapshot. Alive is the more authoritative signal
  // when we have it (players[].alive); falls back to "not in exiledIds"
  // for anyone that data doesn't cover.
  const aliveById = {};
  const eliminationTypeById = {};
  const eliminationRoundById = {};
  (players || []).forEach((p) => {
    aliveById[p.id] = p.alive;
    eliminationTypeById[p.id] = p.elimination_type;
    // players[].elimination_round is the authoritative source now — set
    // uniformly for every removal path (see sql/add-elimination-round.sql
    // and every write site it lists), unlike exiledRoundById above which
    // only ever covered normal vote-exiles. Falls back to that older
    // signal for a season that ran before this column existed, so a
    // vote-exile from before the migration still sorts and labels
    // correctly rather than silently losing its round.
    eliminationRoundById[p.id] = p.elimination_round ?? exiledRoundById[p.id] ?? null;
  });
  const isRemaining = (id) => (aliveById[id] !== undefined ? aliveById[id] : !exiledIdSet.has(id));

  const remainingIds = [...allIds].filter((id) => isRemaining(id));
  remainingIds.sort((a, b) => (byId[a] || "").localeCompare(byId[b] || ""));

  // Every eliminated player, in ONE list, ordered by the round they
  // actually left in — most recent first, matching the existing
  // documented order — regardless of whether that was a normal
  // vote-exile, a quit, a host removal, or an inactivity removal. A
  // round of null (only possible for pre-migration data with no
  // recorded round at all) sorts last, after everyone with a known
  // round, rather than corrupting the ordering of everyone else.
  const eliminatedOrdered = [...allIds]
    .filter((id) => !isRemaining(id))
    .sort((a, b) => {
      const ra = eliminationRoundById[a], rb = eliminationRoundById[b];
      if (ra == null && rb == null) return 0;
      if (ra == null) return 1;
      if (rb == null) return -1;
      return rb - ra;
    });

  const orderedIds = [...remainingIds, ...eliminatedOrdered];

  // A quick label for what happened to a player, shown right on their
  // row — "left/removed" is one bucket because the data itself can't
  // tell a voluntary quit apart from a host removal (see
  // lib/playerRemoval.js: both just set elimination_type "quit"). The
  // round number now shows for every removal type that has one, not
  // just normal exiles — see eliminationRoundById above for where it
  // actually comes from.
  const statusFor = (id) => {
    if (hasFinale && finaleState.winnerId === id) return { label: "Winner", color: "#00ff9d" };
    const r = eliminationRoundById[id];
    if (eliminationTypeById[id] === "removed_inactivity") return { label: r != null ? `Removed — Inactivity (R${r})` : "Removed — Inactivity", color: "#ffb347" };
    if (eliminationTypeById[id] === "quit") return { label: r != null ? `Left/Removed (R${r})` : "Left/Removed", color: "#6b4f99" };
    if (r != null) return { label: `Exiled R${r}`, color: "#ff3860" };
    return null;
  };

  const playerRows = orderedIds.map((id) => ({
    playerId: id,
    name: byId[id] || "?",
    // realName is only ever the SAME as name when alias mode isn't
    // active (or this player never set one) — the component only
    // bothers showing it alongside name when they actually differ.
    realName: realNameById[id] || "?",
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
