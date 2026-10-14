import { useState, useEffect } from "react";
import { Card } from "./traitorsUi";
import { fetchAllFinalGuesses, subscribeFinalGuessesTable } from "../lib/finalGuessData";

// ─── Traitors: Final Guess reveal ───
// What every player — eliminated or still standing — sees once the
// finale is declared: everyone's "who were the Traitors?" guess, all at
// once. Before that moment, RLS (sql/add-traitor-final-guesses.sql)
// means a fetch here only ever returns the CALLER'S OWN row, so this
// quietly shows just one guess (or none, if they never submitted) for
// anyone who somehow reaches it early — not a bug to guard against here,
// the database already won't hand over anyone else's.
export default function TraitorsFinalGuessReveal({ gameId }) {
  const [guesses, setGuesses] = useState([]);

  useEffect(() => {
    const load = () => fetchAllFinalGuesses(gameId).then(setGuesses);
    load();
    const unsubscribe = subscribeFinalGuessesTable(gameId, load);
    return unsubscribe;
  }, [gameId]);

  return (
    <Card style={{ marginBottom: 20, borderColor: "rgba(196,92,60,0.3)" }}>
      <h3 style={{ color: "#f0e6d3", margin: "0 0 6px", fontSize: 15, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>
        🔮 Final Guesses — Revealed
      </h3>
      {guesses.length === 0 ? (
        <p style={{ fontSize: 12, color: "#706050", fontStyle: "italic", margin: 0 }}>Nobody submitted a final guess this season.</p>
      ) : (
        <div style={{ display: "grid", gap: 6 }}>
          {guesses.map((g) => (
            <div key={g.player_id} style={{ background: "#0a1020", borderRadius: 8, padding: "8px 10px" }}>
              <span style={{ fontSize: 13, color: "#c9a84c", fontWeight: 700 }}>{g.player_name}</span>
              <span style={{ fontSize: 13, color: "#a09080" }}> guessed: </span>
              <span style={{ fontSize: 13, color: "#f0e6d3" }}>{(g.guessed_names || []).join(", ") || "—"}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
