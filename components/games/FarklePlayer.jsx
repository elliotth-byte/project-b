import { useState, useEffect, useRef } from "react";
import { Card, Btn, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { useCountdown } from "./useCountdown";
import { scoreFarkleRoll, rollDice, DIE_FACES } from "../../lib/games/farkleData";
import { reportScore } from "../../lib/challengeScores";

export default function FarklePlayer({ gameId, round, challenge, player }) {
  const { timeUp } = useCountdown(challenge?.endsAt);
  const [runningTotal, setRunningTotal] = useState(0);
  const [turnScore, setTurnScore] = useState(0);
  const [lastRoll, setLastRoll] = useState(null); // face values from the most recent roll, for display only
  const [remaining, setRemaining] = useState(null); // dice available to reroll, or null before the turn starts
  const [message, setMessage] = useState("Roll to start your first turn.");
  const [canRoll, setCanRoll] = useState(true);
  const [done, setDone] = useState(false);
  const reportedRef = useRef(false);

  useEffect(() => {
    reportScore(gameId, round.round, player.id, player.name, runningTotal, { final: false });
  }, [runningTotal]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (timeUp && !reportedRef.current) {
      reportedRef.current = true;
      setDone(true);
      reportScore(gameId, round.round, player.id, player.name, runningTotal, { final: true });
    }
  }, [timeUp]); // eslint-disable-line react-hooks/exhaustive-deps

  const roll = (count) => {
    const values = rollDice(count);
    const { score, usedCount } = scoreFarkleRoll(values);
    setLastRoll(values);
    if (score === 0) {
      setMessage(`💥 FARKLE! You lose this turn's ${turnScore} unbanked points.`);
      setTurnScore(0);
      setCanRoll(false);
      window.setTimeout(() => { setLastRoll(null); setRemaining(null); setCanRoll(true); setMessage("Roll to start a new turn."); }, 1800);
      return;
    }
    const left = count - usedCount;
    const newTurnScore = turnScore + score;
    setTurnScore(newTurnScore);
    setRemaining(left);
    setMessage(left === 0
      ? `🔥 Hot dice! +${score}. Roll all 6 again or bank ${newTurnScore}.`
      : `+${score}! ${left} dice left to push your luck with, or bank ${newTurnScore}.`);
  };

  const rollAgain = () => roll(remaining === 0 ? 6 : remaining);

  const bank = () => {
    setRunningTotal((t) => t + turnScore);
    setTurnScore(0);
    setLastRoll(null);
    setRemaining(null);
    setMessage("Banked! Roll to start a new turn.");
  };

  if (done) {
    return <GameResultCard icon="🎲" title="Time's Up" valueLabel={`${runningTotal} banked`} />;
  }

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <h3 style={{ color: "#c9a84c", margin: "0 0 8px", fontSize: 15, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>🎲 Farkle</h3>
      <div style={{ display: "flex", justifyContent: "center", gap: 14, marginBottom: 10 }}>
        <Badge color="#c9a84c">Banked: {runningTotal}</Badge>
        <Badge color="#7a9a5c">This turn: {turnScore}</Badge>
      </div>
      <p style={{ color: "#a09080", fontSize: 12, margin: "0 0 12px", minHeight: 32 }}>{message}</p>
      {lastRoll && (
        <div style={{ fontSize: 30, marginBottom: 12, letterSpacing: 4 }}>
          {lastRoll.map((v, i) => <span key={i}>{DIE_FACES[v]}</span>)}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
        {canRoll && (
          <Btn onClick={remaining === null ? () => roll(6) : rollAgain}>
            {remaining === null ? "Roll 6 Dice" : `Roll ${remaining === 0 ? "All 6" : remaining}`}
          </Btn>
        )}
        {turnScore > 0 && canRoll && <Btn variant="success" onClick={bank}>Bank {turnScore}</Btn>}
      </div>
    </Card>
  );
}
