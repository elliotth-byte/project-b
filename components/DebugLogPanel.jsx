import { useState, useEffect } from "react";
import { Card, Btn } from "./ui";
import { supabase } from "../lib/supabaseClient";

// ─── Debug Log — host side ───
// Read + export for game_debug_log (see sql/add-debug-log.sql and
// lib/debugLog.js for the full reasoning). Straight RLS-gated SELECT,
// no API route needed — the table's own "host can read own game's
// debug log" policy already does the access check. This is the piece
// that actually closes the loop a host reporting an issue needs: real
// timestamps and trigger sources to hand over, instead of a
// description of what it looked like from the outside.
export default function DebugLogPanel({ gameId }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!gameId) return;
    let cancelled = false;
    (async () => {
      const { data, error: err } = await supabase
        .from("game_debug_log")
        .select("created_at, round, phase, event, source, detail")
        .eq("game_id", gameId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (cancelled) return;
      if (err) setError(err.message);
      else setRows(data || []);
    })();
    return () => { cancelled = true; };
  }, [gameId]);

  const download = () => {
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `panopticon-debug-log-${gameId}-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (error) return <Card><p style={{ color: "#ff2d95", fontSize: 12 }}>Couldn't load the debug log: {error}</p></Card>;
  if (rows === null) return <Card><p style={{ color: "#6b4f99", fontStyle: "italic" }}>Loading...</p></Card>;

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <p style={{ color: "#6b4f99", fontSize: 11, margin: 0 }}>
          Last {rows.length} noteworthy events (phase advances, blocked-but-unusual states, and inactivity strikes) — routine every-few-seconds polling isn't logged. If you're reporting an issue, download this and attach it.
        </p>
        <Btn small onClick={download} disabled={rows.length === 0}>⬇ Download JSON</Btn>
      </div>
      {rows.length === 0 ? (
        <Card><p style={{ color: "#6b4f99", fontStyle: "italic", margin: 0 }}>Nothing logged yet for this season.</p></Card>
      ) : (
        <div style={{ display: "grid", gap: 6, maxHeight: 420, overflowY: "auto" }}>
          {rows.map((r, i) => (
            <Card key={i} style={{ padding: "8px 12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: r.event === "phase_advance" ? "#00ff9d" : r.event === "inactivity_strike" ? "#ffb703" : "#a68fd6" }}>
                  {r.event}{r.round != null ? ` — Round ${r.round}` : ""}{r.phase ? ` (${r.phase})` : ""}
                </span>
                <span style={{ fontSize: 10, color: "#6b4f99" }}>{new Date(r.created_at).toLocaleString()}</span>
              </div>
              <div style={{ fontSize: 10, color: "#a68fd6" }}>source: {r.source}</div>
              <pre style={{ fontSize: 10, color: "#e0d4ff", margin: "4px 0 0", whiteSpace: "pre-wrap", overflowWrap: "break-word" }}>
                {JSON.stringify(r.detail)}
              </pre>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
