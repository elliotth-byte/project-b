// ─── Reusable per-player status list ───
// Extracted from StereoTypesASideHost.jsx/StereoTypesRemixHost.jsx/
// StereoTypesOnBlastHost.jsx, which each had their own copy of this
// exact "name on the left, status on the right" row for showing who's
// submitted and who hasn't. Was host-only — players only ever saw a
// bare count ("3 of 6 submitted") — now shared so the player-side
// components (StereoTypesASidePlayer.jsx etc.) can show the same
// per-person list players themselves asked to see, without a second
// copy of this markup to keep in sync.
//
// statusFor(pid) => { label, done } rather than a single isDone
// boolean + fixed labels, because On Blast's own bidding phase has a
// real THIRD state (bid placed but not yet guessed) that a plain
// done/not-done boolean can't express — every simpler two-state caller
// (ranking/picking/guessing everywhere) just returns
// { label: "✓ Submitted", done: true } or { label: "Waiting...", done:
// false } and gets identical behavior to what each host component
// already had.
export default function StereoTypesWaitingList({ playerIds, players, statusFor }) {
  return (
    <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
      {(playerIds || []).map((pid) => {
        const p = (players || []).find((pl) => pl.id === pid);
        const { label, done } = statusFor(pid);
        return (
          <div key={pid} style={{ display: "flex", justifyContent: "space-between", background: "#0a0e18", borderRadius: 6, padding: "6px 10px" }}>
            <span style={{ color: "#f5eddc", fontSize: 13 }}>{p?.display_name || "Unknown player"}</span>
            <span style={{ color: done ? "#f4c430" : "#6b6558", fontSize: 11, fontWeight: 700 }}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}
