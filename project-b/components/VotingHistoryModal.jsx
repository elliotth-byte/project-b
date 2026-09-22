import VotingHistorySpreadsheet from "./VotingHistorySpreadsheet";

// ─── Full-screen overlay for the Voting History sheet ───
// VotingHistorySpreadsheet already has its own working horizontal
// scroll and sticky first column (see that file) — the actual problem
// is just that both render sites (HistoryTab.jsx for the host,
// CeremonyPlayer.jsx for players) sit inside a page-level container
// capped at 640px / 400px respectively (pages/host.jsx, pages/play.jsx),
// which squeezes a many-round grid down to almost nothing before its
// own scroll ever gets a chance to matter. This renders the exact same
// component in a fixed, full-viewport overlay instead — same modal
// pattern as ChatPanel.jsx's ReportModal (dark backdrop, click-outside
// or ✕ to close) — so the grid actually gets the full screen width to
// work with.
export default function VotingHistoryModal({ open, onClose, ...spreadsheetProps }) {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(5,1,15,0.85)", zIndex: 300,
        display: "flex", flexDirection: "column", padding: "16px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", maxWidth: "100%" }}
      >
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8, flexShrink: 0 }}>
          <button
            onClick={onClose}
            style={{
              background: "#150a28", border: "1px solid #3d1f5c", borderRadius: 8,
              color: "#f5f0ff", fontSize: 20, lineHeight: 1, padding: "6px 14px", cursor: "pointer",
            }}
            aria-label="Close full-screen voting history"
          >
            ✕
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
          <VotingHistorySpreadsheet {...spreadsheetProps} />
        </div>
      </div>
    </div>
  );
}
