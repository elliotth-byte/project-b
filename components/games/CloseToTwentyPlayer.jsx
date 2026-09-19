import { useState, useEffect, useRef } from "react";
import { Card, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { useCountdown } from "./useCountdown";
import { reportScore } from "../../lib/challengeScores";
import {
  subscribeCloseToTwenty, submitDistribution, revealBanks, placementValue, STARTING_COINS, TARGET,
} from "../../lib/games/closeToTwentyData";

export default function CloseToTwentyPlayer({ gameId, round, challenge, player, players }) {
  const [state, setState] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [amounts, setAmounts] = useState({}); // { [targetId]: number }
  const { timeUp } = useCountdown(challenge?.endsAt);
  const reportedRef = useRef(false);

  useEffect(() => {
    const unsubscribe = subscribeCloseToTwenty(gameId, round.round, (v) => { setState(v); setLoaded(true); });
    return unsubscribe;
  }, [gameId, round.round]);

  const byName = (id) => players?.find((p) => p.id === id)?.display_name || "?";

  const iHaveSubmitted = state?.submittedIds?.includes(player.id);

  // Any connected client (not just participants — a spectator's screen
  // works too) checks whether it's time to reveal, same "any client
  // drives shared state forward" pattern as the other live games here.
  useEffect(() => {
    if (!state || state.revealed) return;
    const everyoneIn = state.submittedIds.length >= state.participantIds.length;
    if (everyoneIn || timeUp) revealBanks(gameId, round.round);
  }, [state, timeUp, gameId, round.round]);

  useEffect(() => {
    if (!state?.revealed || reportedRef.current) return;
    reportedRef.current = true;
    reportScore(gameId, round.round, player.id, player.name, placementValue(state, player.id), { final: true });
  }, [state?.revealed]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = Object.values(amounts).reduce((s, n) => s + (n || 0), 0);
  const distinctCount = Object.values(amounts).filter((n) => (n || 0) > 0).length;
  const remaining = STARTING_COINS - total;
  const canSubmit = total === STARTING_COINS && distinctCount >= 2;

  const setAmount = (targetId, value) => {
    const n = Math.max(0, Math.min(STARTING_COINS, parseInt(value, 10) || 0));
    setAmounts((a) => ({ ...a, [targetId]: n }));
  };

  const submit = async () => {
    if (!canSubmit) return;
    const deposits = Object.entries(amounts).filter(([, n]) => n > 0).map(([targetId, amount]) => ({ targetId, amount }));
    await submitDistribution(gameId, round.round, player.id, deposits);
    setAmounts({});
  };

  if (!challenge?.active) return null;
  if (state === null && !loaded) {
    return <Card style={{ marginBottom: 20, textAlign: "center" }}><p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic" }}>Loading...</p></Card>;
  }
  if (state === null && loaded) {
    return <GameResultCard icon="🐷" title="Not Enough Players" valueLabel="No one to bank with" />;
  }

  if (state.revealed) {
    const myBank = state.banks[player.id] || 0;
    const iAmBusted = state.busted.includes(player.id);
    // Once revealed, every participant's own bank is shown, not just
    // this player's own — a competitive, simultaneous-reveal game
    // showing only "how did I do" and never "how did I do relative to
    // everyone else" leaves the actual result of the game a mystery
    // even after it's supposedly over. Sorted by the real win
    // condition: closest to TARGET without busting first, then the
    // rest of the non-busted players descending, busted players last
    // (their own relative order among themselves doesn't matter, they
    // all lost the same way).
    const ranked = [...state.participantIds].sort((a, b) => {
      const aBusted = state.busted.includes(a), bBusted = state.busted.includes(b);
      if (aBusted !== bBusted) return aBusted ? 1 : -1;
      return (state.banks[b] || 0) - (state.banks[a] || 0);
    });
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <div style={{ fontSize: 28, marginBottom: 6 }}>🐷</div>
        <h3 style={{ color: "#f5f0ff", margin: "0 0 4px", fontSize: 15 }}>{iAmBusted ? "Busted!" : "Piggy Bank Final"}</h3>
        <p style={{ color: iAmBusted ? "#ff3860" : "#00ff9d", fontSize: 13, margin: "0 0 14px", fontWeight: 700 }}>
          You: {iAmBusted ? `Went over ${TARGET} (${myBank})` : `${myBank}/${TARGET}`}
        </p>
        <div style={{ display: "grid", gap: 4, textAlign: "left" }}>
          {ranked.map((id, i) => {
            const busted = state.busted.includes(id);
            const amt = state.banks[id] || 0;
            const isMe = id === player.id;
            return (
              <div key={id} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "6px 10px", borderRadius: 6,
                background: isMe ? "rgba(255,45,149,0.12)" : "#0d0618",
                border: `1px solid ${isMe ? "#ff2d95" : "#3d1f5c"}`,
              }}>
                <span style={{ fontSize: 13, color: "#f5f0ff" }}>
                  {!busted && i === 0 && "👑 "}{byName(id)}{isMe ? " (you)" : ""}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: busted ? "#ff3860" : "#f5f0ff" }}>
                  {busted ? `${amt} (bust)` : amt}
                </span>
              </div>
            );
          })}
        </div>
      </Card>
    );
  }

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🐷 Close to 20</h3>
        <Badge>{state.submittedIds.length}/{state.participantIds.length} decided</Badge>
      </div>
      <p style={{ color: "#6b4f99", fontSize: 11, margin: "0 0 12px", fontStyle: "italic" }}>
        Every bank — including your own — is a total mystery until everyone's decided. Closest to 20 without going over wins.
      </p>

      {iHaveSubmitted ? (
        <p style={{ color: "#a68fd6", fontSize: 13 }}>Your coins are placed — waiting on everyone else before the reveal.</p>
      ) : (
        <div>
          <p style={{ color: "#f5f0ff", fontSize: 13, margin: "0 0 4px" }}>Distribute all {STARTING_COINS} coins across at least 2 banks.</p>
          <p style={{ color: remaining === 0 ? "#00ff9d" : "#ffd700", fontSize: 12, margin: "0 0 10px" }}>{remaining} coin{remaining === 1 ? "" : "s"} left to place</p>
          <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
            {state.participantIds.map((id) => (
              <div key={id} style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, color: "#f5f0ff" }}>{byName(id)}{id === player.id ? " (you)" : ""}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button onClick={() => setAmount(id, (amounts[id] || 0) - 1)} style={stepBtn}>−</button>
                  <span style={{ width: 24, textAlign: "center", fontSize: 14, color: "#f5f0ff", fontWeight: 700 }}>{amounts[id] || 0}</span>
                  <button onClick={() => setAmount(id, (amounts[id] || 0) + 1)} style={stepBtn}>+</button>
                </div>
              </div>
            ))}
          </div>
          <button onClick={submit} disabled={!canSubmit} style={{
            padding: "10px 24px", borderRadius: 8, cursor: canSubmit ? "pointer" : "default",
            background: canSubmit ? "linear-gradient(135deg, #ff2d95, #b829ff)" : "#3d1f5c",
            color: canSubmit ? "#05010f" : "#6b4f99", border: "none", fontSize: 14, fontWeight: 700,
          }}>Lock It In</button>
        </div>
      )}
    </Card>
  );
}

const stepBtn = {
  width: 28, height: 28, borderRadius: 6, background: "#0d0618", border: "1px solid #3d1f5c",
  color: "#f5f0ff", fontSize: 16, cursor: "pointer", lineHeight: 1,
};
