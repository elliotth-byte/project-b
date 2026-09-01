// Small shared UI pieces, styled to match the original artifact's look.
// Pulled out so WordHost/WordPlayer need almost no changes from the original.

export function Btn({ children, onClick, variant = "primary", disabled = false, small = false, style = {} }) {
  const variants = {
    primary: { background: "linear-gradient(135deg, #c9a84c, #a5822f)", color: "#0c1425", border: "none" },
    ghost: { background: "transparent", color: "#a09080", border: "1px solid #253550" },
    danger: { background: "linear-gradient(135deg, #c45c3c, #9c3f26)", color: "#f0e6d3", border: "none" },
    success: { background: "linear-gradient(135deg, #7a9a5c, #5c7a42)", color: "#f0e6d3", border: "none" },
    slack: { background: "linear-gradient(135deg, #4a154b, #611f69)", color: "#fff", border: "none" },
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...variants[variant],
        padding: small ? "6px 12px" : "10px 18px",
        borderRadius: 8,
        fontSize: small ? 12 : 14,
        fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        fontFamily: "'Palatino Linotype', Palatino, Georgia, serif",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export function Card({ children, style = {}, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: "#0e1830",
        border: "1px solid #253550",
        borderRadius: 12,
        padding: 16,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function PausedBanner({ icon, title }) {
  return (
    <Card style={{ borderColor: "rgba(201,168,76,0.3)", textAlign: "center" }}>
      <div style={{ fontSize: 28, marginBottom: 6 }}>{icon}</div>
      <div style={{ color: "#c9a84c", fontWeight: 700 }}>{title} is paused</div>
      <div style={{ color: "#706050", fontSize: 12, marginTop: 4 }}>The host will resume shortly.</div>
    </Card>
  );
}

export function PauseResumeControls({ paused, onPause, onResume }) {
  return paused ? (
    <Btn variant="ghost" small onClick={onResume}>▶ Resume</Btn>
  ) : (
    <Btn variant="ghost" small onClick={onPause}>⏸ Pause</Btn>
  );
}

// A small pill/tag — used by Zombie for the round counter, reusable elsewhere.
export function Badge({ children, color = "#c9a84c" }) {
  const c = { "#c9a84c": [201, 168, 76], "#c45c3c": [196, 92, 60], "#d4a843": [212, 168, 67], "#7a9a5c": [122, 154, 92] };
  const rgb = c[color] || [201, 168, 76];
  return (
    <span style={{
      display: "inline-block", background: `rgba(${rgb},0.13)`, color, padding: "2px 10px",
      borderRadius: 20, fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase",
      border: `1px solid rgba(${rgb},0.27)`,
    }}>
      {children}
    </span>
  );
}

// A playing card face — used by Casino, reusable by anything else with cards.
export function CardFace({ c }) {
  return (
    <span style={{
      display: "inline-block", background: "#f0e6d3", color: ["♥", "♦"].includes(c.s) ? "#c0392b" : "#1a1a1a",
      borderRadius: 5, padding: "3px 6px", fontSize: 14, fontWeight: 700, margin: 2, minWidth: 20, textAlign: "center",
    }}>
      {c.r}{c.s}
    </span>
  );
}

// The generic "not started yet" card every mini-game host shows before
// clicking start — reusable across all of them.
export function ChallengeSetupCard({ icon, title, blurb, children, onStart, startLabel = "Start Challenge", disabled }) {
  return (
    <Card>
      <h3 style={{ color: "#f0e6d3", margin: "0 0 8px", fontSize: 14, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>{icon} {title} — Setup</h3>
      <p style={{ color: "#a09080", fontSize: 13, margin: "0 0 14px", fontStyle: "italic" }}>{blurb}</p>
      {children}
      <Btn onClick={onStart} disabled={disabled}>{startLabel}</Btn>
    </Card>
  );
}
