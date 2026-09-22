import { useState, useEffect } from "react";
import { Btn, Card, Badge } from "./traitorsUi";
import {
  subscribeSchedule, setSchedule, loadTemplate26Player, clearSchedule,
} from "../lib/traitorsSchedule";

// ─── Schedule Builder (host) ───
// See lib/traitorsSchedule.js's own header for the full reasoning on
// why this is a genuinely ordered, editable list rather than a fixed
// repeating cycle. Reordering is plain up/down buttons, not
// drag-and-drop — simpler to get right, and this is a list a host
// edits occasionally while planning a season, not something that needs
// snappy drag interactions.
const EXISTING_MISSION_KEYS = [
  { key: "words", label: "Word Scramble" },
  { key: "casino", label: "Casino" },
  { key: "hotpotato", label: "Hot Potato" },
  { key: "zombie", label: "Zombies" },
  { key: "piggy", label: "Piggy Bank" },
  { key: "masquerade", label: "Masquerade" },
  { key: "attackdefend", label: "Attack/Defend" },
  { key: "voodoo", label: "Voodoo" },
  { key: "maze3d", label: "Maze" },
  { key: "coffin", label: "Coffin Slide" },
  { key: "icebreaker", label: "Icebreakers" },
];

const EVENT_OPTIONS = [
  { key: "mission", label: "Mission" },
  { key: "roundtable", label: "Roundtable" },
  { key: "murder", label: "Murder" },
  { key: "pandoras-box", label: "Pandora's Box" },
  { key: "traitor-selection", label: "Traitor Selection" },
  { key: "instant-murder", label: "Instant Murder" },
  { key: "endgame", label: "Endgame" },
];

function emptyDay(dayIndex) {
  return { dayIndex, label: "", missionKey: null, missionLabel: null, events: [], murderCount: 0, pandorasBoxNumber: null, notes: "" };
}

