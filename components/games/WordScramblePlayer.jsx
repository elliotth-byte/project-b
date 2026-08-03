import { useState, useEffect, useRef } from "react";
import { Card } from "../ui";
import GameResultCard from "./GameResultCard";
import { WORDS_PER_SET, WORD_COLORS, WORD_FONTS, getPlayerWordSet, initFloatingLetters } from "../../lib/games/wordData";
import { reportScore } from "../../lib/challengeScores";

export default function WordScramblePlayer({ gameId, round, challenge, player }) {
  const [answers, setAnswers] = useState(Array(WORDS_PER_SET).fill(""));
  const [solved, setSolved] = useState(new Set());
  const [startTime] = useState(() => Date.now());
  const [finishMs, setFinishMs] = useState(null);
  const [, setTick] = useState(0);
  const lettersRef = useRef([]);
  const rafRef = useRef(null);
  const lastRenderRef = useRef(0);
  const arenaW = 320, arenaH = 240;

  const seed = challenge?.startedAt || 1;
  const words = getPlayerWordSet(player.name, seed).words;

  useEffect(() => {
    if (lettersRef.current.length === 0) lettersRef.current = initFloatingLetters(words, arenaW, arenaH);
  }, [words]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (finishMs) return;
    const animate = (now) => {
      lettersRef.current.forEach((l) => {
        l.x += l.vx; l.y += l.vy;
        if (l.x < 0 || l.x > arenaW - 24) { l.vx = -l.vx; l.x = Math.max(0, Math.min(l.x, arenaW - 24)); }
        if (l.y < 0 || l.y > arenaH - 30) { l.vy = -l.vy; l.y = Math.max(0, Math.min(l.y, arenaH - 30)); }
      });
      if (now - lastRenderRef.current > 33) { lastRenderRef.current = now; setTick((t) => t + 1); }
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [finishMs]);

  useEffect(() => {
    if (solved.size === words.length && !finishMs) {
      const time = Date.now() - startTime;
      setFinishMs(time);
      reportScore(gameId, round.round, player.id, player.name, time, { final: true });
    }
  }, [solved.size]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleInput = (idx, val) => {
    const upper = val.toUpperCase();
    const next = [...answers];
    next[idx] = upper;
    setAnswers(next);
    if (upper === words[idx]) setSolved((prev) => new Set([...prev, idx]));
  };

  if (finishMs) {
    return <GameResultCard icon="🔤" title="All Words Found" valueLabel={`${(finishMs / 1000).toFixed(2)}s`} />;
  }

  const visibleLetters = lettersRef.current.filter((l) => !solved.has(l.wi));

  return (
    <Card style={{ marginBottom: 20 }}>
      <h3 style={{ color: "#ff2d95", margin: "0 0 8px", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🔤 Word Scramble</h3>
      <div style={{
        position: "relative", width: arenaW, height: arenaH, margin: "0 auto 12px",
        background: "#0d0618", borderRadius: 10, border: "1px solid #3d1f5c", overflow: "hidden",
      }}>
        {visibleLetters.map((l, i) => (
          <div key={i} style={{
            position: "absolute", left: l.x, top: l.y,
            fontSize: 20, fontWeight: 900, color: WORD_COLORS[l.wi],
            fontFamily: WORD_FONTS[l.wi % WORD_FONTS.length],
            textShadow: `0 0 8px ${WORD_COLORS[l.wi]}66`, userSelect: "none", pointerEvents: "none",
          }}>{l.char}</div>
        ))}
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        {words.map((word, i) => (
          <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: WORD_COLORS[i], flexShrink: 0 }} />
            {solved.has(i) ? (
              <div style={{ flex: 1, padding: "8px 12px", borderRadius: 8, fontSize: 15, fontWeight: 700, color: WORD_COLORS[i], background: `${WORD_COLORS[i]}12`, border: `1px solid ${WORD_COLORS[i]}44` }}>✓ {word}</div>
            ) : (
              <input value={answers[i]} onChange={(e) => handleInput(i, e.target.value)} placeholder={`${word.length} letters`} maxLength={word.length}
                style={{ flex: 1, background: "#0d0618", border: `1px solid ${WORD_COLORS[i]}55`, borderRadius: 8, padding: "8px 12px", color: WORD_COLORS[i], fontSize: 15, fontWeight: 700, outline: "none", letterSpacing: 2, textTransform: "uppercase" }} />
            )}
          </div>
        ))}
      </div>
      <div style={{ textAlign: "center", marginTop: 8, fontSize: 11, color: "#6b4f99" }}>{solved.size}/{words.length} words found</div>
    </Card>
  );
}
