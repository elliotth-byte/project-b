import { useState, useEffect, useRef } from "react";
import { Card, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { reportScore } from "../../lib/challengeScores";
import {
  subscribeMasquerade, submitTargetChoice, submitResponse, advanceAfterReveal, placementValue,
} from "../../lib/games/masqueradeData";

export default function MasqueradePlayer({ gameId, round, challenge, player, players }) {
  const [state, setState] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [targetChoice, setTargetChoice] = useState(null);
  const [poisonChoice, setPoisonChoice] = useState(null); // true = offering the poisoned glass
  const [comment, setComment] = useState("");
  const reportedRef = useRef(new Set());

  useEffect(() => {
    const unsubscribe = subscribeMasquerade(gameId, round.round, (v) => { setState(v); setLoaded(true); });
    return unsubscribe;
  }, [gameId, round.round]);

  const byName = (id) => players?.find((p) => p.id === id)?.display_name || "?";

  // Only ever advances the reveal step (a display pause after a
  // decision's already been made) — no auto-deciding on anyone's behalf.
  // Any connected client does this, same "any client can drive shared
  // state forward" pattern as the Plinko duel bracket, just scoped here
  // to something that was never actually anyone's choice to make.
  useEffect(() => {
    if (!state || state.finalized) return;
    const interval = window.setInterval(() => {
      if (state.turn?.phase === "revealed") advanceAfterReveal(gameId, round.round);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [gameId, round.round, state]);

  // Report my own final score once I'm eliminated, or the whole game
  // wraps (natural winner, or the challenge's own timer runs out).
  useEffect(() => {
    if (!state || reportedRef.current.has(player.id)) return;
    const iAmEliminated = state.eliminated.includes(player.id);
    if (iAmEliminated || state.finalized) {
      reportedRef.current.add(player.id);
      reportScore(gameId, round.round, player.id, player.name, placementValue(state, player.id), { final: true });
    }
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!state || state.eliminated.includes(player.id) || state.finalized) return;
    reportScore(gameId, round.round, player.id, player.name, placementValue(state, player.id), { final: false });
  }, [state?.strikes]); // eslint-disable-line react-hooks/exhaustive-deps

  const doTargetChoice = async () => {
    if (!targetChoice || poisonChoice === null) return;
    await submitTargetChoice(gameId, round.round, player.id, targetChoice, poisonChoice, comment);
    setTargetChoice(null); setPoisonChoice(null); setComment("");
  };

  if (!challenge?.active) return null;
  if (state === null && !loaded) {
    return <Card style={{ marginBottom: 20, textAlign: "center" }}><p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic" }}>Loading...</p></Card>;
  }
  if (state === null && loaded) {
    return <GameResultCard icon="🍷" title="Not Enough Players" valueLabel="No one to poison" />;
  }

  const iAmEliminated = state.eliminated.includes(player.id);
  const strikes = state.strikes[player.id] || 0;

  if (state.finalized) {
    const won = !iAmEliminated;
    return <GameResultCard icon="🍷" title={won ? "Last One Standing!" : "Eliminated"} valueLabel={won ? "You survived" : `${strikes} strikes`} />;
  }

  if (iAmEliminated) {
    return <GameResultCard icon="☠️" title="Eliminated" valueLabel="Two poison strikes — you're out" />;
  }

  const turn = state.turn;
  const iAmActive = turn.activePlayerId === player.id;
  const iAmTarget = turn.phase === "responding" && turn.targetId === player.id;

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🍷 Murder at the Masquerade</h3>
        <Badge>{strikes}/2 strikes</Badge>
      </div>

      {turn.phase === "targeting" && iAmActive && (
        <div>
          <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 10px" }}>Pick who to offer a glass to, and which one you're offering them.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6, marginBottom: 12 }}>
            {state.order.filter((id) => id !== player.id && !state.eliminated.includes(id)).map((id) => (
              <button key={id} onClick={() => setTargetChoice(id)} style={{
                padding: "10px 8px", borderRadius: 8, cursor: "pointer",
                background: targetChoice === id ? "rgba(255,45,149,0.2)" : "#0d0618",
                border: `2px solid ${targetChoice === id ? "#ff2d95" : "#3d1f5c"}`,
                color: targetChoice === id ? "#ff2d95" : "#f5f0ff", fontSize: 13, fontWeight: 700,
              }}>{byName(id)}</button>
            ))}
          </div>
          {targetChoice && (
            <>
              <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 8px" }}>Which glass are you offering {byName(targetChoice)}?</p>
              <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 12 }}>
                <button onClick={() => setPoisonChoice(true)} style={{
                  padding: "10px 18px", borderRadius: 8, cursor: "pointer",
                  background: poisonChoice === true ? "rgba(255,56,96,0.2)" : "#0d0618",
                  border: `2px solid ${poisonChoice === true ? "#ff3860" : "#3d1f5c"}`,
                  color: poisonChoice === true ? "#ff3860" : "#f5f0ff", fontSize: 13, fontWeight: 700,
                }}>☠️ The Poisoned Glass</button>
                <button onClick={() => setPoisonChoice(false)} style={{
                  padding: "10px 18px", borderRadius: 8, cursor: "pointer",
                  background: poisonChoice === false ? "rgba(0,255,157,0.2)" : "#0d0618",
                  border: `2px solid ${poisonChoice === false ? "#00ff9d" : "#3d1f5c"}`,
                  color: poisonChoice === false ? "#00ff9d" : "#f5f0ff", fontSize: 13, fontWeight: 700,
                }}>🍷 The Safe Glass</button>
              </div>
              <input
                value={comment} onChange={(e) => setComment(e.target.value)} maxLength={140}
                placeholder="Optional taunt..."
                style={{ width: "100%", background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 6, padding: "8px 10px", color: "#f5f0ff", fontSize: 13, marginBottom: 10, boxSizing: "border-box" }}
              />
              <button onClick={doTargetChoice} disabled={poisonChoice === null} style={{
                padding: "10px 24px", borderRadius: 8, cursor: "pointer", background: "linear-gradient(135deg, #ff2d95, #b829ff)",
                border: "none", color: "#05010f", fontSize: 14, fontWeight: 700,
              }}>Offer It</button>
            </>
          )}
        </div>
      )}

      {turn.phase === "targeting" && !iAmActive && (
        <p style={{ color: "#a68fd6", fontSize: 13 }}>{byName(turn.activePlayerId)} is choosing who to target...</p>
      )}

      {turn.phase === "responding" && iAmTarget && (
        <div>
          <p style={{ color: "#f5f0ff", fontSize: 14, margin: "0 0 4px" }}>{byName(turn.activePlayerId)} offers you a glass.</p>
          {turn.comment && <p style={{ color: "#ff2d95", fontSize: 13, fontStyle: "italic", margin: "0 0 14px" }}>"{turn.comment}"</p>}
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button onClick={() => submitResponse(gameId, round.round, player.id, true)} style={{
              padding: "12px 20px", borderRadius: 8, cursor: "pointer", background: "#0d0618", border: "2px solid #3d1f5c",
              color: "#f5f0ff", fontSize: 13, fontWeight: 700,
            }}>Drink the Offered Glass</button>
            <button onClick={() => submitResponse(gameId, round.round, player.id, false)} style={{
              padding: "12px 20px", borderRadius: 8, cursor: "pointer", background: "#0d0618", border: "2px solid #3d1f5c",
              color: "#f5f0ff", fontSize: 13, fontWeight: 700,
            }}>Drink the Other One</button>
          </div>
        </div>
      )}

      {turn.phase === "responding" && !iAmTarget && (
        <p style={{ color: "#a68fd6", fontSize: 13 }}>
          {byName(turn.activePlayerId)} offered {byName(turn.targetId)} a glass — waiting on their choice...
        </p>
      )}

      {turn.phase === "revealed" && (
        <div>
          {turn.timedOut ? (
            // Server-side turn timeout (see roundEngine.js's
            // autoTimeoutMasquerade) — nothing was actually drunk, so
            // the normal poison-reveal text below would be actively
            // misleading here (targetDrankPoison/activeDrankPoison are
            // both null, which reads as falsy and would incorrectly
            // show "was safe" for both players in the SAME turn where
            // one of them just got eliminated).
            <p style={{ fontSize: 14, color: "#f5f0ff", margin: 0 }}>
              ⏱ {byName(turn.timedOutPlayerId)} took too long to {turn.timedOutPlayerId === turn.activePlayerId ? "choose" : "respond"} and was eliminated.
            </p>
          ) : (
            <>
              <p style={{ fontSize: 14, color: "#f5f0ff", margin: "0 0 6px" }}>
                {turn.targetDrankPoison ? `☠️ ${byName(turn.targetId)} drank the poison!` : `🍷 ${byName(turn.targetId)} was safe.`}
              </p>
              <p style={{ fontSize: 14, color: "#f5f0ff", margin: 0 }}>
                {turn.activeDrankPoison ? `☠️ ${byName(turn.activePlayerId)} drank the poison!` : `🍷 ${byName(turn.activePlayerId)} was safe.`}
              </p>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
