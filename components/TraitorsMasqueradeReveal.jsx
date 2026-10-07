import { useState, useEffect } from "react";
import { Btn, Card } from "./traitorsUi";
import {
  subscribePreEliminationStatus, subscribePreEliminationAck, markPreEliminationAcknowledged,
  subscribeMasqueradeRoulette,
} from "../lib/traitorsMasqueradeGate";
import MasqueradeRouletteWheel from "./MasqueradeRouletteWheel";

// ─── Masquerade Pre-Elimination: player-facing reveal ───
// The host-only TraitorsMasqueradeGate.jsx already runs the whole
// Roulette of Mercy, but never showed any of it to players — this
// mirrors that spectacle for them, asynchronously rather than as a
// synced live broadcast, the same spirit as Panopticon's
// RoundRevealGate.jsx: the actual result is already decided and
// persisted (see lib/traitorsMasqueradeGate.js) before this ever
// mounts, and MasqueradeRouletteWheel's spin animation is driven
// entirely off the `savedNames` prop it's handed — so a player opening
// the app ten minutes after the host spun still gets the full dramatic
// spin from scratch, landing on the same real result every time, same
// as a player who happened to be watching live.
//
// One fixed key, not per-round (see KEY_PRE_ELIMINATION_ACK) — this gate
// only ever runs once per season, before Traitors are even assigned.
export default function TraitorsMasqueradeReveal({ gameId, player }) {
  const [status, setStatus] = useState(null);
  const [roulette, setRoulette] = useState(null);
  const [ack, setAck] = useState({});
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribePreEliminationStatus(gameId, setStatus);
    return unsubscribe;
  }, [gameId]);

  useEffect(() => {
    const unsubscribe = subscribeMasqueradeRoulette(gameId, setRoulette);
    return unsubscribe;
  }, [gameId]);

  useEffect(() => {
    const unsubscribe = subscribePreEliminationAck(gameId, setAck);
    return unsubscribe;
  }, [gameId]);

  if (!status?.applied || !player?.id || ack[player.id]) return null;

  const dismiss = async () => {
    setDismissing(true);
    await markPreEliminationAcknowledged(gameId, player.id);
    setDismissing(false);
  };

  const eliminatedNames = status.eliminatedNames || [];
  const savedNames = status.savedNames || [];
  const stillWaitingOnSpin = eliminatedNames.length > 0 && savedNames.length === 0;
  const wasEliminated = eliminatedNames.includes(player.name) && !savedNames.includes(player.name);

  return (
    <Card style={{ marginBottom: 20, textAlign: "center", borderColor: "rgba(124,58,237,0.4)" }}>
      <h3 style={{ color: "#f0e6d3", margin: "0 0 6px", fontSize: 16, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>
        🎭 The Masquerade Has Ended
      </h3>
      {eliminatedNames.length > 0 ? (
        <>
          <p style={{ fontSize: 12, color: "#a09080", margin: "0 0 8px" }}>
            Unmasked and cast out: <strong style={{ color: "#c45c3c" }}>{eliminatedNames.join(", ")}</strong>
          </p>
          <h4 style={{ color: "#c9a84c", margin: "10px 0 2px", fontSize: 13 }}>🎡 Roulette of Mercy</h4>
          {savedNames.length > 0 ? (
            <MasqueradeRouletteWheel names={roulette?.names || eliminatedNames} savedNames={savedNames} onSpin={() => {}} disabled />
          ) : (
            <p style={{ fontSize: 12, color: "#706050", fontStyle: "italic" }}>Waiting on the host to spin the wheel...</p>
          )}
          {wasEliminated && savedNames.length > 0 && (
            <p style={{ fontSize: 13, color: "#c45c3c", fontWeight: 700, marginTop: 10 }}>This was you. You're out.</p>
          )}
        </>
      ) : (
        <p style={{ fontSize: 12, color: "#a09080", margin: "0 0 8px" }}>No houses were eliminated — everyone advances.</p>
      )}
      <Btn onClick={dismiss} disabled={dismissing || stillWaitingOnSpin} style={{ marginTop: 12 }}>
        {dismissing ? "..." : "Continue"}
      </Btn>
    </Card>
  );
}
