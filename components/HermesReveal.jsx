import { useState, useEffect } from "react";
import { Card } from "./ui";
import { subscribeChaosSecret, exileContext, FINALE_CONTEXT } from "../lib/chaosSecrets";
import { powerFor } from "../lib/characterPowers";

// ─── Hermes's character power (see lib/characterPowers.js) ───
// "Can see and discuss the player saved by the Power of Chaos ahead of
// the vote reveal." Reuses subscribeChaosSecret exactly as
// ChaosPowerPlayer.jsx does for the actual holder — no new data-layer
// function needed at all, since the only thing that had to change was
// the RLS policy itself (see sql/add-hermes-chaos-visibility.sql),
// letting this same read succeed for whoever holds Hermes's power too.
export default function HermesReveal({ gameId, round, player, players, settings }) {
  const isExile = round?.phase === "exile";
  const isFinale = round?.phase === "finale";
  const context = isExile ? exileContext(round?.round) : isFinale ? FINALE_CONTEXT : null;
  const [secret, setSecret] = useState(null);

  useEffect(() => {
    if (!context) return;
    const unsubscribe = subscribeChaosSecret(gameId, context, setSecret);
    return unsubscribe;
  }, [gameId, context]);

  const isHermes = powerFor(player, settings) === "Hermes";
  if (!isHermes || !secret?.nomineeId) return null;

  const savedName = (players || []).find((p) => p.id === secret.nomineeId)?.display_name || "?";

  return (
    <Card style={{ marginBottom: 20, textAlign: "center", borderColor: "#facc15" }}>
      <div style={{ fontSize: 22, marginBottom: 4 }}>🪽</div>
      <h3 style={{ color: "#f5f0ff", margin: "0 0 4px", fontSize: 15 }}>Hermes's Power</h3>
      <p style={{ color: "#a68fd6", fontSize: 12, margin: 0 }}>
        The Power of Khaos is protecting <strong style={{ color: "#facc15" }}>{savedName}</strong> — you can see (and talk about) this ahead of the reveal.
      </p>
    </Card>
  );
}
