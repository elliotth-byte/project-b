import { useState, useEffect } from "react";
import { Card, Btn, Badge } from "./ui";
import { subscribeGameState } from "../lib/gameStorage";
import { KEY_REENTRY, PHASES } from "../lib/gameState";
import { subscribeJuryPreferences, submitJuryPreferences, isPermanentlyOut, jurorPreferenceCandidates } from "../lib/juryPreferenceData";

// ─── Jury Preference List ───
// Only ever visible to a player who is BOTH jury-eligible AND
// permanently out of re-entry contention (see lib/juryPreferenceData.js's
// isPermanentlyOut) — everyone else, this renders nothing. Deliberately
// NOT gated to any particular round phase, and shown alongside whatever
// phase-specific card is already on the Game tab (see pages/play.jsx) —
// the whole point is letting someone set this well before the actual
// Finale, in case they go quiet on the app between now and then.
// Doesn't render once the real Finale vote is open (round.phase ===
// "finale") — at that point FinalePlayer.jsx handles real voting for
// anyone still present, and this would just be a confusing second
// thing to interact with.
export default function JuryPreferencePanel({ gameId, myPlayer, players, round }) {
  const [reentry, setReentry] = useState([]);
  const [myPreferences, setMyPreferences] = useState(null);
  const [ranked, setRanked] = useState(null); // local editable order — [{targetId, reason}]
  const [saved, setSaved] = useState(true);

  useEffect(() => {
    const unsubscribe = subscribeGameState(gameId, KEY_REENTRY, (v) => setReentry(v || []));
    return unsubscribe;
  }, [gameId]);

  useEffect(() => {
    const unsubscribe = subscribeJuryPreferences(gameId, setMyPreferences);
    return unsubscribe;
  }, [gameId]);

  const myReentryEntry = (reentry || []).find((r) => r.playerId === myPlayer?.id) || null;
  // isPermanentlyOut/jurorPreferenceCandidates both expect the raw,
  // snake_case-ish players-table shape (approved/alive/elimination_type)
  // — myPlayer as pages/play.jsx builds it uses camelCase
  // (eliminationType) instead, so it's reshaped here rather than passed
  // straight through. Same mismatch, same fix, as lib/useNeedsAction.js
  // already had to apply for isJuryEligible for exactly this reason.
  const myPlayerRawShape = myPlayer ? { id: myPlayer.id, approved: true, alive: myPlayer.alive, elimination_type: myPlayer.eliminationType } : null;
  const eligible = isPermanentlyOut(myPlayerRawShape, myReentryEntry, round) && round?.phase !== PHASES.FINALE;

  const candidates = eligible ? jurorPreferenceCandidates(players, reentry, myPlayer.id) : [];
  const byId = {};
  candidates.forEach((p) => (byId[p.id] = p.display_name));

  // Initialize the local editable order once real data arrives —
  // existing saved preferences first (in their saved order), then any
  // eligible candidate not yet ranked, appended at the end.
  useEffect(() => {
    if (!eligible || myPreferences === null || ranked !== null) return;
    const existing = myPreferences[myPlayer.id] || [];
    const existingIds = new Set(existing.map((r) => r.targetId));
    const rest = candidates.filter((p) => !existingIds.has(p.id)).map((p) => ({ targetId: p.id, reason: "" }));
    setRanked([...existing, ...rest]);
  }, [eligible, myPreferences, ranked, candidates, myPlayer?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!eligible) return null;
  if (!ranked) return null; // waiting on reentry/preferences to load

  const move = (index, delta) => {
    const next = [...ranked];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setRanked(next);
    setSaved(false);
  };

  const setReason = (index, reason) => {
    setRanked((prev) => prev.map((r, i) => (i === index ? { ...r, reason } : r)));
    setSaved(false);
  };

  const save = async () => {
    await submitJuryPreferences(gameId, myPlayer.id, ranked.map((r) => ({ targetId: r.targetId, reason: r.reason.trim() })));
    setSaved(true);
  };

  return (
    <Card style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🗳 Jury Preference List</h3>
        <Badge>{saved ? "Saved" : "Unsaved changes"}</Badge>
      </div>
      <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 12px" }}>
        You're out for good, but the Finale is still ahead. Rank everyone still in it, most preferred first — if you're not around when the real vote happens, the game applies your highest-ranked pick who actually made the Finale.
      </p>

      <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
        {ranked.map((r, i) => (
          <div key={r.targetId} style={{ display: "flex", alignItems: "center", gap: 8, background: "#0d0618", borderRadius: 8, padding: "8px 10px" }}>
            <Badge>#{i + 1}</Badge>
            <span style={{ flex: 1, fontSize: 13, color: "#f5f0ff", fontWeight: 700 }}>{byId[r.targetId] || "?"}</span>
            <div style={{ display: "flex", gap: 4 }}>
              <button onClick={() => move(i, -1)} disabled={i === 0} style={{
                width: 28, height: 28, borderRadius: 6, background: "transparent", border: "1px solid #3d1f5c",
                color: i === 0 ? "#3d1f5c" : "#a68fd6", cursor: i === 0 ? "default" : "pointer", fontSize: 12,
              }}>▲</button>
              <button onClick={() => move(i, 1)} disabled={i === ranked.length - 1} style={{
                width: 28, height: 28, borderRadius: 6, background: "transparent", border: "1px solid #3d1f5c",
                color: i === ranked.length - 1 ? "#3d1f5c" : "#a68fd6", cursor: i === ranked.length - 1 ? "default" : "pointer", fontSize: 12,
              }}>▼</button>
            </div>
          </div>
        ))}
      </div>

      <details style={{ marginBottom: 12 }}>
        <summary style={{ fontSize: 11, color: "#6b4f99", cursor: "pointer", textTransform: "uppercase", letterSpacing: 0.5 }}>
          Add reasons (optional)
        </summary>
        <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
          {ranked.map((r, i) => (
            <div key={r.targetId}>
              <label style={{ display: "block", fontSize: 11, color: "#a68fd6", marginBottom: 4 }}>Why {byId[r.targetId] || "?"}?</label>
              <textarea
                value={r.reason}
                onChange={(e) => setReason(i, e.target.value)}
                maxLength={280}
                rows={2}
                placeholder="Optional — shown if this pick actually gets applied."
                style={{ width: "100%", background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 8, padding: "8px 10px", color: "#f5f0ff", fontSize: 12, fontFamily: "'Orbitron', 'Segoe UI', sans-serif", resize: "vertical", boxSizing: "border-box" }}
              />
            </div>
          ))}
        </div>
      </details>

      <Btn onClick={save} disabled={saved} style={{ width: "100%" }}>
        {saved ? "✓ Saved" : "Save Preference List"}
      </Btn>
      <p style={{ color: "#6b4f99", fontSize: 11, marginTop: 8, textAlign: "center", fontStyle: "italic" }}>
        You can come back and reorder this any time before the Finale actually starts.
      </p>
    </Card>
  );
}
