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
// challengeSelection.js). The draw itself now gets created twice over
// a normal round's life: once retroactively-early, the moment the
// PRECEDING round began (see advanceFromExile's own pre-draw, in
// lib/roundEngine.js), covering that round's Battle, Fates Ceremony,
// and Exile Vote — and, as a fallback for round 1 specifically (which
// has no preceding round to pre-draw from), the normal
// autoStartRandomChallenge draw the instant this round's own challenge
// phase begins. Either way, by the time a challenge is actually about
// to start, a draw already exists — this component just needs to know
// which KEY to watch, which depends on which of the CURRENT round's
// phases we're actually in: during "challenge" it's picking for THIS
// round (key uses round.round); during "fates" or "exile" it's already
// picking ahead for the round that hasn't started yet (key uses
// round.round + 1). If he doesn't decide within a grace period (the
// season's own configured challenge duration, measured from when the
// round the draw is actually FOR began — see
// autoStartRandomChallenge's own reasoning on why that's the right
// clock now that a draw can be created a full round early), the game
// auto-picks one of the two for him rather than stalling forever;
// draw.autoChosen is what tells this component to say so honestly
// instead of claiming he chose it.
export default function HephaestusChoice({ gameId, round, player, settings }) {
  const forNextRound = round?.phase === "fates" || round?.phase === "exile";
  const key = round?.phase === "challenge" ? hephaestusDrawKey(round.round)
    : forNextRound ? hephaestusDrawKey(round.round + 1)
    : null;
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
        {draw.autoChosen ? (
          <p style={{ color: "#a68fd6", fontSize: 12, margin: 0 }}>
            You didn't decide in time, so the game picked <strong style={{ color: "#f5f0ff" }}>{chosenGame?.icon} {chosenGame?.label}</strong> for {forNextRound ? "the next round's" : "this round's"} challenge.
          </p>
        ) : (
          <p style={{ color: "#a68fd6", fontSize: 12, margin: 0 }}>
            You chose <strong style={{ color: "#f5f0ff" }}>{chosenGame?.icon} {chosenGame?.label}</strong> for {forNextRound ? "the next round's" : "this round's"} challenge.
          </p>
        )}
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
        <h3 style={{ color: "#f5f0ff", margin: "0 0 4px", fontSize: 15 }}>Power of the Forge <span style={{ color: "#a68fd6", fontWeight: 400, fontSize: 12 }}>(Hephaestus)</span></h3>
        <p style={{ color: "#a68fd6", fontSize: 12, margin: 0 }}>Pick {forNextRound ? "the next round's" : "this round's"} challenge.</p>
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
