import HomeLink from "../components/HomeLink";
import { PATCH_NOTES } from "../lib/patchNotes";

export default function PatchNotesPage() {
  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 560, width: "100%", margin: "0 auto" }}>
        <div style={{ marginBottom: 20 }}><HomeLink /></div>
        <h1 style={{ fontSize: 20, marginBottom: 4 }}>📋 What's New</h1>
        <p style={{ color: "#6b4f99", fontSize: 12, marginBottom: 24 }}>Recent updates and fixes, most recent first.</p>

        {PATCH_NOTES.map((entry, i) => (
          <div key={i} style={{ marginBottom: 32 }}>
            <p style={{ color: "#ff2d95", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, margin: "0 0 4px" }}>{entry.date}</p>
            <h2 style={{ fontSize: 16, margin: "0 0 10px", color: "#f5f0ff" }}>{entry.title}</h2>
            <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 8 }}>
              {entry.items.map((item, j) => (
                <li key={j} style={{ color: "#a68fd6", fontSize: 13, lineHeight: 1.5 }}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

const pageStyle = {
  minHeight: "100vh",
  background: "linear-gradient(180deg, #05010f, #1a0a2e)",
  color: "#f5f0ff",
  fontFamily: "'Orbitron', 'Segoe UI', sans-serif",
  padding: 24,
  paddingTop: "max(24px, env(safe-area-inset-top))",
};
