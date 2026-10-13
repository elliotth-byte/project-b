import { useState, useEffect, useRef } from "react";
import { Btn, Card } from "./traitorsUi";
import { subscribeGameState } from "../lib/gameStorage";
import { STORAGE_KEY_MASQUERADE } from "../lib/masqueradeData";
import {
  subscribeMasqueradeMissionStatus, applyMasqueradeMissionEliminations,
  subscribeMasqueradeMissionRoulette, spinMasqueradeMissionRoulette,
  clearMasqueradeMissionGate,
} from "../lib/traitorsMasqueradeGate";
import MasqueradeHost from "./MasqueradeHost";
import MasqueradeRouletteWheel from "./MasqueradeRouletteWheel";

// ─── Masquerade Houses: in-season Roulette of Mercy ───
// Same Roulette-of-Mercy mechanic components/TraitorsMasqueradeGate.jsx
// already offers for the one-time Week 0 pre-season run, now available
// for an ORDINARY numbered-schedule appearance of this mission too (see
// lib/traitorsMasqueradeGate.js's KEY_MASQUERADE_MISSION_* keys — fully
// separate storage from Week 0's own KEY_PRE_ELIMINATION_* so the two
// can never collide or block each other). Doesn't touch MasqueradeHost.jsx
// itself — same as that file's own approach, this just watches the same
// underlying mission state independently and layers the survivor-count
// picker, wheel, and actual elimination on top once the mission's done.
//
// No player-facing reveal ceremony here (unlike Week 0's
// TraitorsMasqueradeReveal.jsx) — this mission runs mid-season while
// everyone's already an active player watching the host's own screen
// live, not a one-time "before you're even in the game" moment that
// needs its own dedicated full-screen ceremony.
export default function MasqueradeMissionGate({ gameId, alive, allPlayers = [], shieldedNames = [], returnedNames = [] }) {
  const [masquerade, setMasquerade] = useState(null);
  const [status, setStatus] = useState(null);
  const [roulette, setRoulette] = useState(null);
  const [applying, setApplying] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [survivorCountOverride, setSurvivorCountOverride] = useState(null);
  const hadMasqueradeRef = useRef(false);

  useEffect(() => {
    const unsubscribe = subscribeGameState(gameId, STORAGE_KEY_MASQUERADE, setMasquerade);
    return unsubscribe;
  }, [gameId]);

  useEffect(() => {
    const unsubscribe = subscribeMasqueradeMissionStatus(gameId, setStatus);
    return unsubscribe;
  }, [gameId]);

  useEffect(() => {
    const unsubscribe = subscribeMasqueradeMissionRoulette(gameId, setRoulette);
    return unsubscribe;
  }, [gameId]);

  // Resets this gate's own status/roulette the moment the host clears
  // the underlying mission (MasqueradeHost.jsx's own "Clear" button) —
  // otherwise a SECOND run of this mission later in the season would
  // find last time's "already applied" record and refuse to do anything.
  // Guarded on hadMasqueradeRef so this only fires on a genuine
  // non-null-to-null transition, never on the very first render (where
  // masquerade starts null before anything has even been subscribed).
  useEffect(() => {
    if (masquerade) { hadMasqueradeRef.current = true; return; }
    if (hadMasqueradeRef.current) {
      hadMasqueradeRef.current = false;
      clearMasqueradeMissionGate(gameId);
    }
  }, [gameId, masquerade]);

  const eliminatedCount = masquerade ? masquerade.houses.filter((h) => h.status === "eliminated").length : 0;
  const done = masquerade && eliminatedCount >= masquerade.loseTarget;
  const alreadyApplied = !!status?.applied;
  const eliminatedNames = masquerade
    ? [...masquerade.houses.filter((h) => h.status === "eliminated").flatMap((h) => h.members)].sort()
    : [];
  const readyToApply = done && (eliminatedNames.length === 0 || roulette?.savedNames?.length > 0);
  const maxSurvivors = Math.max(1, eliminatedNames.length);
  const survivorCount = Math.max(1, Math.min(survivorCountOverride ?? 1, maxSurvivors));

  const spin = async () => {
    setSpinning(true);
    await spinMasqueradeMissionRoulette(gameId, masquerade, survivorCount);
    setSpinning(false);
  };

  const apply = async () => {
    setApplying(true);
    await applyMasqueradeMissionEliminations(gameId, masquerade, allPlayers, roulette?.savedNames || []);
    setApplying(false);
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <MasqueradeHost gameId={gameId} alive={alive} allPlayers={allPlayers} shieldedNames={shieldedNames} returnedNames={returnedNames} />

      {alreadyApplied ? (
        <Card style={{ borderColor: "rgba(196,92,60,0.3)" }}>
          <h3 style={{ color: "#f0e6d3", margin: "0 0 8px", fontSize: 14 }}>🎭 Masquerade Houses — Eliminations Applied</h3>
          <p style={{ fontSize: 12, color: "#a09080", margin: 0 }}>
            {status.eliminatedNames?.length > 0 ? (
              <>Eliminated from the game: <strong style={{ color: "#c45c3c" }}>{status.eliminatedNames.join(", ")}</strong></>
            ) : (
              "No houses were eliminated — nobody was removed from the game."
            )}
          </p>
          {status.savedNames?.length > 0 && (
            <p style={{ fontSize: 12, color: "#7a9a5c", margin: "8px 0 0" }}>
              🎡 Saved by the wheel: <strong>{status.savedNames.join(", ")}</strong> — stay{status.savedNames.length > 1 ? "" : "s"} in the game.
            </p>
          )}
        </Card>
      ) : (
        <>
          {done && eliminatedNames.length > 0 && (
            <Card style={{ borderColor: "rgba(124,58,237,0.4)", textAlign: "center" }}>
              <h3 style={{ color: "#f0e6d3", margin: "0 0 8px", fontSize: 14 }}>🎡 Roulette of Mercy</h3>
              <p style={{ fontSize: 12, color: "#a09080", margin: "0 0 4px" }}>
                {roulette?.savedNames?.length
                  ? "The wheel has spoken."
                  : `Every name below is about to be eliminated from the game — except ${survivorCount}. Spin to see who survives.`}
              </p>
              {!roulette?.savedNames?.length && (
                <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "center", margin: "10px 0" }}>
                  <span style={{ fontSize: 12, color: "#a09080" }}>Survivors:</span>
                  <button onClick={() => setSurvivorCountOverride(Math.max(1, survivorCount - 1))} disabled={survivorCount <= 1} style={{ width: 26, height: 26, borderRadius: 6, border: "1px solid #253550", background: "#0a1020", color: "#a09080", cursor: "pointer" }}>−</button>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#7a9a5c", minWidth: 18, textAlign: "center" }}>{survivorCount}</span>
                  <button onClick={() => setSurvivorCountOverride(Math.min(maxSurvivors, survivorCount + 1))} disabled={survivorCount >= maxSurvivors} style={{ width: 26, height: 26, borderRadius: 6, border: "1px solid #253550", background: "#0a1020", color: "#a09080", cursor: "pointer" }}>+</button>
                  <span style={{ fontSize: 11, color: "#706050" }}>of {eliminatedNames.length} eliminated</span>
                </div>
              )}
              <MasqueradeRouletteWheel
                names={roulette?.names || eliminatedNames}
                savedNames={roulette?.savedNames || []}
                onSpin={spin}
                disabled={spinning}
              />
            </Card>
          )}
          {readyToApply && (
            <Card style={{ borderColor: "rgba(196,92,60,0.5)", textAlign: "center" }}>
              <p style={{ fontSize: 12, color: "#f0e6d3", margin: "0 0 8px" }}>
                Mission's over. Apply eliminations to actually remove the losing houses from the game.
              </p>
              <Btn onClick={apply} disabled={applying}>{applying ? "Applying..." : "Apply Eliminations"}</Btn>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
