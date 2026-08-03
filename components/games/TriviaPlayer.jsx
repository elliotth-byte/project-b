import { useState, useEffect, useRef } from "react";
import { Card, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { pickTriviaQuestions } from "../../lib/games/triviaData";
import { reportScore } from "../../lib/challengeScores";

export default function TriviaPlayer({ gameId, round, challenge, player }) {
  const cfg = challenge?.gameConfig || { questions: 10, secPerQuestion: 10 };
  const seed = (challenge?.startedAt || 1) + (player?.id ? player.id.length : 0);
  const [questions] = useState(() => pickTriviaQuestions(seed, cfg.questions || 10));
  const [index, setIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [selected, setSelected] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [secLeft, setSecLeft] = useState(cfg.secPerQuestion || 10);
  const [done, setDone] = useState(false);
  const reportedRef = useRef(false);

  const current = questions[index];

  useEffect(() => {
    if (done || revealed) return;
    if (secLeft <= 0) { lockAnswer(null); return; }
    const t = window.setTimeout(() => setSecLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [secLeft, done, revealed]); // eslint-disable-line react-hooks/exhaustive-deps

  const lockAnswer = (choiceIdx) => {
    if (revealed) return;
    setSelected(choiceIdx);
    setRevealed(true);
    const correct = choiceIdx === current.answer;
    if (correct) setCorrectCount((c) => c + 1);

    window.setTimeout(() => {
      const nextIndex = index + 1;
      if (nextIndex >= questions.length) {
        setDone(true);
      } else {
        setIndex(nextIndex);
        setSelected(null);
        setRevealed(false);
        setSecLeft(cfg.secPerQuestion || 10);
      }
    }, 900);
  };

  useEffect(() => {
    if (done && !reportedRef.current) {
      reportedRef.current = true;
      reportScore(gameId, round.round, player.id, player.name, correctCount, { final: true });
    }
  }, [done, correctCount]); // eslint-disable-line react-hooks/exhaustive-deps

  if (done) {
    return <GameResultCard icon="❓" title="Trivia Complete" valueLabel={`${correctCount}/${questions.length} correct`} />;
  }

  return (
    <Card style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ color: "#c9a84c", margin: 0, fontSize: 15, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>❓ Trivia</h3>
        <Badge color={secLeft <= 3 ? "#c45c3c" : "#c9a84c"}>{secLeft}s</Badge>
      </div>
      <p style={{ color: "#706050", fontSize: 11, margin: "0 0 8px" }}>Question {index + 1} of {questions.length} — {correctCount} correct so far</p>
      <p style={{ color: "#f0e6d3", fontSize: 16, fontWeight: 600, margin: "0 0 14px", fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>{current.q}</p>
      <div style={{ display: "grid", gap: 8 }}>
        {current.options.map((opt, i) => {
          let bg = "#0a1020", border = "#253550", color = "#f0e6d3";
          if (revealed) {
            if (i === current.answer) { bg = "rgba(122,154,92,0.15)"; border = "#7a9a5c"; color = "#7a9a5c"; }
            else if (i === selected) { bg = "rgba(196,92,60,0.15)"; border = "#c45c3c"; color = "#c45c3c"; }
          }
          return (
            <button key={i} onClick={() => lockAnswer(i)} disabled={revealed} style={{
              textAlign: "left", padding: "10px 14px", borderRadius: 8, cursor: revealed ? "default" : "pointer",
              background: bg, border: `2px solid ${border}`, color, fontSize: 14, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif",
            }}>{opt}</button>
          );
        })}
      </div>
    </Card>
  );
}
