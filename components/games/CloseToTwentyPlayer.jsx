import { useState, useEffect, useRef } from "react";
import { Card, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { reportScore } from "../../lib/challengeScores";
import {
  subscribeCloseToTwenty, submitDistribution, placementValue, STARTING_COINS, TARGET,
} from "../../lib/games/closeToTwentyData";

export default function CloseToTwentyPlayer({ gameId, round, challenge, player, players }) {
  const [state, setState] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [amounts, setAmounts] = useState({}); // { [targetId]: number }
  const reportedRef = useRef(new Set());

  useEffect(() => {
    const unsubscribe = subscribeCloseToTwenty(gameId, round.round, (v) => { setState(v); setLoaded(true); });
    return unsubscribe;
  }, [gameId, round.round]);

  const byName = (id) => players?.find((p) => p.id === id)?.display_name || "?";

  const myTurn = state?.order?.[state?.activeIndex] === player.id;
  const alreadyWent = state?.turnsTaken?.includes(player.id);

  useEffect(() => {
    if (!state || reportedRef.current.has(player.id)) return;
    if (alreadyWent || state.finalized) {
      reportedRef.current.add(player.id);
      reportScore(gameId, round.round, player.id, player.name, placementValue(state, player.id), { final: true });
    }
  }, [state, alreadyWent]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const myBank = state.banks[player.id] || 0;
  const iAmBusted = state.busted.includes(player.id);

  if (state.finalized) {
    return (
      <GameResultCard
        icon="🐷"
        title={iAmBusted ? "Busted!" : "Piggy Bank Final"}
        valueLabel={iAmBusted ? `Went over 20 (${myBank})` : `${myBank}/${TARGET}`}
      />
    );
  }

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🐷 Close to 20</h3>
        <Badge color={iAmBusted ? "#ff3860" : "#ff2d95"}>Your bank: {myBank}{iAmBusted ? " (busted)" : ""}</Badge>
      </div>
      <p style={{ color: "#6b4f99", fontSize: 11, margin: "0 0 10px", fontStyle: "italic" }}>
        Closest to 20 without going over wins. Go over, and you're busted — out of contention, but you still get your turn.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 4, marginBottom: 10, textAlign: "left" }}>
        {state.order.map((id) => (
          <div key={id} style={{
            fontSize: 11, padding: "4px 8px", borderRadius: 6,
            background: state.busted.includes(id) ? "rgba(255,56,96,0.1)" : "#0d0618",
            color: state.busted.includes(id) ? "#ff3860" : "#a68fd6",
          }}>
            {byName(id)}: {state.banks[id] || 0}{state.busted.includes(id) ? " 💥" : ""}
          </div>
        ))}
      </div>

      {myTurn && !alreadyWent ? (
        <div>
          <p style={{ color: "#f5f0ff", fontSize: 13, margin: "0 0 4px" }}>Your turn — distribute all {STARTING_COINS} coins across at least 2 banks.</p>
          <p style={{ color: remaining === 0 ? "#00ff9d" : "#ffd700", fontSize: 12, margin: "0 0 10px" }}>{remaining} coin{remaining === 1 ? "" : "s"} left to place</p>
          <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
            {state.order.filter((id) => !state.busted.includes(id)).map((id) => (
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
          }}>Deposit</button>
        </div>
      ) : alreadyWent ? (
        <p style={{ color: "#a68fd6", fontSize: 13 }}>You've had your turn — waiting on everyone else.</p>
      ) : (
        <p style={{ color: "#a68fd6", fontSize: 13 }}>{byName(state.order[state.activeIndex])} is distributing their coins...</p>
      )}
    </Card>
  );
}

const stepBtn = {
  width: 28, height: 28, borderRadius: 6, background: "#0d0618", border: "1px solid #3d1f5c",
  color: "#f5f0ff", fontSize: 16, cursor: "pointer", lineHeight: 1,
};
