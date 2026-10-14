import { useState, useEffect } from "react";
import { Btn, Card, PlayerTag } from "./traitorsUi";
import { submitFinalGuess, fetchOwnFinalGuess } from "../lib/finalGuessData";

// ─── Traitors: Final Guess ("who were the Traitors?") ───
// Shown to an eliminated player, before the finale is declared — one
// shot at naming who among the players still in the game they believe
// are Traitors. Saved to the dedicated traitor_final_guesses table
// (sql/add-traitor-final-guesses.sql), which only the host can read
// until the finale is declared; see TraitorsFinalGuessReveal.jsx for
// what everyone sees once it is. Locked the instant it's submitted — no
// editing, same as Masquerade's own shield/killer guesses.
export default function TraitorsFinalGuess({ gameId, player, players, readOnly = false }) {
  const [existing, setExisting] = useState(undefined); // undefined = still loading
  const [selected, setSelected] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchOwnFinalGuess(player.id).then((row) => { if (!cancelled) setExisting(row); });
    return () => { cancelled = true; };
  }, [player.id]);

  // Still-alive players, other than this one (they're already out) —
  // the only people left it's actually meaningful to guess about.
  const candidates = (players || []).filter((p) => p.alive !== false && p.id !== player.id);

  const toggle = (id) => setSelected((sel) => (sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]));

  const submit = async () => {
    if (selected.length === 0 || saving) return;
    setSaving(true);
    const guessedPlayers = candidates.filter((p) => selected.includes(p.id)).map((p) => ({ id: p.id, name: p.display_name }));
    const res = await submitFinalGuess({ gameId, playerId: player.id, playerName: player.name, guessedPlayers });
    setSaving(false);
    if (res.ok) setExisting(res.data);
  };

  if (existing === undefined) return null; // avoid a flash of the picker before we know

  return (
    <Card style={{ marginBottom: 20, borderColor: "rgba(196,92,60,0.3)" }}>
      <h3 style={{ color: "#f0e6d3", margin: "0 0 6px", fontSize: 15, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>
        🔮 Final Guess
      </h3>
      {existing ? (
        <>
          <p style={{ fontSize: 12, color: "#7a9a5c", margin: "0 0 6px" }}>
            ✓ Locked in. You'll both find out how you did once the game ends.
          </p>
          <p style={{ fontSize: 12, color: "#a09080", margin: 0 }}>
            Your guess: <strong style={{ color: "#f0e6d3" }}>{(existing.guessed_names || []).join(", ")}</strong>
          </p>
        </>
      ) : (
        <>
          <p style={{ fontSize: 12, color: "#a09080", margin: "0 0 10px", fontStyle: "italic" }}>
            Before you go quiet for good — who among the players still in the game do you think are Traitors? This
            stays completely private, seen only by the host, until the game is over.
          </p>
          {candidates.length === 0 ? (
            <p style={{ fontSize: 12, color: "#706050", fontStyle: "italic", margin: 0 }}>No one left to guess about.</p>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginBottom: 10, pointerEvents: readOnly ? "none" : "auto" }}>
                {candidates.map((p) => (
                  <button key={p.id} onClick={() => toggle(p.id)} style={{
                    fontSize: 12, padding: "6px 8px", borderRadius: 6, textAlign: "left", cursor: "pointer",
                    background: selected.includes(p.id) ? "rgba(196,92,60,0.15)" : "#0a1020",
                    border: `1px solid ${selected.includes(p.id) ? "#c45c3c" : "#253550"}`,
                    color: selected.includes(p.id) ? "#c45c3c" : "#f0e6d3",
                  }}>
                    <PlayerTag
                      name={`${selected.includes(p.id) ? "✓ " : ""}${p.display_name}`}
                      avatarUrl={p.effectiveAvatarUrl} size={16}
                      textStyle={{ color: selected.includes(p.id) ? "#c45c3c" : "#f0e6d3" }}
                    />
                  </button>
                ))}
              </div>
              <Btn small onClick={submit} disabled={readOnly || selected.length === 0 || saving}>
                {saving ? "Locking in..." : "Lock In Final Guess"}
              </Btn>
            </>
          )}
        </>
      )}
    </Card>
  );
}
