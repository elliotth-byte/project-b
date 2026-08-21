import { useState, useEffect } from "react";
import { Card, Btn } from "./ui";
import { subscribeGameState, storageUpdate } from "../lib/gameStorage";
import { GAME_REGISTRY } from "../lib/challengeGames";
import { hephaestusDrawKey } from "../lib/challengeSelection";
import { powerFor } from "../lib/characterPowers";

// ─── Hephaestus's character power (see lib/characterPowers.js) ───
// "You can see two options for the next round's challenge and pick
// between the two of them." Only meaningful when
// settings.challengeSelectionMode is "random" (see lib/
// challengeSelection.js) — the host triggers the draw (two options get
// stored, see ChallengeHost.jsx), and this is what actually lets
// Hephaestus pick between them. Shown only while the challenge itself
// hasn't started yet (round.phase === "challenge" but nothing's active)
// — the same "setup" window the host's own picker occupies.
export default function HephaestusChoice({ gameId, round, player, settings }) {
  const key = round?.phase === "challenge" ? hephaestusDrawKey(round.round) : null;
  const [draw, setDraw] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!key) return;
    const unsubscribe = subscribeGameState(gameId, key, setDraw);
    return unsubscribe;
  }, [gameId, key]);

  const isHephaestus = powerFor(player, settings) === "Hephaestus";
  if (!isHephaestus || !key || !draw?.options?.length) return null;

  if (draw.chosen) {
    const chosenGame = GAME_REGISTRY[draw.chosen];
    return (
      <Card style={{ marginBottom: 20, textAlign: "center", borderColor: "#f97316" }}>
        <div style={{ fontSize: 22, marginBottom: 4 }}>🔥</div>
        <p style={{ color: "#a68fd6", fontSize: 12, margin: 0 }}>
          You chose <strong style={{ color: "#f5f0ff" }}>{chosenGame?.icon} {chosenGame?.label}</strong> for this round's challenge.
        </p>
      </Card>
    );
  }

  const choose = async (gameType) => {
    setSaving(true);
    await storageUpdate(gameId, key, (fresh) => (fresh && !fresh.chosen ? { ...fresh, chosen: gameType } : fresh));
    setSaving(false);
  };

  return (
    <Card style={{ marginBottom: 20, borderColor: "#f97316" }}>
      <div style={{ textAlign: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 22, marginBottom: 4 }}>🔥</div>
        <h3 style={{ color: "#f5f0ff", margin: "0 0 4px", fontSize: 15 }}>Hephaestus's Power</h3>
        <p style={{ color: "#a68fd6", fontSize: 12, margin: 0 }}>Pick this round's challenge.</p>
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {draw.options.map((gameType) => {
          const g = GAME_REGISTRY[gameType];
          return (
            <button
              key={gameType}
              onClick={() => choose(gameType)}
              disabled={saving}
              style={{
                textAlign: "left", padding: "12px 14px", borderRadius: 10, cursor: saving ? "default" : "pointer",
                background: "#0d0618", border: "1px solid #3d1f5c",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 20 }}>{g?.icon}</span>
                <span style={{ color: "#f5f0ff", fontSize: 14, fontWeight: 700 }}>{g?.label}</span>
              </div>
              <p style={{ color: "#a68fd6", fontSize: 11.5, margin: 0 }}>{g?.blurb}</p>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
