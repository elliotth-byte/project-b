import { useState } from "react";
import { Card, Btn, Badge } from "./traitorsUi";
import { deleteArchivedChallenge } from "../lib/challengeArchive";

export default function ChallengeArchiveList({ gameId, archive, compact = false }) {
  const [open, setOpen] = useState({});
  const [expanded, setExpanded] = useState(!compact);

  const toggle = (id) => setOpen((o) => ({ ...o, [id]: !o[id] }));
  const remove = (id) => {
    if (window.confirm("Delete this archived result? This can't be undone.")) {
      deleteArchivedChallenge(gameId, id);
    }
  };

  const sorted = [...archive].sort((a, b) => b.archivedAt - a.archivedAt);

  return (
    <Card style={{ borderColor: "rgba(201,168,76,0.3)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: expanded ? 8 : 0 }}>
        <h3 style={{ color: "#f0e6d3", margin: 0, fontSize: 14, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>
          📦 Challenge Archive ({archive.length})
        </h3>
        {compact && <Btn small variant="ghost" onClick={() => setExpanded((v) => !v)}>{expanded ? "Collapse" : "Expand"}</Btn>}
      </div>
      {expanded && (
        <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
          {sorted.map((r) => (
            <div key={r.id} style={{ background: "#0a1020", border: "1px solid #253550", borderRadius: 8, padding: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#f0e6d3" }}>
                  {r.challengeName}{r.round ? ` · Round ${r.round}` : ""}
                </span>
                <span style={{ fontSize: 11, color: "#706050" }}>{new Date(r.archivedAt).toLocaleString()}</span>
              </div>
              {(Array.isArray(r.winner) ? r.winner.length > 0 : !!r.winner) && (
                <div style={{ fontSize: 12, color: "#c9a84c", marginTop: 4 }}>
                  🏆 {Array.isArray(r.winner) ? r.winner.join(", ") : r.winner}
                </div>
              )}
              {r.resultSummary && <p style={{ fontSize: 12, color: "#a09080", margin: "4px 0 0" }}>{r.resultSummary}</p>}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                {r.participants?.length > 0 && <Badge color="#4a7ac4">{r.participants.length} participants</Badge>}
                {r.spectators?.length > 0 && <Badge color="#706050">{r.spectators.length} spectators</Badge>}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <Btn small variant="ghost" onClick={() => toggle(r.id)}>{open[r.id] ? "Hide details" : "View details"}</Btn>
                <Btn small variant="ghost" onClick={() => remove(r.id)}>Delete</Btn>
              </div>
              {open[r.id] && (
                <div style={{ marginTop: 8, fontSize: 11, color: "#706050" }}>
                  {r.participants?.length > 0 && <div style={{ marginBottom: 4 }}><strong style={{ color: "#a09080" }}>Participants:</strong> {r.participants.join(", ")}</div>}
                  {r.spectators?.length > 0 && <div style={{ marginBottom: 4 }}><strong style={{ color: "#a09080" }}>Spectators:</strong> {r.spectators.join(", ")}</div>}
                  {r.startedAt && <div style={{ marginBottom: 4 }}><strong style={{ color: "#a09080" }}>Started:</strong> {new Date(r.startedAt).toLocaleString()}</div>}
                  {r.finalState && (
                    <pre style={{ background: "#0e1830", borderRadius: 6, padding: 8, overflowX: "auto", fontSize: 10, margin: "4px 0 0", color: "#a09080" }}>
                      {JSON.stringify(r.finalState, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
