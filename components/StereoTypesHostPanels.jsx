import { useState } from "react";
import { Card, Btn } from "./ui";
import { supabase } from "../lib/supabaseClient";
import Boombox from "./Boombox";

// ─── Stereo Types — host console (Phase 2) ───
// Still "plumbing before rounds" scope (see this file's own Phase 1
// history) — Phase 2 just adds the real boombox graphic per roster row
// instead of a bare name/status line. A player who hasn't gone through
// StereoTypesIdentityPicker.jsx yet has no color set (p.color is null),
// which Boombox.jsx already renders as a real-looking boombox in the
// theme's own yellow rather than a broken/blank state — nothing special
// needed here for that case. approvePlayer is the same plain
// players-table update AdminHost.jsx/TraitorsAdminHost.jsx each already
// do — nothing shared to reuse there, just the same one-liner a third
// time.
export default function StereoTypesHostPanels({ gameId, players, adminExtra }) {
  const [busyId, setBusyId] = useState(null);
  const approvedPlayers = players.filter((p) => p.approved);
  const pendingPlayers = players.filter((p) => !p.approved);

  const approvePlayer = async (p) => {
    setBusyId(p.id);
    await supabase.from("players").update({ approved: true }).eq("id", p.id);
    setBusyId(null);
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Card style={{ borderColor: "#f4c430" }}>
        <h3 style={{ color: "#f4c430", margin: "0 0 6px", fontSize: 15, fontFamily: "'Anton', 'Arial Narrow', sans-serif", letterSpacing: 0.5 }}>
          📻 STEREO TYPES
        </h3>
        <p style={{ color: "#c9b98a", fontSize: 13, margin: 0, fontStyle: "italic" }}>
          A Side, The Remix, and On Blast are still being built — for now
          this just gets players into the room. Share the join code
          below and approve players as they show up; the rounds
          themselves land here in a later update.
        </p>
      </Card>

      <Card>
        <div style={{ fontSize: 11, color: "#c9b98a", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
          🎧 Roster ({approvedPlayers.length} approved{pendingPlayers.length > 0 ? `, ${pendingPlayers.length} pending` : ""})
        </div>
        {players.length === 0 ? (
          <p style={{ color: "#6b6558", fontSize: 12, fontStyle: "italic", margin: 0 }}>Nobody's joined yet — share the join code.</p>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {players.map((p) => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0a0e18", borderRadius: 6, padding: "6px 10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Boombox color={p.color} stickerId={p.equipped_sticker} size={56} />
                  <span style={{ color: "#f5eddc", fontSize: 13 }}>{p.display_name}</span>
                </div>
                {p.approved ? (
                  <span style={{ color: "#f4c430", fontSize: 11, fontWeight: 700 }}>✓ Approved</span>
                ) : (
                  <Btn small onClick={() => approvePlayer(p)} disabled={busyId === p.id}>
                    {busyId === p.id ? "..." : "Approve"}
                  </Btn>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {adminExtra}
    </div>
  );
}
