import { Card, Btn, Badge } from "./ui";
import { buildVotingGrid, votingGridToCSV } from "../lib/votingSpreadsheet";

// ─── Voting History ───
// A Survivor/Big Brother wiki-style grid: one column per round (plus the
// Finale), one row per player, each cell showing who they voted for that
// round. No Mode or Reason columns — those are still available in the
// round-by-round recap on the History/Ceremony tabs; this table is
// purely "who voted for whom, at a glance."
export default function VotingHistorySpreadsheet({ exileHistory, finaleState, players, gameName }) {
  const grid = buildVotingGrid(exileHistory, finaleState, players);
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🗳 Voting History</h3>
        <Btn small onClick={download}>⬇ Download CSV</Btn>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #3d1f5c" }}>
              <th style={{ textAlign: "left", padding: "6px 10px", color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700, whiteSpace: "nowrap", position: "sticky", left: 0, background: "#1a0a2e" }}>
                Player
              </th>
              {grid.columns.map((c) => (
                <th key={c.key} style={{ textAlign: "left", padding: "6px 10px", color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700, whiteSpace: "nowrap" }}>
                  {c.label}
                </th>
              ))}
            </tr>
            <tr style={{ borderBottom: "1px solid #3d1f5c" }}>
              <th style={{ textAlign: "left", padding: "4px 10px", color: "#6b4f99", fontWeight: 500, fontStyle: "italic", whiteSpace: "nowrap", position: "sticky", left: 0, background: "#1a0a2e" }}>
                Exiled
              </th>
              {grid.columns.map((c) => (
                <th key={c.key} style={{ textAlign: "left", padding: "4px 10px", color: "#ff3860", fontWeight: 500, fontStyle: "italic", whiteSpace: "nowrap" }}>
                  {(grid.exiledByColumn[c.key] || []).join(", ") || "—"}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.playerRows.map((r) => (
              <tr key={r.playerId} style={{ borderBottom: "1px solid #150a28" }}>
                <td style={{ padding: "6px 10px", whiteSpace: "nowrap", position: "sticky", left: 0, background: "#1a0a2e" }}>
                  <span style={{ color: "#f5f0ff", fontWeight: 700 }}>{r.name}</span>
                  {r.isWinner && <span style={{ marginLeft: 6 }}><Badge color="#00ff9d">Winner</Badge></span>}
                </td>
                {r.cells.map((cell, i) => (
                  <td key={i} style={{ padding: "6px 10px", color: cell ? "#f5f0ff" : "#6b4f99", whiteSpace: "nowrap" }}>
                    {cell || "—"}
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
