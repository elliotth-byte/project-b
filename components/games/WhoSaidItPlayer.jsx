import { useState, useEffect, useRef } from "react";
import { Card, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { reportScore } from "../../lib/challengeScores";
import { storageGet } from "../../lib/gameStorage";
import { pickWhoSaidItQuestions } from "../../lib/games/whoSaidItData";

const QUESTION_COUNT = 8;
const SEC_PER_QUESTION = 15;
const MIN_USABLE_QUESTIONS = 3; // below this, there just isn't enough chat history yet for a fair round

export default function WhoSaidItPlayer({ gameId, round, challenge, player, players }) {
  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState(null);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState("answering"); // "answering" | "revealed"
  const [selected, setSelected] = useState(null);
  const [score, setScore] = useState(0);
  const [secLeft, setSecLeft] = useState(SEC_PER_QUESTION);
  const [done, setDone] = useState(false);
  const reportedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const seed = (challenge?.startedAt || 1);
    storageGet(gameId, "pb:group-chat").then((messages) => {
      if (cancelled) return;
      const qs = pickWhoSaidItQuestions(messages || [], players || [], seed, QUESTION_COUNT);
      setQuestions(qs);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [gameId, challenge?.startedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = questions?.[index];

  useEffect(() => {
    if (loading || done || phase === "revealed" || !questions || questions.length < MIN_USABLE_QUESTIONS) return;
    if (secLeft <= 0) { lockAnswer(null); return; }
    const t = window.setTimeout(() => setSecLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [secLeft, loading, done, phase, questions]); // eslint-disable-line react-hooks/exhaustive-deps

  const lockAnswer = (optionId) => {
    if (phase !== "answering" || !current) return;
    setSelected(optionId);
    setPhase("revealed");
    if (optionId === current.answerId) setScore((s) => s + 1);

    window.setTimeout(() => {
      const nextIndex = index + 1;
      if (nextIndex >= questions.length) {
        setDone(true);
      } else {
        setIndex(nextIndex);
        setSelected(null);
        setPhase("answering");
        setSecLeft(SEC_PER_QUESTION);
      }
    }, 1400);
  };

  useEffect(() => {
    if (!loading && questions && questions.length < MIN_USABLE_QUESTIONS && !reportedRef.current) {
      reportedRef.current = true;
      setDone(true);
      reportScore(gameId, round.round, player.id, player.name, 0, { final: true });
    }
  }, [loading, questions]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (done && questions && questions.length >= MIN_USABLE_QUESTIONS && !reportedRef.current) {
      reportedRef.current = true;
      reportScore(gameId, round.round, player.id, player.name, score, { final: true });
    }
  }, [done, score, questions]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return <Card style={{ marginBottom: 20, textAlign: "center" }}><p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic" }}>Loading...</p></Card>;
  }

  if (questions.length < MIN_USABLE_QUESTIONS) {
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <h3 style={{ color: "#ff2d95", margin: "0 0 8px", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>💬 Who Said It?</h3>
        <p style={{ color: "#a68fd6", fontSize: 13 }}>Not enough memorable chat history yet for a fair round — check back once Panopticon's seen more conversation.</p>
      </Card>
    );
  }

  if (done) {
    return <GameResultCard icon="💬" title="Quiz Complete" valueLabel={`${score}/${questions.length} correct`} />;
  }

  return (
    <Card style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>💬 Who Said It?</h3>
        <Badge color={secLeft <= 3 ? "#ff3860" : "#ff2d95"}>{secLeft}s</Badge>
      </div>
      <p style={{ color: "#6b4f99", fontSize: 11, margin: "0 0 12px" }}>Question {index + 1} of {questions.length} — {score} correct so far</p>

      <div style={{ background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 10, padding: "14px 16px", marginBottom: 14 }}>
        <p style={{ fontSize: 15, color: "#f5f0ff", fontStyle: "italic", margin: 0, lineHeight: 1.5 }}>"{current.quote}"</p>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {current.options.map((opt) => {
          let bg = "#0d0618", border = "#3d1f5c", color = "#f5f0ff";
          if (phase === "revealed") {
            if (opt.id === current.answerId) { bg = "rgba(0,255,157,0.15)"; border = "#00ff9d"; color = "#00ff9d"; }
            else if (opt.id === selected) { bg = "rgba(255,56,96,0.15)"; border = "#ff3860"; color = "#ff3860"; }
          }
          return (
            <button key={opt.id} onClick={() => lockAnswer(opt.id)} disabled={phase === "revealed"} style={{
              textAlign: "left", padding: "10px 14px", borderRadius: 8, cursor: phase === "revealed" ? "default" : "pointer",
              background: bg, border: `2px solid ${border}`, color, fontSize: 14, fontFamily: "'Orbitron', 'Segoe UI', sans-serif",
            }}>{opt.name}</button>
          );
        })}
      </div>
    </Card>
  );
}
