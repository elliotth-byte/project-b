import { Card } from "../ui";

export default function GameResultCard({ icon, title, valueLabel }) {
  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ fontSize: 28, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontSize: 12, letterSpacing: 4, textTransform: "uppercase", color: "#7a9a5c", marginBottom: 6 }}>{title}</div>
      {valueLabel && <div style={{ fontSize: 22, fontWeight: 700, color: "#c9a84c", fontFamily: "'Courier New', Courier, monospace" }}>{valueLabel}</div>}
      <p style={{ color: "#706050", fontSize: 12, marginTop: 10, fontStyle: "italic" }}>Waiting for everyone else to finish...</p>
    </Card>
  );
}
