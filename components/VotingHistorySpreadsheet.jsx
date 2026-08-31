import { useState } from "react";
import { Card, Btn, Badge } from "./ui";
import { buildVotingGrid, votingGridToCSV } from "../lib/votingSpreadsheet";

const headerRowStyle = { borderBottom: "1px solid #3d1f5c" };
const headerLabelStyle = {
  textAlign: "left", padding: "4px 10px", color: "#6b4f99", fontWeight: 500, fontStyle: "italic",
  whiteSpace: "nowrap", position: "sticky", left: 0, background: "#1a0a2e",
};

function HeaderRow({ label, byColumn, columns, color = "#a68fd6" }) {
  return (
    <tr style={headerRowStyle}>
      <th style={headerLabelStyle}>{label}</th>
      {columns.map((c) => (
        <th key={c.key} style={{ textAlign: "left", padding: "4px 10px", color, fontWeight: 500, fontStyle: "italic", whiteSpace: "nowrap" }}>
          {(byColumn[c.key] || []).join(", ") || "—"}
        </th>
      ))}
    </tr>
  );
}

// ─── Voting History ───
// A Survivor/Big Brother wiki-style grid: one column per round (plus the
// Finale), one row per player, each cell showing who they voted for that
// round. No Mode or Reason columns — those are still available in the
// round-by-round recap on the History/Ceremony tabs. Above the grid,
// stacked header rows (matching how Big Brother's own voting-history
// sheet stacks HOH/Nominations/Veto above its player grid) show that
// round's Challenge Winner, Fates Winners (the top 3 who earned a
// nomination), Nominees, that round's vote count, who won (and used) the
// Power of Khaos, then who was Exiled. Each player's own row is tagged
// with a status badge — Winner, Exiled (with which round), or
// Left/Removed (also with which round now — see
// lib/votingSpreadsheet.js) — so it's clear at a glance what happened
// to them, not just that their votes stop appearing.
//
// Every name in this grid (vote targets, nominees, everything) is
// alias-only when alias mode is active — even for the host, who
// normally sees real name and alias combined everywhere else (see
// lib/playerIdentity.js). isHost + the toggle below are the ONE
// exception: only the host can reveal the real name, and only right on
// the player row itself — see lib/votingSpreadsheet.js's own header
// comment on why that's deliberately not spread into every cell.
export default function VotingHistorySpreadsheet({ exileHistory, finaleState, players, gameName, challengeHistory, isHost = false }) {
  const [showRealNames, setShowRealNames] = useState(false);
  const grid = buildVotingGrid(exileHistory, finaleState, players, challengeHistory);
  if (grid.columns.length === 0) return null;

  const download = () => {
    const csv = votingGridToCSV(grid);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(gameName || "project-b").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-voting-history.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🗳 Voting History</h3>
        <div style={{ display: "flex", gap: 8 }}>
          {isHost && (
            <Btn small variant={showRealNames ? "primary" : "ghost"} onClick={() => setShowRealNames(!showRealNames)}>
              {showRealNames ? "🙈 Hide real names" : "👁 Show real names"}
            </Btn>
          )}
          <Btn small onClick={download}>⬇ Download CSV</Btn>
        </div>
      </div>
      <div style={{ fontSize: 10, color: "#6b4f99", marginBottom: 10 }}><s style={{ textDecorationColor: "#ff3860" }}>Struck-through</s> votes were nullified by the Power of Khaos.</div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "max-content", minWidth: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={headerRowStyle}>
              <th style={{ textAlign: "left", padding: "6px 10px", color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700, whiteSpace: "nowrap", position: "sticky", left: 0, background: "#1a0a2e" }}>
                Player
              </th>
              {grid.columns.map((c) => (
                <th key={c.key} style={{ textAlign: "left", padding: "6px 10px", color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700, whiteSpace: "nowrap" }}>
                  {c.label}
                </th>
              ))}
            </tr>
            <HeaderRow label="Battle Winner" byColumn={grid.winnerByColumn} columns={grid.columns} color="#00ff9d" />
            <HeaderRow label="Fates Winners" byColumn={grid.fatesWinnersByColumn} columns={grid.columns} />
            <HeaderRow label="Nominees" byColumn={grid.nomineesByColumn} columns={grid.columns} />
            <HeaderRow label="Vote Count" byColumn={grid.voteCountByColumn} columns={grid.columns} />
            <HeaderRow label="🃏 Power of Khaos" byColumn={grid.chaosByColumn} columns={grid.columns} />
            <HeaderRow label="Exiled" byColumn={grid.exiledByColumn} columns={grid.columns} color="#ff3860" />
          </thead>
          <tbody>
            {grid.playerRows.map((r) => (
              <tr key={r.playerId} style={{ borderBottom: "1px solid #150a28" }}>
                <td style={{ padding: "6px 10px", whiteSpace: "nowrap", position: "sticky", left: 0, background: "#1a0a2e" }}>
                  <span style={{ color: "#f5f0ff", fontWeight: 700 }}>{r.name}</span>
                  {isHost && showRealNames && r.realName !== r.name && (
                    <span style={{ color: "#6b4f99", fontWeight: 400, fontSize: 11, marginLeft: 4 }}>({r.realName})</span>
                  )}
                  {r.status && <span style={{ marginLeft: 6 }}><Badge color={r.status.color}>{r.status.label}</Badge></span>}
                </td>
                {r.cells.map((cell, i) => (
                  <td key={i} style={{ padding: "6px 10px", color: cell ? "#f5f0ff" : "#6b4f99", whiteSpace: "nowrap" }}>
                    {cell ? (
                      <span
                        style={cell.nullified ? { textDecoration: "line-through", textDecorationColor: "#ff3860", textDecorationThickness: 2, color: "#6b4f99" } : undefined}
                        title={cell.nullified ? "Nullified by the Power of Khaos" : undefined}
                      >
                        {cell.target}
                      </span>
                    ) : "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
