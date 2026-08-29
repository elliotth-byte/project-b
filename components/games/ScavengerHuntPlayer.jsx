import { useState, useEffect, useRef } from "react";
import { Card, Badge, Btn } from "../ui";
import GameResultCard from "./GameResultCard";
import { reportScore } from "../../lib/challengeScores";
import {
  OFFERING_TYPES, chooseFirstTemple, takeItem, chooseNextLocation, placementValue, subscribeScavengerHunt,
} from "../../lib/games/scavengerHuntData";

// See lib/games/scavengerHuntData.js's own header comment for the full
// rules and every judgment call behind them. This component is a thin
// read/act layer over that server-persisted state — same shape as
// ChainsPlayer.jsx/TorchedPlayer.jsx: subscribe, render whatever the
// current state says, call the corresponding server action on a click,
// never hold any of the actual game state locally. Initialization is
// deliberately NOT done here — same reasoning as every other shared
// multiplayer game in this app (Torched, Chains, Masquerade): it
// happens once, server-side, from the authoritative challenge.
// participantIds, either the host's own Start Battle click
// (components/ChallengeHost.jsx) or random mode's own auto-start
// (lib/roundEngine.js) — never lazily from whichever player's client
// happens to load first, which would leave "which client's own
// players list wins" as an avoidable ambiguity.
export default function ScavengerHuntPlayer({ gameId, round, player, players }) {
  const [state, setState] = useState(null);
  const reportedRef = useRef(false);

  useEffect(() => {
    const unsubscribe = subscribeScavengerHunt(gameId, round.round, setState);
    return unsubscribe;
  }, [gameId, round.round]);

  useEffect(() => {
    if (state?.gameOver && !reportedRef.current) {
      reportedRef.current = true;
      reportScore(gameId, round.round, player.id, player.name, placementValue(state, player.id), { final: true });
    }
  }, [state?.gameOver]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!state) {
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <p style={{ color: "#6b4f99", fontSize: 12, fontStyle: "italic" }}>Waiting for the hunt to begin...</p>
      </Card>
    );
  }

  const me = state.players[player.id];
  if (!me) {
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <p style={{ color: "#6b4f99", fontSize: 12, fontStyle: "italic" }}>You're not part of this Battle.</p>
      </Card>
    );
  }

  const byName = (id) => players.find((p) => p.id === id)?.display_name || "?";
  const distinctTypes = new Set(me.inventory);
  const hasFullSet = distinctTypes.size === OFFERING_TYPES.length;

  const collectionStrip = (
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 4, marginBottom: 14 }}>
      {OFFERING_TYPES.map((type) => (
        <span key={type} style={{
          fontSize: 10, padding: "3px 7px", borderRadius: 4,
          background: distinctTypes.has(type) ? "rgba(0,255,157,0.12)" : "#0d0618",
          border: `1px solid ${distinctTypes.has(type) ? "#00ff9d" : "#3d1f5c"}`,
          color: distinctTypes.has(type) ? "#00ff9d" : "#6b4f99",
        }}>
          {distinctTypes.has(type) ? "✓ " : ""}{type}
        </span>
      ))}
    </div>
  );

  if (state.gameOver) {
    const finishIdx = state.finishedOrder.indexOf(player.id);
    return (
      <GameResultCard
        icon="🏛"
        title={finishIdx !== -1 ? `Returned to Olympus — #${finishIdx + 1}!` : "The Hunt Has Ended"}
        valueLabel={finishIdx !== -1 ? "Complete Set!" : `${distinctTypes.size} / ${OFFERING_TYPES.length} collected`}
      />
    );
  }

  if (me.finishedRound != null) {
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <div style={{ fontSize: 28, marginBottom: 6 }}>🏛</div>
        <p style={{ color: "#f5f0ff", fontSize: 14, margin: 0 }}>You've returned to Olympus with a complete set — waiting to see if you're among the first 3.</p>
      </Card>
    );
  }

  if (me.currentLocation == null) {
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <h3 style={{ color: "#ff2d95", margin: "0 0 6px", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🏺 Scavenger Hunt</h3>
        <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 14px" }}>
          Choose a temple to start at. Each holds a random assortment of offerings — grab what you can, first come first served,
          before someone else does.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
          {state.temples.map((t, i) => (
            <button key={i} onClick={() => chooseFirstTemple(gameId, round.round, player.id, i)} style={{
              padding: "14px 8px", borderRadius: 10, cursor: "pointer", background: "#0d0618", border: "2px solid #3d1f5c",
              color: "#f5f0ff", fontSize: 13, fontWeight: 700,
            }}>{t.name}</button>
          ))}
        </div>
      </Card>
    );
  }

  const temple = state.temples[me.currentLocation];
  const hasChosenNext = me.nextLocation != null;
  const othersHere = Object.entries(state.players)
    .filter(([pid, p]) => pid !== player.id && p.finishedRound == null && p.currentLocation === me.currentLocation)
    .map(([pid]) => byName(pid));

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🏺 {temple.name}</h3>
        <Badge>Round {state.roundIndex}</Badge>
      </div>
      {collectionStrip}
      {othersHere.length > 0 && (
        <p style={{ color: "#ff2d95", fontSize: 11, margin: "0 0 10px", fontWeight: 600 }}>
          Also here: {othersHere.join(", ")} — same items, first come first served.
        </p>
      )}

      {hasChosenNext ? (
        <p style={{ color: "#a68fd6", fontSize: 13, margin: 0 }}>
          Heading to {me.nextLocation === "olympus" ? "Mount Olympus" : state.temples[me.nextLocation].name} next round —
          waiting on everyone else.
        </p>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginBottom: 14 }}>
            {temple.items.map((item) => {
              const taken = !!item.takenBy;
              const isMine = item.takenBy === player.id;
              return (
                <button
                  key={item.id}
                  onClick={() => !taken && !me.takenThisRound && takeItem(gameId, round.round, player.id, item.id)}
                  disabled={taken || me.takenThisRound}
                  title={taken ? `Taken: ${item.type}` : `Take this ${item.type}`}
                  style={{
                    aspectRatio: "1", borderRadius: 10, cursor: (taken || me.takenThisRound) ? "default" : "pointer",
                    background: isMine ? "rgba(255,45,149,0.15)" : taken ? "#1a0a2e" : "#0d0618",
                    border: `2px solid ${isMine ? "#ff2d95" : "#3d1f5c"}`,
                    color: taken ? "#6b4f99" : "#f5f0ff", fontSize: 9, fontWeight: 700, padding: 2,
                    opacity: taken && !isMine ? 0.5 : 1,
                  }}
                >
                  {item.type}
                </button>
              );
            })}
          </div>
          <p style={{ color: "#6b4f99", fontSize: 11, margin: "0 0 12px", fontStyle: "italic" }}>
            {me.takenThisRound ? "You've taken your item this round." : "Tap an unclaimed item to take it — one per round, permanent once taken."}
          </p>

          <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 8px" }}>Where to next?</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6, marginBottom: hasFullSet ? 8 : 0 }}>
            {state.temples.map((t, i) => (
              <Btn key={i} small variant={i === me.currentLocation ? "ghost" : "primary"} onClick={() => chooseNextLocation(gameId, round.round, player.id, i)}>
                {t.name.replace("Temple of ", "")}
              </Btn>
            ))}
          </div>
          {hasFullSet && (
            <Btn small onClick={() => chooseNextLocation(gameId, round.round, player.id, "olympus")} style={{ marginTop: 8 }}>
              🏛 Return to Mount Olympus
            </Btn>
          )}
        </>
      )}
    </Card>
  );
}
