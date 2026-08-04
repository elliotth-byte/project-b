import { useState, useEffect, useRef } from "react";
import { Card, Btn, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { useCountdown } from "./useCountdown";
import { scoreFarkleRoll, rollDice, DIE_FACES } from "../../lib/games/farkleData";
import { reportScore } from "../../lib/challengeScores";

const MAX_ROUNDS = 10;

export default function FarklePlayer({ gameId, round, challenge, player }) {
  const { timeUp } = useCountdown(challenge?.endsAt);
  const [runningTotal, setRunningTotal] = useState(0);
  const [turnScore, setTurnScore] = useState(0);
  const [lastRoll, setLastRoll] = useState(null); // face values from the most recent roll, for display only
  const [remaining, setRemaining] = useState(null); // dice available to reroll, or null before the turn starts
  const [message, setMessage] = useState("Roll to start round 1.");
  const [canRoll, setCanRoll] = useState(true);
  const [roundNum, setRoundNum] = useState(1); // 1-indexed, capped at MAX_ROUNDS
  const [done, setDone] = useState(false);
  const reportedRef = useRef(false);
  const doneRef = useRef(false);

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

  // A turn ending — by farkling or banking — is what advances the round
  // counter. Once MAX_ROUNDS turns are used up, the game ends on its own,
  // independent of whatever time is left on the outer challenge clock.
  const endTurn = () => {
    if (roundNum >= MAX_ROUNDS) {
      if (!reportedRef.current) {
        reportedRef.current = true;
        doneRef.current = true;
        setDone(true);
        reportScore(gameId, round.round, player.id, player.name, runningTotal, { final: true });
      }
      return;
    }
    setRoundNum((r) => r + 1);
  };

  const roll = (count) => {
    if (doneRef.current) return;
    const values = rollDice(count);
    const { score, usedCount } = scoreFarkleRoll(values);
    setLastRoll(values);
    if (score === 0) {
      setMessage(`💥 FARKLE! You lose this turn's ${turnScore} unbanked points.`);
      setTurnScore(0);
      setCanRoll(false);
      window.setTimeout(() => {
        setLastRoll(null); setRemaining(null); setCanRoll(true);
        endTurn();
        setMessage(roundNum >= MAX_ROUNDS ? "Game over." : `Round ${Math.min(roundNum + 1, MAX_ROUNDS)} of ${MAX_ROUNDS} — roll to start.`);
      }, 1800);
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
    endTurn();
    setMessage(roundNum >= MAX_ROUNDS ? "Game over." : `Banked! Round ${Math.min(roundNum + 1, MAX_ROUNDS)} of ${MAX_ROUNDS} — roll to start.`);
  };

  if (done) {
    return <GameResultCard icon="🎲" title="Farkle Complete" valueLabel={`${runningTotal} banked`} />;
  }

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🎲 Farkle</h3>
        <Badge color="#a68fd6">Round {roundNum} / {MAX_ROUNDS}</Badge>
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 14, marginBottom: 10 }}>
        <Badge color="#ff2d95">Banked: {runningTotal}</Badge>
        <Badge color="#00ff9d">This turn: {turnScore}</Badge>
      </div>
      <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 12px", minHeight: 32 }}>{message}</p>
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
