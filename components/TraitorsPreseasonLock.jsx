import { Card } from "./traitorsUi";

// ─── Traitors: Pre-Season Lock ───
// See pages/play.jsx's own preseasonLocked variable for exactly where
// this sits in the join flow: AFTER identity + the Oath gate (so
// sign-ups starting days ahead of the actual season can still get all
// of that done now), but replacing BOTH the normal "waiting for host
// approval" screen and the live game for every Traitors player —
// approved or not — for as long as TraitorsAdminHost.jsx's "Pre-Season
// Lock" toggle stays on.
export default function TraitorsPreseasonLock({ message }) {
  return (
    <Card style={{ textAlign: "center", padding: "40px 20px" }}>
      <div style={{ fontSize: 36, marginBottom: 10 }}>🏰</div>
      <h2 style={{ color: "#f0e6d3", margin: 0, fontSize: 18, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>
        {message || "The Villa opens soon... see you Friday."}
      </h2>
    </Card>
  );
}
