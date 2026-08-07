import { DEFAULT_PARTICIPATION, computeParticipants } from "../lib/challengeParticipants";

const boxStyle = { background: "#0d0618", borderRadius: 8, padding: 10, marginBottom: 12 };
const rowStyle = { display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 8 };
const chip = (active) => ({
  fontSize: 11, padding: "3px 9px", borderRadius: 12, cursor: "pointer",
  background: active ? "rgba(255,45,149,0.15)" : "transparent",
  color: active ? "#ff2d95" : "#6b4f99", border: `1px solid ${active ? "#ff2d9555" : "#3d1f5c"}`,
});

// Drop this inside a ChallengeSetupCard (it renders as `children`, above
// the Start button). Keep the config in the host component's own state
// and pass it to computeParticipants() inside start(). Exiled players
// aren't handled here at all — see lib/reentryData.js's per-challenge
// opt-in, which every eligible exiled player decides for themselves.
export default function ParticipantPicker({ alive, value, onChange }) {
  const cfg = { ...DEFAULT_PARTICIPATION, ...value };
  const set = (patch) => onChange({ ...cfg, ...patch });

  const { participants, spectators } = computeParticipants(cfg, { alive });

  const toggleManual = (name) => {
    const selected = cfg.manualSelected.includes(name)
      ? cfg.manualSelected.filter((n) => n !== name)
      : [...cfg.manualSelected, name];
    set({ manualSelected: selected });
  };

  return (
    <div style={boxStyle}>
      <div style={{ fontSize: 11, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
        Who's playing?
      </div>

      <div style={rowStyle}>
        <button type="button" style={chip(cfg.mode === "all")} onClick={() => set({ mode: "all" })}>All alive players</button>
        <button type="button" style={chip(cfg.mode === "manual")} onClick={() => set({ mode: "manual" })}>Manually select</button>
      </div>

      {cfg.mode === "manual" && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          {alive.map((p) => (
            <button key={p.id} type="button" style={chip(cfg.manualSelected.includes(p.name))} onClick={() => toggleManual(p.name)}>
              {p.name}
            </button>
          ))}
          {alive.length === 0 && <span style={{ fontSize: 11, color: "#6b4f99", fontStyle: "italic" }}>No alive players.</span>}
        </div>
      )}

      <div style={{ fontSize: 11.5, color: "#6b4f99" }}>
        {participants.length} participant{participants.length === 1 ? "" : "s"}
        {spectators.length > 0 && <> · {spectators.length} spectator{spectators.length === 1 ? "" : "s"}</>}
      </div>
    </div>
  );
}
