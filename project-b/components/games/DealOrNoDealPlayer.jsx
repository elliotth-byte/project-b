import { useState, useEffect } from "react";
import { Card, Badge, Btn } from "../ui";
import GameResultCard from "./GameResultCard";
import { reportScore } from "../../lib/challengeScores";
import {
  ROUND_OPEN_COUNTS, formatMoney, initDondState, pickCase, openCase,
  acceptDeal as acceptDealAction, declineDeal as declineDealAction, subscribeDondState,
} from "../../lib/games/dealOrNoDealData";

// See lib/games/dealOrNoDealData.js's own header comment for the full
// story on why this component no longer holds any of the game's real
// state itself — everything here just reads a subscribed, server-
// persisted state and calls the corresponding server-side action.
// Deliberately NOT a local useState for caseValues/myCase/openedIndices
// the way this used to be; that was exactly what made this game
// exploitable via a reload.
export default function DealOrNoDealPlayer({ gameId, round, challenge, player }) {
  const seed = (challenge?.startedAt || 1) + (player?.id ? player.id.split("-")[0].length : 0);
  const [state, setState] = useState(null);
  const [reported, setReported] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeDondState(gameId, round.round, player.id, setState);
    return unsubscribe;
  }, [gameId, round.round, player.id]);

  useEffect(() => {
    if (!state) initDondState(gameId, round.round, player.id, seed);
  }, [state, gameId, round.round, player.id, seed]);

  useEffect(() => {
    if (state?.done && state?.dealtAt && !reported) {
      setReported(true);
      reportScore(gameId, round.round, player.id, player.name, state.dealtAt.amount, { final: true });
    }
  }, [state?.done, state?.dealtAt, reported]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!state) {
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <p style={{ color: "#6b4f99", fontSize: 12, fontStyle: "italic" }}>Loading...</p>
      </Card>
    );
  }

  if (state.done && state.dealtAt) {
    return (
      <GameResultCard
        icon="💼"
        title={state.dealtAt.swapped != null ? (state.dealtAt.swapped ? "Swapped!" : "Kept Your Case") : "Deal!"}
        valueLabel={formatMoney(state.dealtAt.amount)}
      />
    );
  }

  if (state.myCase == null) {
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <h3 style={{ color: "#ff2d95", margin: "0 0 6px", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>💼 Deal or No Deal</h3>
        <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 14px" }}>Pick your case first — you'll keep it sealed until the very end (or until you deal it away).</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
          {state.caseValues.map((_, i) => (
            <button key={i} onClick={() => pickCase(gameId, round.round, player.id, i)} style={{
              aspectRatio: "1", borderRadius: 10, cursor: "pointer", background: "#0d0618", border: "2px solid #3d1f5c",
              color: "#f5f0ff", fontSize: 16, fontWeight: 900, fontFamily: "'Orbitron', 'Segoe UI', sans-serif",
            }}>{i + 1}</button>
          ))}
        </div>
      </Card>
    );
  }

  const acceptDeal = () => acceptDealAction(gameId, round.round, player.id);
  const declineDeal = () => declineDealAction(gameId, round.round, player.id);

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>💼 Deal or No Deal</h3>
        <Badge>Your case: #{state.myCase + 1}</Badge>
      </div>

      {state.offer ? (
        <div>
          <p style={{ color: "#a68fd6", fontSize: 13, margin: "0 0 6px" }}>
            {state.offer.isFinal ? "Final decision — keep your case, or swap for the last one on the table?" : "The banker calls..."}
          </p>
          <div style={{ fontSize: 32, fontWeight: 900, color: "#00ff9d", fontFamily: "'Orbitron', 'Segoe UI', sans-serif", margin: "8px 0 16px" }}>
            {formatMoney(state.offer.amount)}
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <Btn onClick={acceptDeal}>{state.offer.isFinal ? "Swap" : "Deal"}</Btn>
            <Btn variant="ghost" onClick={declineDeal}>{state.offer.isFinal ? "Keep Mine" : "No Deal"}</Btn>
          </div>
        </div>
      ) : (
        <>
          <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 10px" }}>
            Open {ROUND_OPEN_COUNTS[Math.min(state.roundIndex, ROUND_OPEN_COUNTS.length - 1)] - state.openedThisRound} more case
            {ROUND_OPEN_COUNTS[Math.min(state.roundIndex, ROUND_OPEN_COUNTS.length - 1)] - state.openedThisRound === 1 ? "" : "s"} for the next offer.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6, marginBottom: 12 }}>
            {state.caseValues.map((v, i) => {
              const isMine = i === state.myCase;
              const isOpen = state.openedIndices.includes(i);
              return (
                <button
                  key={i} onClick={() => openCase(gameId, round.round, player.id, i)} disabled={isMine || isOpen}
                  style={{
                    aspectRatio: "1", borderRadius: 10, cursor: (isMine || isOpen) ? "default" : "pointer",
                    background: isMine ? "rgba(255,45,149,0.15)" : isOpen ? "#1a0a2e" : "#0d0618",
                    border: `2px solid ${isMine ? "#ff2d95" : "#3d1f5c"}`,
                    color: isMine ? "#ff2d95" : isOpen ? "#6b4f99" : "#f5f0ff",
                    fontSize: isOpen ? 10 : 15, fontWeight: 900, fontFamily: "'Orbitron', 'Segoe UI', sans-serif",
                    opacity: isOpen ? 0.6 : 1,
                  }}
                >
                  {isOpen ? formatMoney(v) : isMine ? "★" : i + 1}
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 4 }}>
            {state.caseValues.map((v, i) => (
              <span key={i} style={{
                fontSize: 10, padding: "2px 6px", borderRadius: 4,
                color: state.openedIndices.includes(i) ? "#3d1f5c" : "#a68fd6",
                textDecoration: state.openedIndices.includes(i) ? "line-through" : "none",
              }}>{formatMoney(v)}</span>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
