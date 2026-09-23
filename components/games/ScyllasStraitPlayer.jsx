import { useState, useEffect, useRef } from "react";
import { Card, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { reportScore } from "../../lib/challengeScores";
import { subscribeScyllasStrait, tickScyllasStrait, submitScyllaCard, placementValue } from "../../lib/games/scyllasStraitData";

const ITEM_ICONS = { "an oar": "🚣", "a sandal": "🩴", "a shield": "🛡️", "a toga": "👘" };

// ─── Scylla's Strait (phone side) ───
// Your own hand is the only private thing here — everything else
// (the line order, everyone's discard piles, remaining items) is
// public information in the real Get Bit! game this reskins, and
// already shown on the big screen (see components/bigscreen/
// ScyllasStraitTvDisplay.jsx), so this stays focused on the one
// decision that's actually yours each round: which card to play.
export default function ScyllasStraitPlayer({ gameId, round, challenge, player }) {
  const [state, setState] = useState(null);
  const reportedRef = useRef(false);

  useEffect(() => subscribeScyllasStrait(gameId, round.round, setState), [gameId, round.round]);

  useEffect(() => {
    const id = setInterval(() => tickScyllasStrait(gameId, round.round), 500);
    return () => clearInterval(id);
  }, [gameId, round.round]);

  useEffect(() => {
    if (!state) return;
    reportScore(gameId, round.round, player.id, player.name, placementValue(state, player.id), { final: false });
  }, [state?.round, state?.winnerId]); // eslint-disable-line react-hooks/exhaustive-deps

  const myAlive = !!state?.order.includes(player.id);

  useEffect(() => {
    const gameOver = !challenge?.active || state?.phase === "gameOver" || (state && !myAlive);
    if (gameOver && state && !reportedRef.current) {
      reportedRef.current = true;
      reportScore(gameId, round.round, player.id, player.name, placementValue(state, player.id), { final: true });
    }
  }, [challenge?.active, state]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!challenge?.active) {
    const myScore = state ? placementValue(state, player.id) : 0;
    return <GameResultCard icon="🐙" title="The Scylla's The Limit" valueLabel={`Score: ${myScore}`} />;
  }
  if (!state) return <Card style={{ marginBottom: 20, textAlign: "center" }}><p style={{ color: "#6b4f99", fontStyle: "italic" }}>Loading...</p></Card>;

  const iWon = state.winnerId === player.id;
  if (state.phase === "gameOver" || !myAlive) {
    const elimRound = state.eliminatedInRound?.[player.id];
    return (
      <GameResultCard
        icon={iWon ? "🏆" : "🐙"}
        title={iWon ? "Through the Strait!" : "Lost to Scylla"}
        valueLabel={iWon ? "You won" : elimRound ? `Eliminated in round ${elimRound}` : "Game over"}
      />
    );
  }

  const hand = state.hands[player.id] || [];
  const myPick = state.picks?.[player.id];
  const myPosition = state.order.indexOf(player.id);
  const myItems = state.itemsLeft[player.id] || [];
  const myDiscard = state.discards[player.id] || [];
  const result = state.phase === "resolved" ? state.lastRoundResult : null;
  const iWasBitten = result?.bitten === player.id;
  const iWasTied = result && !result.untiedIds.includes(player.id);

  const play = (card) => submitScyllaCard(gameId, round.round, player.id, card);

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🐙 The Scylla's The Limit</h3>
        <Badge color={myPosition === 0 ? "#00ff9d" : "#6b4f99"}>
          {myPosition === 0 ? "Front of the line!" : `${myPosition + 1} of ${state.order.length}`}
        </Badge>
      </div>

      <div style={{ fontSize: 20, marginBottom: 8 }}>
        {myItems.map((item, i) => <span key={i} title={item}>{ITEM_ICONS[item] || "❔"}</span>)}
        {myItems.length === 0 && <span style={{ fontSize: 12, color: "#ff3860" }}>No items left!</span>}
      </div>

      {result && (
        <p style={{ fontSize: 13, margin: "0 0 12px", color: iWasBitten ? "#ff3860" : iWasTied ? "#c9a84c" : "#00ff9d" }}>
          {iWasBitten
            ? `🐙 Scylla snatched ${result.itemLost}! Flung to the front — you got your played cards back.`
            : iWasTied
            ? "You tied someone's number — no move this round."
            : "You moved up in the line!"}
        </p>
      )}

      {myDiscard.length > 0 && (
        <p style={{ color: "#6b4f99", fontSize: 11, margin: "0 0 10px" }}>Your face-up pile (everyone can see): {myDiscard.join(", ")}</p>
      )}

      {myPick != null ? (
        <p style={{ color: "#a68fd6", fontSize: 14, fontStyle: "italic" }}>You played {myPick} — waiting on everyone else...</p>
      ) : (
        <>
          <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 10px" }}>
            Pick a card — the lowest number to go unmatched moves first, but the highest unmatched number ends up safest at the very front.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
            {hand.slice().sort((a, b) => a - b).map((card) => (
              <button key={card} onClick={() => play(card)} style={{
                width: 44, height: 56, borderRadius: 8, border: "2px solid #00d9ff", background: "rgba(0,217,255,0.1)",
                color: "#00d9ff", fontSize: 20, fontWeight: 800, cursor: "pointer", fontFamily: "'Orbitron', 'Segoe UI', sans-serif",
              }}>
                {card}
              </button>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
