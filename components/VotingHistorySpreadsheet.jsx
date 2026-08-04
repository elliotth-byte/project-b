import { Card, Btn } from "./ui";
import { buildVotingRows, rowsToCSV } from "../lib/votingSpreadsheet";

export default function VotingHistorySpreadsheet({ exileHistory, finaleState, players, gameName }) {
  const byId = {};
  players.forEach((p) => (byId[p.id] = p.display_name));

  const rows = buildVotingRows(exileHistory, finaleState, byId);
  if (rows.length === 0) return null;

  const download = () => {
    const csv = rowsToCSV(rows);
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
              {["Round", "Mode", "Voter", "Voted For", "Reason", "Chaos", "Nullified?", "Tie Broken For", "Result"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "6px 8px", color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700, whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #150a28" }}>
                <td style={{ padding: "6px 8px", color: "#f5f0ff", whiteSpace: "nowrap" }}>{r.context}</td>
                <td style={{ padding: "6px 8px", color: "#a68fd6", whiteSpace: "nowrap" }}>{r.mode}</td>
                <td style={{ padding: "6px 8px", color: "#f5f0ff", whiteSpace: "nowrap" }}>{r.voter}</td>
                <td style={{ padding: "6px 8px", color: "#f5f0ff", whiteSpace: "nowrap" }}>{r.target}</td>
                <td style={{ padding: "6px 8px", color: "#a68fd6", fontStyle: "italic", maxWidth: 220 }}>{r.reason}</td>
                <td style={{ padding: "6px 8px", color: "#a68fd6", whiteSpace: "nowrap" }}>{r.chaosHolder}</td>
                <td style={{ padding: "6px 8px", color: r.nullified ? "#ff3860" : "#6b4f99", whiteSpace: "nowrap" }}>{r.nullified}</td>
                <td style={{ padding: "6px 8px", color: "#a68fd6", whiteSpace: "nowrap" }}>{r.tieBreak}</td>
                <td style={{ padding: "6px 8px", color: r.exiled ? "#ff3860" : "#6b4f99", whiteSpace: "nowrap" }}>{r.exiled}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
