import { useState, useEffect, useRef } from "react";
import { Card, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { useCountdown } from "./useCountdown";
import { reportScore } from "../../lib/challengeScores";
import { buildQuestionPool, buildQuestions } from "../../lib/games/seasonTriviaData";

const SEC_PER_QUESTION = 15;

// ─── Season Trivia ───
// See lib/games/seasonTriviaData.js for the real question-generation
// logic and the "not enough history yet" gating. This file is purely
// the sequential quiz flow — same shape as components/games/TriviaPlayer.jsx,
// just without a difficulty pick step, since "how hard is this
// question" isn't a meaningful choice for something drawn from the
// season's own real events.
export default function SeasonTriviaPlayer({ gameId, round, challenge, player, challengeHistory, exileHistory, players }) {
  const poolSeed = challenge?.startedAt || 1;
  const presentSeed = poolSeed + (player?.id ? player.id.length * 131 + player.id.charCodeAt(0) : 0);
  const pool = buildQuestionPool(challengeHistory, exileHistory, players);
  const [questions] = useState(() => buildQuestions(pool, poolSeed, presentSeed, new Map((players || []).map((p) => [p.id, p.display_name || p.name]))));
  const { timeUp } = useCountdown(challenge?.endsAt);

  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [selected, setSelected] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(false);
  const reportedRef = useRef(false);

  const current = questions[index];

  const lockAnswer = (choiceIdx) => {
    if (revealed || !current) return;
    setSelected(choiceIdx);
    setRevealed(true);
    if (choiceIdx === current.answer) setScore((s) => s + 1);
    window.setTimeout(() => {
      if (index + 1 >= questions.length) { setDone(true); return; }
      setIndex((i) => i + 1);
      setSelected(null);
      setRevealed(false);
    }, 1100);
  };

  // One question at a time, on its own short clock — running out just
  // counts as a miss and moves on, same as a live trivia night.
  const [secLeft, setSecLeft] = useState(SEC_PER_QUESTION);
  useEffect(() => { setSecLeft(SEC_PER_QUESTION); }, [index]);
  useEffect(() => {
    if (done || revealed || timeUp) return;
    if (secLeft <= 0) { lockAnswer(-1); return; }
    const t = window.setTimeout(() => setSecLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secLeft, done, revealed, timeUp]);

  useEffect(() => {
    reportScore(gameId, round.round, player.id, player.name, score, { final: false });
  }, [score]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if ((timeUp || done) && !reportedRef.current) {
      reportedRef.current = true;
      reportScore(gameId, round.round, player.id, player.name, score, { final: true });
    }
  }, [timeUp, done, score]); // eslint-disable-line react-hooks/exhaustive-deps

  if (questions.length === 0) {
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <div style={{ fontSize: 28, marginBottom: 6 }}>📜</div>
        <div style={{ fontSize: 12, letterSpacing: 4, textTransform: "uppercase", color: "#00ff9d" }}>Not Enough History Yet</div>
        <p style={{ color: "#6b4f99", fontSize: 12, marginTop: 10, fontStyle: "italic" }}>Season Trivia needs a few completed rounds of real history to draw questions from.</p>
      </Card>
    );
  }

  if (timeUp || done) {
    return <GameResultCard icon="📜" title="Quiz Complete" valueLabel={`${score}/${questions.length} correct`} />;
  }

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>📜 Season Trivia</h3>
        <Badge color={secLeft <= 5 ? "#ff3860" : "#ff2d95"}>{index + 1}/{questions.length} · {secLeft}s</Badge>
      </div>
      <p style={{ color: "#f5f0ff", fontSize: 15, fontWeight: 700, margin: "10px 0 14px" }}>{current.text}</p>
      <div style={{ display: "grid", gap: 8 }}>
        {current.options.map((opt, i) => {
          const isCorrect = revealed && i === current.answer;
          const isWrongPick = revealed && i === selected && i !== current.answer;
          return (
            <button
              key={i}
              onClick={() => lockAnswer(i)}
              disabled={revealed}
              style={{
                padding: "12px 14px", borderRadius: 8, textAlign: "left", fontSize: 13, fontWeight: 700,
                cursor: revealed ? "default" : "pointer",
                background: isCorrect ? "rgba(0,255,157,0.2)" : isWrongPick ? "rgba(255,56,96,0.2)" : "#0d0618",
                border: `2px solid ${isCorrect ? "#00ff9d" : isWrongPick ? "#ff3860" : "#3d1f5c"}`,
                color: "#f5f0ff",
              }}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </Card>
  );
}
