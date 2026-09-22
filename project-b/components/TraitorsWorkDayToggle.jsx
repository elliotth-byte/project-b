import { useState, useEffect } from "react";
import { Card } from "./traitorsUi";
import { subscribeWorkDayModeEnabled, setWorkDayModeEnabled } from "../lib/traitorsWorkDayWindow";

// ─── Work-Day Mode Toggle (host) ───
// See lib/traitorsWorkDayWindow.js for the actual window definition.
// Off by default for every season — this is a real, sometimes-
// disruptive constraint (missions, murders, and voting all become
// unavailable outside the window), not something that should apply
// unless a host deliberately turns it on for a season actually meant
// to run like a business-hours workplace game.
export default function TraitorsWorkDayToggle({ gameId }) {
  const [enabled, setEnabled] = useState(null);

  useEffect(() => subscribeWorkDayModeEnabled(gameId, setEnabled), [gameId]);

  if (enabled === null) return null;

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h3 style={{ color: "#f0e6d3", margin: "0 0 4px", fontSize: 14 }}>⏰ Work-Day Mode</h3>
          <p style={{ color: "#7a6a52", fontSize: 11, margin: 0 }}>
            Weekdays only, 8am ET to 6pm PT — missions, murders, and voting pause outside that window. Confessionals stay open regardless.
          </p>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", flexShrink: 0, marginLeft: 12 }}>
          <input type="checkbox" checked={enabled} onChange={(e) => setWorkDayModeEnabled(gameId, e.target.checked)} />
          <span style={{ fontSize: 12, color: enabled ? "#c9a84c" : "#7a6a52" }}>{enabled ? "On" : "Off"}</span>
        </label>
      </div>
    </Card>
  );
}
