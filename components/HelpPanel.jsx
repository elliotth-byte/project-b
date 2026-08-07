import { Card } from "./ui";

const RULES_URL = "https://docs.google.com/document/d/1F8Hqc8GatMDt7t6qfDTDl0w2oR_Avi1WN_0apSH2PfY/edit?tab=t.0";

// ─── Player help ───
// A link straight to the rules doc, and how to get this page onto an
// iPhone/iPad home screen as an app-like icon (Safari doesn't offer this
// automatically the way installing a native app would — it's a manual
// few taps, easy to miss if nobody points it out).
export default function HelpPanel() {
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <Card style={{ textAlign: "center" }}>
        <a
          href={RULES_URL} target="_blank" rel="noopener noreferrer"
          style={{
            display: "inline-block", background: "linear-gradient(135deg, #ff2d95, #b829ff)",
            color: "#05010f", borderRadius: 8, padding: "10px 20px", fontSize: 14, fontWeight: 700,
            textDecoration: "none",
          }}
        >
          📖 Read the Rules
        </a>
      </Card>

      <Card>
        <div style={{ fontSize: 12, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
          📱 Add to Home Screen (iPhone/iPad)
        </div>
        <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: "#f5f0ff", lineHeight: 1.8 }}>
          <li>Open this page in <strong>Safari</strong> (not another app's built-in browser).</li>
          <li>Tap the <strong>Share</strong> icon (square with an arrow pointing up) in the toolbar.</li>
          <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
          <li>Tap <strong>Add</strong> in the top corner.</li>
        </ol>
        <p style={{ fontSize: 12, color: "#6b4f99", marginTop: 10, marginBottom: 0, fontStyle: "italic" }}>
          You'll get an icon that opens straight to the game — no need to keep finding the link.
        </p>
      </Card>
    </div>
  );
}