export default function TraitorsScheduleBuilder({ gameId }) {
  const [days, setDays] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null); // index into days, or "new"
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeSchedule(gameId, (v) => { setDays(v); setLoaded(true); });
    return unsubscribe;
  }, [gameId]);

  const startEdit = (index) => {
    setEditingIndex(index);
    setDraft(index === "new" ? emptyDay(days.length + 1) : { ...days[index] });
  };

  const saveEdit = async () => {
    setBusy(true);
    const next = editingIndex === "new" ? [...days, draft] : days.map((d, i) => (i === editingIndex ? draft : d));
    await setSchedule(gameId, next);
    setBusy(false);
    setEditingIndex(null);
    setDraft(null);
  };

  const deleteDay = async (index) => {
    if (!window.confirm(`Delete "${days[index].label || `Day ${days[index].dayIndex}`}"?`)) return;
    setBusy(true);
    await setSchedule(gameId, days.filter((_, i) => i !== index));
    setBusy(false);
  };

  const moveDay = async (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= days.length) return;
    const next = [...days];
    [next[index], next[target]] = [next[target], next[index]];
    setBusy(true);
    await setSchedule(gameId, next);
    setBusy(false);
  };

  const applyTemplate = async () => {
    if (days.length > 0 && !window.confirm("This replaces the current schedule with the 26-player, 4-week template. Continue?")) return;
    setBusy(true);
    await loadTemplate26Player(gameId);
    setBusy(false);
  };

  const clearAll = async () => {
    if (!window.confirm("Clear the entire schedule? This can't be undone.")) return;
    setBusy(true);
    await clearSchedule(gameId);
    setBusy(false);
  };

  const toggleEvent = (eventKey) => {
    setDraft((d) => ({
      ...d,
      events: d.events.includes(eventKey) ? d.events.filter((e) => e !== eventKey) : [...d.events, eventKey],
    }));
  };

  if (!loaded) return <Card><p style={{ color: "#7a6a52", fontStyle: "italic" }}>Loading...</p></Card>;

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h3 style={{ color: "#f0e6d3", margin: 0, fontSize: 15 }}>📅 Schedule</h3>
        <div style={{ display: "flex", gap: 6 }}>
          <Btn small variant="ghost" onClick={applyTemplate} disabled={busy}>Load 26-Player Template</Btn>
          {days.length > 0 && <Btn small variant="ghost" onClick={clearAll} disabled={busy}>Clear</Btn>}
        </div>
      </div>

      {days.length === 0 && editingIndex !== "new" && (
        <p style={{ color: "#7a6a52", fontSize: 12, fontStyle: "italic", margin: "0 0 10px" }}>
          No schedule set yet — load the template above, or add days one at a time below.
        </p>
      )}

      <div style={{ display: "grid", gap: 8, marginBottom: 10 }}>
        {days.map((d, i) => (
          <div key={i} style={{ background: "#0a1020", border: "1px solid #253550", borderRadius: 8, padding: "8px 12px" }}>
            {editingIndex === i ? (
              <DayEditor draft={draft} setDraft={setDraft} toggleEvent={toggleEvent} onSave={saveEdit} onCancel={() => setEditingIndex(null)} busy={busy} />
            ) : (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#f0e6d3" }}>Day {d.dayIndex} — {d.label || "(untitled)"}</div>
                  <div style={{ fontSize: 10, color: "#7a6a52", marginTop: 2 }}>
                    {d.missionLabel && <span>{d.missionLabel}{!d.missionKey && " (no mission built yet)"} · </span>}
                    {d.events.join(", ") || "no events"}
                    {d.murderCount > 1 && ` · ${d.murderCount}x murder`}
                    {d.pandorasBoxNumber && ` · Pandora's Box ${d.pandorasBoxNumber}`}
                  </div>
                  {d.notes && <div style={{ fontSize: 10, color: "#7a6a52", fontStyle: "italic", marginTop: 2 }}>{d.notes}</div>}
                </div>
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  <button onClick={() => moveDay(i, -1)} disabled={i === 0 || busy} style={arrowBtnStyle}>↑</button>
                  <button onClick={() => moveDay(i, 1)} disabled={i === days.length - 1 || busy} style={arrowBtnStyle}>↓</button>
                  <Btn small variant="ghost" onClick={() => startEdit(i)} disabled={busy}>Edit</Btn>
                  <Btn small variant="ghost" onClick={() => deleteDay(i)} disabled={busy}>Delete</Btn>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {editingIndex === "new" ? (
        <div style={{ background: "#0a1020", border: "1px solid #253550", borderRadius: 8, padding: "8px 12px" }}>
          <DayEditor draft={draft} setDraft={setDraft} toggleEvent={toggleEvent} onSave={saveEdit} onCancel={() => setEditingIndex(null)} busy={busy} />
        </div>
      ) : (
        <Btn small variant="ghost" onClick={() => startEdit("new")} disabled={busy}>+ Add Day</Btn>
      )}
    </Card>
  );
}

function DayEditor({ draft, setDraft, toggleEvent, onSave, onCancel, busy }) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <input
        value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })}
        placeholder="Day label (e.g. Hot Potato + Pandora's Box 1)"
        style={inputStyle}
      />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <select
          value={draft.missionKey || ""}
          onChange={(e) => {
            const key = e.target.value || null;
            const found = EXISTING_MISSION_KEYS.find((m) => m.key === key);
            setDraft({ ...draft, missionKey: key, missionLabel: found ? found.label : draft.missionLabel });
          }}
          style={inputStyle}
        >
          <option value="">No mission</option>
          {EXISTING_MISSION_KEYS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
        <input
          value={draft.missionLabel || ""} onChange={(e) => setDraft({ ...draft, missionLabel: e.target.value || null })}
          placeholder="Mission name shown to host (for missions not built yet)"
          style={{ ...inputStyle, flex: 1 }}
        />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {EVENT_OPTIONS.map((ev) => (
          <button
            key={ev.key} onClick={() => toggleEvent(ev.key)}
            style={{
              padding: "4px 10px", borderRadius: 12, fontSize: 11, cursor: "pointer",
              background: draft.events.includes(ev.key) ? "rgba(201,168,76,0.2)" : "transparent",
              border: `1px solid ${draft.events.includes(ev.key) ? "#c9a84c" : "#253550"}`,
              color: draft.events.includes(ev.key) ? "#c9a84c" : "#7a6a52",
            }}
          >
            {ev.label}
          </button>
        ))}
      </div>
      {draft.events.includes("murder") && (
        <label style={{ fontSize: 11, color: "#7a6a52", display: "flex", alignItems: "center", gap: 6 }}>
          Murder count:
          <input type="number" min={1} value={draft.murderCount || 1} onChange={(e) => setDraft({ ...draft, murderCount: Number(e.target.value) })} style={{ ...inputStyle, width: 60 }} />
        </label>
      )}
      {draft.events.includes("pandoras-box") && (
        <label style={{ fontSize: 11, color: "#7a6a52", display: "flex", alignItems: "center", gap: 6 }}>
          Pandora's Box #:
          <input type="number" min={1} value={draft.pandorasBoxNumber || 1} onChange={(e) => setDraft({ ...draft, pandorasBoxNumber: Number(e.target.value) })} style={{ ...inputStyle, width: 60 }} />
        </label>
      )}
      <input
        value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
        placeholder="Notes (optional — e.g. tied to a real external event)"
        style={inputStyle}
      />
      <div style={{ display: "flex", gap: 6 }}>
        <Btn small onClick={onSave} disabled={busy}>Save</Btn>
        <Btn small variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Btn>
      </div>
    </div>
  );
}

const inputStyle = { padding: "6px 10px", borderRadius: 6, border: "1px solid #253550", background: "#050810", color: "#f0e6d3", fontSize: 12 };
const arrowBtnStyle = { background: "none", border: "1px solid #253550", borderRadius: 4, color: "#7a6a52", fontSize: 11, width: 22, height: 22, cursor: "pointer", padding: 0 };
