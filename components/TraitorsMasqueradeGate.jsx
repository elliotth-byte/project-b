import { useState, useEffect } from "react";
import { Btn, Card } from "./traitorsUi";
import { subscribeGameState } from "../lib/gameStorage";
import { STORAGE_KEY_MASQUERADE } from "../lib/masqueradeData";
import {
  subscribePreEliminationStatus, applyMasqueradeEliminations,
  subscribeMasqueradeRoulette, spinMasqueradeRoulette,
} from "../lib/traitorsMasqueradeGate";
import MasqueradeHost from "./MasqueradeHost";
import MasqueradeRouletteWheel from "./MasqueradeRouletteWheel";

// ─── Masquerade Pre-Elimination Gate (host) ───
// See lib/traitorsMasqueradeGate.js for the full reasoning. This
// deliberately does NOT modify MasqueradeHost.jsx itself — that
// component's own mission logic (house splitting, guesses, the
// host-configurable "houses to eliminate" target) stays completely
// untouched; this just subscribes to the same underlying state
// independently, watches for the same "done" condition that component
// already computes internally, and adds the two new actions this
// specific context needs: the Roulette of Mercy spin, then actually
// eliminating whoever the wheel didn't save — which a NORMAL in-season
// Masquerade mission (if this same mission ever gets reused as a
// regular numbered-schedule mission later) has no reason to do.
export default function TraitorsMasqueradeGate({ gameId, alive, allPlayers = [] }) {
  const [masquerade, setMasquerade] = useState(null);
  const [status, setStatus] = useState(null);
  const [roulette, setRoulette] = useState(null);
  const [applying, setApplying] = useState(false);
  const [spinning, setSpinning] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeGameState(gameId, STORAGE_KEY_MASQUERADE, setMasquerade);
    return unsubscribe;
  }, [gameId]);

  useEffect(() => {
    const unsubscribe = subscribePreEliminationStatus(gameId, setStatus);
    return unsubscribe;
  }, [gameId]);

  useEffect(() => {
    const unsubscribe = subscribeMasqueradeRoulette(gameId, setRoulette);
    return unsubscribe;
  }, [gameId]);

  const eliminatedCount = masquerade ? masquerade.houses.filter((h) => h.status === "eliminated").length : 0;
  const done = masquerade && eliminatedCount >= masquerade.loseTarget;
  const alreadyApplied = !!status?.applied;
  const eliminatedNames = masquerade
    ? [...masquerade.houses.filter((h) => h.status === "eliminated").flatMap((h) => h.members)].sort()
    : [];
  // Every eliminated-house member is one spin away from being spared — the
  // "Apply" step can't run until either nobody was eliminated at all, or
  // the wheel has actually landed on someone to save.
  const readyToApply = done && (eliminatedNames.length === 0 || !!roulette?.savedName);

  const spin = async () => {
    setSpinning(true);
    await spinMasqueradeRoulette(gameId, masquerade);
    setSpinning(false);
  };

  const apply = async () => {
    setApplying(true);
    await applyMasqueradeEliminations(gameId, masquerade, allPlayers, roulette?.savedName || null);
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
        {status.savedName && (
          <p style={{ fontSize: 12, color: "#7a9a5c", margin: "8px 0 0" }}>
            🎡 Saved by the wheel: <strong>{status.savedName}</strong> — joins the main cast.
          </p>
        )}
      </Card>
    );
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Card style={{ borderColor: "rgba(196,92,60,0.4)" }}>
        <h3 style={{ color: "#f0e6d3", margin: "0 0 6px", fontSize: 14 }}>🎭 Masquerade Pre-Elimination</h3>
        <p style={{ fontSize: 12, color: "#a09080", margin: 0 }}>
          Run before Traitors are selected. Anyone in a house that ends up eliminated is eliminated from the game entirely — except one name the roulette wheel saves. Supports any number of players, not just 26.
        </p>
      </Card>
      <MasqueradeHost gameId={gameId} alive={alive} allPlayers={allPlayers} />
      {done && eliminatedNames.length > 0 && (
        <Card style={{ borderColor: "rgba(124,58,237,0.4)", textAlign: "center" }}>
          <h3 style={{ color: "#f0e6d3", margin: "0 0 8px", fontSize: 14 }}>🎡 Roulette of Mercy</h3>
          <p style={{ fontSize: 12, color: "#a09080", margin: "0 0 4px" }}>
            {roulette?.savedName
              ? "The wheel has spoken."
              : "Every name below is about to be eliminated — except one. Spin to see who survives."}
          </p>
          <MasqueradeRouletteWheel
            names={roulette?.names || eliminatedNames}
            savedName={roulette?.savedName || null}
            onSpin={spin}
            disabled={spinning}
          />
        </Card>
      )}
      {readyToApply && (
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
