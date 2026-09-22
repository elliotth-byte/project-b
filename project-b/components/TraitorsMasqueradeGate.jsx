import { useState, useEffect } from "react";
import { Btn, Card } from "./traitorsUi";
import { subscribeGameState } from "../lib/gameStorage";
import { STORAGE_KEY_MASQUERADE } from "../lib/masqueradeData";
import { subscribePreEliminationStatus, applyMasqueradeEliminations } from "../lib/traitorsMasqueradeGate";
import MasqueradeHost from "./MasqueradeHost";

// ─── Masquerade Pre-Elimination Gate (host) ───
// See lib/traitorsMasqueradeGate.js for the full reasoning. This
// deliberately does NOT modify MasqueradeHost.jsx itself — that
// component's own mission logic (house splitting, guesses, the
// existing "first 3 resolved" rule) stays completely untouched; this
// just subscribes to the same underlying state independently, watches
// for the same "done" condition that component already computes
// internally, and adds the one new action this specific context needs:
// actually eliminating the losers once it's over, which a NORMAL
// in-season Masquerade mission (if this same mission ever gets reused
// as a regular numbered-schedule mission later) has no reason to do.
export default function TraitorsMasqueradeGate({ gameId, alive, allPlayers = [] }) {
  const [masquerade, setMasquerade] = useState(null);
  const [status, setStatus] = useState(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeGameState(gameId, STORAGE_KEY_MASQUERADE, setMasquerade);
    return unsubscribe;
  }, [gameId]);

  useEffect(() => {
    const unsubscribe = subscribePreEliminationStatus(gameId, setStatus);
    return unsubscribe;
  }, [gameId]);

  const done = masquerade && masquerade.resolvedOrder.length >= masquerade.maxResolved;
  const alreadyApplied = !!status?.applied;

  const apply = async () => {
    setApplying(true);
    await applyMasqueradeEliminations(gameId, masquerade, allPlayers);
    setApplying(false);
  };

  if (alreadyApplied) {
    const names = status.eliminatedNames || [];
    return (
      <Card style={{ borderColor: "rgba(196,92,60,0.3)" }}>
        <h3 style={{ color: "#f0e6d3", margin: "0 0 8px", fontSize: 14 }}>🎭 Masquerade Pre-Elimination — Applied</h3>
        <p style={{ fontSize: 12, color: "#a09080", margin: 0 }}>
          {names.length > 0 ? (
            <>Eliminated before Traitor selection: <strong style={{ color: "#c45c3c" }}>{names.join(", ")}</strong></>
          ) : (
            "No houses were eliminated — everyone advances to Traitor selection."
          )}
        </p>
      </Card>
    );
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Card style={{ borderColor: "rgba(196,92,60,0.4)" }}>
        <h3 style={{ color: "#f0e6d3", margin: "0 0 6px", fontSize: 14 }}>🎭 Masquerade Pre-Elimination</h3>
        <p style={{ fontSize: 12, color: "#a09080", margin: 0 }}>
          Run before Traitors are selected. Anyone in a house that ends up eliminated is eliminated from the game entirely — not just this mission. Supports any number of players, not just 26.
        </p>
      </Card>
      <MasqueradeHost gameId={gameId} alive={alive} allPlayers={allPlayers} />
      {done && (
        <Card style={{ borderColor: "rgba(196,92,60,0.5)", textAlign: "center" }}>
          <p style={{ fontSize: 12, color: "#f0e6d3", margin: "0 0 8px" }}>
            Mission's over. Apply eliminations before moving on to Traitor selection.
          </p>
          <Btn onClick={apply} disabled={applying}>{applying ? "Applying..." : "Apply Eliminations & Continue"}</Btn>
        </Card>
      )}
    </div>
  );
}
