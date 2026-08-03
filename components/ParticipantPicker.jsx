import { DEFAULT_PARTICIPATION, computeParticipants } from "../lib/challengeParticipants";

const boxStyle = { background: "#0a1020", borderRadius: 8, padding: 10, marginBottom: 12 };
const rowStyle = { display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 8 };
const toggleLabel = { display: "flex", alignItems: "center", gap: 4, fontSize: 11.5, color: "#a09080", cursor: "pointer" };
const chip = (active) => ({
  fontSize: 11, padding: "3px 9px", borderRadius: 12, cursor: "pointer",
  background: active ? "rgba(201,168,76,0.15)" : "transparent",
  color: active ? "#c9a84c" : "#706050", border: `1px solid ${active ? "#c9a84c55" : "#253550"}`,
});

// Drop this inside a ChallengeSetupCard (it renders as `children`, above
// the Start button). Keep the config in the host component's own state
// and pass it to computeParticipants() inside start().
export default function ParticipantPicker({ alive, allPlayers, shieldedNames = [], returnedNames = [], value, onChange }) {
  const cfg = { ...DEFAULT_PARTICIPATION, ...value };
  const set = (patch) => onChange({ ...cfg, ...patch });

  const { participants, spectators } = computeParticipants(cfg, { alive, allPlayers, shieldedNames, returnedNames });

  const toggleManual = (name) => {
    const selected = cfg.manualSelected.includes(name)
      ? cfg.manualSelected.filter((n) => n !== name)
      : [...cfg.manualSelected, name];
    set({ manualSelected: selected });
  };

  return (
    <div style={boxStyle}>
      <div style={{ fontSize: 11, color: "#a09080", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
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
          {alive.length === 0 && <span style={{ fontSize: 11, color: "#706050", fontStyle: "italic" }}>No alive players.</span>}
        </div>
      )}

      <div style={rowStyle}>
        <label style={toggleLabel}>
          <input type="checkbox" checked={cfg.excludeShielded} onChange={(e) => set({ excludeShielded: e.target.checked })} />
          Exclude shielded players
        </label>
        <label style={toggleLabel}>
          <input type="checkbox" checked={cfg.includeEliminatedSpectators} onChange={(e) => set({ includeEliminatedSpectators: e.target.checked })} />
          Include eliminated players as spectators
        </label>
        <label style={toggleLabel}>
          <input type="checkbox" checked={cfg.includeReturned} onChange={(e) => set({ includeReturned: e.target.checked })} />
          Include returned players
        </label>
      </div>

      <div style={{ fontSize: 11.5, color: "#706050" }}>
        {participants.length} participant{participants.length === 1 ? "" : "s"}
        {spectators.length > 0 && <> · {spectators.length} spectator{spectators.length === 1 ? "" : "s"}</>}
      </div>
    </div>
  );
}
