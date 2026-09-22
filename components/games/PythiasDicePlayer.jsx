import { useState, useEffect, useRef } from "react";
import { Card, Btn, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { useCountdown } from "./useCountdown";
import { reportScore } from "../../lib/challengeScores";
import {
  CATEGORIES, CATEGORY_LABELS, UPPER_CATEGORIES, UPPER_BONUS, UPPER_BONUS_THRESHOLD,
  ROUNDS, MAX_ROLLS_PER_ROUND, scoreAllCategories, isYahtzeeRoll, upperSubtotal, upperBonusEarned,
  computeTotal, rollDie, rollDice, DIE_FACES,
} from "../../lib/games/pythiasDiceData";

function emptyScorecard() {
  const sc = {};
  CATEGORIES.forEach((c) => { sc[c] = null; });
  return sc;
}

export default function PythiasDicePlayer({ gameId, round, challenge, player }) {
  const { timeUp } = useCountdown(challenge?.endsAt);
  const [scorecard, setScorecard] = useState(emptyScorecard);
  const [yahtzeeBonusCount, setYahtzeeBonusCount] = useState(0);
  const [roundNum, setRoundNum] = useState(1); // 1-indexed, capped at ROUNDS
  const [dice, setDice] = useState(null); // null until the round's first roll
  const [holds, setHolds] = useState([false, false, false, false, false]);
  const [rollsUsed, setRollsUsed] = useState(0);
  const [done, setDone] = useState(false);
  const reportedRef = useRef(false);
  const doneRef = useRef(false);

  const total = computeTotal(scorecard, yahtzeeBonusCount);

  useEffect(() => {
    reportScore(gameId, round.round, player.id, player.name, total, { final: false });
  }, [total]); // eslint-disable-line react-hooks/exhaustive-deps

  const finish = () => {
    if (reportedRef.current) return;
    reportedRef.current = true;
    doneRef.current = true;
    setDone(true);
    reportScore(gameId, round.round, player.id, player.name, computeTotal(scorecard, yahtzeeBonusCount), { final: true });
  };

  useEffect(() => {
    if (timeUp && !doneRef.current) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeUp]);

  const roll = () => {
    if (doneRef.current || rollsUsed >= MAX_ROLLS_PER_ROUND) return;
    setDice((prev) => (prev ? prev.map((v, i) => (holds[i] ? v : rollDie())) : rollDice(5)));
    setRollsUsed((r) => r + 1);
  };

  const toggleHold = (i) => {
    if (doneRef.current || !dice || rollsUsed === 0 || rollsUsed >= MAX_ROLLS_PER_ROUND) return;
    setHolds((h) => h.map((v, idx) => (idx === i ? !v : v)));
  };

  const chooseCategory = (catKey) => {
    if (doneRef.current || !dice || rollsUsed === 0 || scorecard[catKey] !== null) return;
    const scores = scoreAllCategories(dice);
    const scoreForCat = scores[catKey];
    // Yahtzee bonus: this roll is itself a Yahtzee (all 5 the same face)
    // AND the Yahtzee category has already been scored with real points
    // (50) earlier in the game — a second-or-later Yahtzee earns a flat
    // 100-point bonus on top of whatever category this roll is assigned
    // to, per standard rules. A player's FIRST Yahtzee, even if they
    // choose not to put it in the Yahtzee category, never earns this —
    // scorecard.yahtzee is still null (unfilled) at that point, not 50.
    const earnsBonus = isYahtzeeRoll(dice) && scorecard.yahtzee === 50;

    const nextScorecard = { ...scorecard, [catKey]: scoreForCat };
    setScorecard(nextScorecard);
    if (earnsBonus) setYahtzeeBonusCount((n) => n + 1);

    setDice(null);
    setHolds([false, false, false, false, false]);
    setRollsUsed(0);

    if (roundNum >= ROUNDS) {
      // Report the exact post-commit total, not the (stale, pre-render)
      // `total` from this closure.
      const bonusCount = yahtzeeBonusCount + (earnsBonus ? 1 : 0);
      if (!reportedRef.current) {
        reportedRef.current = true;
        doneRef.current = true;
        setDone(true);
        reportScore(gameId, round.round, player.id, player.name, computeTotal(nextScorecard, bonusCount), { final: true });
      }
    } else {
      setRoundNum((r) => r + 1);
    }
  };

  if (done) {
    return <GameResultCard icon="🔮" title="The Pythia's Dice — Complete" valueLabel={`${total} points`} />;
  }

  const previews = dice ? scoreAllCategories(dice) : null;
  const canRoll = !!dice ? rollsUsed < MAX_ROLLS_PER_ROUND : true;
  const canPick = !!dice && rollsUsed > 0;
  const upperSub = upperSubtotal(scorecard);
  const gotUpperBonus = upperBonusEarned(scorecard);

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🔮 The Pythia's Dice</h3>
        <Badge color="#a68fd6">Round {roundNum} / {ROUNDS}</Badge>
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <Badge color="#ff2d95">Total: {total}</Badge>
        <Badge color="#00d9ff">Upper: {upperSub}/{UPPER_BONUS_THRESHOLD}{gotUpperBonus ? " ✓ +35" : ""}</Badge>
        {yahtzeeBonusCount > 0 && <Badge color="#00ff9d">Yahtzee Bonus x{yahtzeeBonusCount}</Badge>}
      </div>

      <p style={{ color: "#a68fd6", fontSize: 11, margin: "0 0 10px", fontStyle: "italic" }}>
        {!dice
          ? "Roll to see this round's dice."
          : rollsUsed >= MAX_ROLLS_PER_ROUND
          ? "Final roll used — tap a category below to lock it in."
          : "Tap dice to hold them, then reroll the rest, or tap a category to lock in now."}
      </p>

      <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 12 }}>
        {(dice || [0, 0, 0, 0, 0]).map((v, i) => (
          <button
            key={i}
            onClick={() => toggleHold(i)}
            disabled={!dice}
            style={{
              width: 46, height: 46, fontSize: 26, borderRadius: 8, cursor: dice ? "pointer" : "default",
              background: holds[i] && dice ? "linear-gradient(160deg, rgba(0,255,157,0.28), rgba(0,255,157,0.1))" : "linear-gradient(160deg, #211a38, #0f0a1e)",
              border: `2px solid ${holds[i] && dice ? "#00ff9d" : "#3d1f5c"}`,
              color: "#f5f0ff", display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            {dice ? DIE_FACES[v] : "🎲"}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 14 }}>
        <Btn onClick={roll} disabled={!canRoll}>
          {!dice ? "Roll" : `Reroll (${MAX_ROLLS_PER_ROUND - rollsUsed} left)`}
        </Btn>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "4px 10px", textAlign: "left", fontSize: 12 }}>
        {CATEGORIES.map((cat) => {
          const filled = scorecard[cat] !== null;
          const previewVal = previews ? previews[cat] : null;
          const isUpper = UPPER_CATEGORIES.includes(cat);
          return (
            <div
              key={cat}
              onClick={() => !filled && canPick && chooseCategory(cat)}
              style={{
                display: "contents",
                cursor: !filled && canPick ? "pointer" : "default",
              }}
            >
              <div
                onClick={() => !filled && canPick && chooseCategory(cat)}
                style={{
                  padding: "6px 8px", borderRadius: 6, color: filled ? "#6b4f99" : "#f5f0ff",
                  background: filled ? "rgba(107,79,153,0.08)" : !filled && canPick ? "rgba(255,45,149,0.08)" : "transparent",
                  border: `1px solid ${filled ? "#2a1f42" : "#3d1f5c"}`,
                  fontStyle: isUpper ? "normal" : "normal",
                }}
              >
                {CATEGORY_LABELS[cat]}
              </div>
              <div
                onClick={() => !filled && canPick && chooseCategory(cat)}
                style={{
                  padding: "6px 8px", borderRadius: 6, minWidth: 34, textAlign: "right", fontWeight: 700,
                  color: filled ? "#00ff9d" : canPick ? "#ff2d95" : "#3d1f5c",
                  background: filled ? "rgba(0,255,157,0.06)" : "transparent",
                  border: `1px solid ${filled ? "#1d4d3a" : "transparent"}`,
                }}
              >
                {filled ? scorecard[cat] : canPick ? previewVal : "–"}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
