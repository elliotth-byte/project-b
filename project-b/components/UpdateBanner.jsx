import { useVersionCheck } from "../lib/versionCheck";

// ─── Update Banner ───
// A refresh is offered, never forced — reloading without warning could
// wipe out something someone's mid-typing (a chat message, a
// confessional) or drop them out of an in-progress mini-game. Shown at
// the top of both pages/play.jsx and pages/host.jsx.
export default function UpdateBanner() {
  const { updateAvailable } = useVersionCheck();
  if (!updateAvailable) return null;

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
      background: "rgba(255,45,149,0.1)", border: "1px solid rgba(255,45,149,0.35)",
      borderRadius: 8, padding: "8px 12px", marginBottom: 14, fontSize: 12,
    }}>
      <span style={{ color: "#f5f0ff" }}>🔄 A new version is available.</span>
      <button
        onClick={() => window.location.reload()}
        style={{
          background: "linear-gradient(135deg, #ff2d95, #b829ff)", color: "#05010f", border: "none",
          borderRadius: 6, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0,
        }}
      >
        Refresh
      </button>
    </div>
  );
}
