// Shared UI pieces — 80s arcade / neon aesthetic. Centralizing the look
// here means most of the app inherits it just by using Btn/Card/Badge,
// rather than every screen needing its own neon styling.

export const FONT_DISPLAY = "'Press Start 2P', 'Orbitron', monospace";
export const FONT_UI = "'Orbitron', 'Segoe UI', sans-serif";

export function Btn({ children, onClick, variant = "primary", disabled = false, small = false, style = {} }) {
  const variants = {
    primary: { background: "linear-gradient(135deg, #ff2d95, #b829ff)", color: "#05010f", border: "2px solid #ff8ac2", boxShadow: "0 0 16px #ff2d9588" },
    ghost: { background: "transparent", color: "#a68fd6", border: "2px solid #3d1f5c", boxShadow: "none" },
    danger: { background: "linear-gradient(135deg, #ff3860, #c9184a)", color: "#fff", border: "2px solid #ff87a3", boxShadow: "0 0 16px #ff386088" },
    success: { background: "linear-gradient(135deg, #00ff9d, #00b377)", color: "#05010f", border: "2px solid #7dffce", boxShadow: "0 0 16px #00ff9d77" },
    slack: { background: "linear-gradient(135deg, #00d9ff, #0099cc)", color: "#05010f", border: "2px solid #7fe9ff", boxShadow: "0 0 16px #00d9ff77" },
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...variants[variant],
        padding: small ? "7px 14px" : "12px 22px",
        borderRadius: 10,
        fontSize: small ? 11 : 13,
        fontWeight: 800,
        textTransform: "uppercase",
        letterSpacing: 0.8,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        fontFamily: FONT_UI,
        transition: "transform 0.1s, box-shadow 0.15s",
        ...style,
      }}
      onMouseDown={(e) => { if (!disabled) e.currentTarget.style.transform = "scale(0.96)"; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
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
        background: "linear-gradient(160deg, #150a28 0%, #0d0618 100%)",
        border: "2px solid #3d1f5c",
        borderRadius: 14,
        padding: 16,
        boxShadow: "0 0 0 1px rgba(255,45,149,0.08), 0 4px 24px rgba(184,41,255,0.08)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function PausedBanner({ icon, title }) {
  return (
    <Card style={{ borderColor: "#ff2d95", textAlign: "center" }}>
      <div style={{ fontSize: 28, marginBottom: 6 }}>{icon}</div>
      <div style={{ color: "#ff2d95", fontWeight: 800, textTransform: "uppercase", letterSpacing: 1 }}>{title} is paused</div>
      <div style={{ color: "#6b4f99", fontSize: 12, marginTop: 4 }}>The host will resume shortly.</div>
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

// A small pill/tag, used throughout for round numbers, statuses, etc.
export function Badge({ children, color = "#ff2d95" }) {
  const c = {
    "#ff2d95": [255, 45, 149], "#c9a84c": [255, 45, 149], // legacy gold callers now render pink
    "#ff3860": [255, 56, 96], "#c45c3c": [255, 56, 96], // legacy red
    "#00ff9d": [0, 255, 157], "#7a9a5c": [0, 255, 157], // legacy green
    "#00d9ff": [0, 217, 255], "#d4a843": [0, 217, 255],
    "#6b4f99": [107, 79, 153],
  };
  const rgb = c[color] || [255, 45, 149];
  return (
    <span style={{
      display: "inline-block", background: `rgba(${rgb},0.16)`, color: `rgb(${rgb})`, padding: "3px 11px",
      borderRadius: 20, fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase",
      border: `1px solid rgba(${rgb},0.55)`, fontFamily: "'Orbitron', sans-serif",
      textShadow: `0 0 6px rgba(${rgb},0.6)`,
    }}>
      {children}
    </span>
  );
}

// A per-player Power of Chaos draw-status indicator for the host's voter
// list rows (see ExileVoteHost.jsx / FinaleHost.jsx). Deliberately NOT
// just a colored emoji — most browsers render emoji with their own
// built-in color and ignore any CSS `color` set on them, so a colored 🃏
// alone renders identically regardless of status. The color instead
// lives on a background/border pill around the icon, which does respond
// to CSS, with the icon just sitting inside as a static glyph.
export function ChaosStatusBadge({ holderId, playerId, drawPicks }) {
  const isHolder = holderId === playerId;
  const hasPicked = drawPicks?.[playerId] !== undefined;
  const color = isHolder ? "#00ff9d" : hasPicked ? "#ff3860" : "#3d1f5c";
  const title = isHolder ? "Won the Power of Chaos" : hasPicked ? "Picked, but didn't win it" : "Hasn't made their Power of Chaos pick yet";
  return (
    <span
      title={title}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
        background: `${color}2e`, border: `2px solid ${color}`,
        fontSize: 13, lineHeight: 1,
      }}
    >
      🃏
    </span>
  );
}

// A duration editor that stores/returns whole seconds but lets the host
// think in days/hours/minutes instead of doing the math themselves —
// used anywhere a round-length setting is configured (Admin's default
// phase lengths, a per-challenge override).
export function DurationInput({ valueSec, onChange, min = 60 }) {
  const total = Math.max(min, valueSec || 0);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.round((total % 3600) / 60);

  const update = (d, h, m) => {
    const sec = Math.max(min, d * 86400 + h * 3600 + m * 60);
    onChange(sec);
  };

  const boxStyle = {
    width: 52, background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 6,
    padding: "5px 6px", color: "#f5f0ff", fontSize: 13, textAlign: "center",
  };
  const labelStyle = { fontSize: 11, color: "#a68fd6" };

  return (
    <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
      <input type="number" min={0} value={days} onChange={(e) => update(Number(e.target.value) || 0, hours, minutes)} style={boxStyle} />
      <span style={labelStyle}>d</span>
      <input type="number" min={0} max={23} value={hours} onChange={(e) => update(days, Math.max(0, Math.min(23, Number(e.target.value) || 0)), minutes)} style={boxStyle} />
      <span style={labelStyle}>h</span>
      <input type="number" min={0} max={59} value={minutes} onChange={(e) => update(days, hours, Math.max(0, Math.min(59, Number(e.target.value) || 0)))} style={boxStyle} />
      <span style={labelStyle}>m</span>
    </div>
  );
}

// A playing card face — used by the Power of Chaos card-fan flavor moment.
export function CardFace({ c }) {
  return (
    <span style={{
      display: "inline-block", background: "#f5f0ff", color: ["♥", "♦"].includes(c.s) ? "#ff3860" : "#150a28",
      borderRadius: 5, padding: "3px 6px", fontSize: 14, fontWeight: 700, margin: 2, minWidth: 20, textAlign: "center",
    }}>
      {c.r}{c.s}
    </span>
  );
}

// The generic "not started yet" card a challenge setup screen can show
// before clicking start.
export function ChallengeSetupCard({ icon, title, blurb, children, onStart, startLabel = "Start Challenge", disabled }) {
  return (
    <Card>
      <h3 style={{ color: "#f5f0ff", margin: "0 0 8px", fontSize: 14, fontFamily: FONT_UI, textTransform: "uppercase", letterSpacing: 1 }}>{icon} {title} — Setup</h3>
      <p style={{ color: "#a68fd6", fontSize: 13, margin: "0 0 14px", fontStyle: "italic" }}>{blurb}</p>
      {children}
      <Btn onClick={onStart} disabled={disabled}>{startLabel}</Btn>
    </Card>
  );
}
