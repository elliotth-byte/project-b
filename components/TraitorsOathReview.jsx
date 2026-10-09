import { Card } from "./traitorsUi";
import { OATH_ITEMS, OathIntro } from "./TraitorsOathGate";

// ─── The Traitors' Oath: Help-tab review ───
// Read-only reprint of what a player already agreed to in
// TraitorsOathGate.jsx (the one-time signing gate, blocking, shown
// before a player's first entry into the game). This is just for
// looking back at it afterward — no checkboxes, no submit, nothing to
// do here. Shares OATH_ITEMS/OathIntro with that file so the actual
// agreement text can't drift between the two copies.
export default function TraitorsOathReview({ player }) {
  return (
    <Card>
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 28, marginBottom: 6 }}>🏰</div>
        <h2 style={{ color: "#f0e6d3", margin: "0 0 2px", fontSize: 20, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>
          The Traitors
        </h2>
        <p style={{ color: "#a09080", fontSize: 13, margin: 0, fontStyle: "italic" }}>Rules, Secrets &amp; Solemn Promises</p>
      </div>

      <div style={{
        maxHeight: 280, overflowY: "auto", padding: "4px 14px", marginBottom: 16,
        background: "#0a1020", border: "1px solid #253550", borderRadius: 10,
        color: "#a09080", fontSize: 13, lineHeight: 1.6,
      }}>
        <OathIntro />
      </div>

      <h3 style={{ color: "#f0e6d3", margin: "0 0 4px", fontSize: 16, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif", textAlign: "center" }}>
        The Traitors' Oath
      </h3>
      <p style={{ color: "#706050", fontSize: 12, fontStyle: "italic", textAlign: "center", margin: "0 0 14px" }}>
        You already signed this, {player?.realName || player?.name || "friend"} — here it is again for reference.
      </p>

      <div style={{ display: "grid", gap: 10 }}>
        {OATH_ITEMS.map((text, i) => (
          <div
            key={i}
            style={{
              display: "flex", gap: 10, alignItems: "flex-start",
              background: "rgba(122,154,92,0.1)", border: "1px solid #7a9a5c",
              borderRadius: 8, padding: "10px 12px",
            }}
          >
            <span style={{ marginTop: 2, fontSize: 14, color: "#7a9a5c", flexShrink: 0 }}>✓</span>
            <span style={{ fontSize: 13, color: "#f0e6d3", lineHeight: 1.5 }}>{text}</span>
          </div>
        ))}
      </div>

      <p style={{ textAlign: "center", color: "#706050", fontSize: 11, fontStyle: "italic", margin: "16px 0 0" }}>
        Enter freely. Trust carefully. Depart silently.
        <br />
        The oath is a game confidentiality and participation agreement, not a legal NDA.
      </p>
    </Card>
  );
}
