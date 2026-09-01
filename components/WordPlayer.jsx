import { useState, useEffect, useRef } from "react";
import { Card, PausedBanner } from "./traitorsUi";
import { storageUpdate, subscribeGameState } from "../lib/gameStorage";
import {
  WORDS_PER_SET, WORD_COLORS, WORD_FONTS,
  getPlayerWordSet, initFloatingLetters, STORAGE_KEY_WORDS,
} from "../lib/wordGameData";

// ─── Word Scramble: Player View ───
// Same game logic and rendering as the original artifact. The only real
// changes: gameId is threaded through to storageUpdate, and instead of
// receiving `initialData` from a parent that polls every 3s, this
// component subscribes directly to realtime updates for its own key.
export default function WordPlayer({ gameId, playerName }) {
  const [wordState, setWordState] = useState(null);
  const [answers, setAnswers] = useState(Array(WORDS_PER_SET).fill(""));
  const [solved, setSolved] = useState(new Set());
  const [startTime, setStartTime] = useState(null);
  const [finishTime, setFinishTime] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const lettersRef = useRef([]);
  const rafRef = useRef(null);
  const lastRenderRef = useRef(0);
  const [, setTick] = useState(0);
  const timerRef = useRef(null);
  const pausedMsRef = useRef(0);
  const pauseStartRef = useRef(null);
  const arenaW = 340, arenaH = 260;

  // Subscribe to this game's word-scramble state (replaces polling).
  useEffect(() => {
    const unsubscribe = subscribeGameState(gameId, STORAGE_KEY_WORDS, (value) => {
      setWordState(value);
      if (value?.times?.[playerName]) {
        setSubmitted(true);
        setFinishTime(value.times[playerName]);
      }
    });
    return unsubscribe;
  }, [gameId, playerName]);

  // Track paused duration so the race timer freezes instead of drifting.
  useEffect(() => {
    if (wordState?.paused) {
      if (!pauseStartRef.current) pauseStartRef.current = Date.now();
    } else if (pauseStartRef.current) {
      pausedMsRef.current += Date.now() - pauseStartRef.current;
      pauseStartRef.current = null;
    }
  }, [wordState?.paused]);

  // Derive this player's unique word set
  const words = wordState?.seed ? getPlayerWordSet(playerName, wordState.seed).words : null;

  // Auto-start timer on load
  useEffect(() => {
    if (words && !startTime && !submitted) setStartTime(Date.now());
  }, [words, startTime, submitted]);

  // Init letters when words are derived
  useEffect(() => {
    if (words && lettersRef.current.length === 0) {
      lettersRef.current = initFloatingLetters(words, arenaW, arenaH);
    }
  }, [words]);

  // Animation loop
  useEffect(() => {
    if (!words || finishTime || wordState?.paused) return;
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
  }, [words, finishTime, wordState?.paused]);

  // Timer — pauses in place (doesn't keep counting) while the host has paused the round
  useEffect(() => {
    if (startTime && !finishTime && !wordState?.paused) {
      timerRef.current = window.setInterval(() => setElapsed(Date.now() - startTime - pausedMsRef.current), 50);
      return () => window.clearInterval(timerRef.current);
    }
  }, [startTime, finishTime, wordState?.paused]);

  // Check for all solved
  useEffect(() => {
    if (words && solved.size === words.length && !finishTime && startTime && !wordState?.paused) {
      const time = Date.now() - startTime - pausedMsRef.current;
      setFinishTime(time); setElapsed(time);
      (async () => {
        const res = await storageUpdate(gameId, STORAGE_KEY_WORDS, (fresh) => {
          if (!fresh) return null;
          fresh.times = { ...(fresh.times || {}), [playerName]: time };
          return fresh;
        });
        // keep the player's own finish locked in locally either way
        setSubmitted(true);
      })();
    }
  }, [solved.size, wordState?.paused]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!wordState || !wordState.active || !words) return null;
  if (wordState.paused) return <PausedBanner icon="🔤" title="Word Scramble" />;

  const isParticipant = !wordState.participants || wordState.participants.includes(playerName);
  if (wordState.participants && !isParticipant) {
    return (
      <Card style={{ marginBottom: 20, borderColor: "rgba(201,168,76,0.3)", textAlign: "center" }}>
        <h3 style={{ color: "#c9a84c", margin: "0 0 6px", fontSize: 15, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>🔤 Word Scramble</h3>
        <p style={{ color: "#a09080", fontSize: 13, margin: 0, fontStyle: "italic" }}>You're spectating this round.</p>
      </Card>
    );
  }

  const handleInput = (idx, val) => {
    if (wordState?.paused) return;
    const newAnswers = [...answers];
    newAnswers[idx] = val.toUpperCase();
    setAnswers(newAnswers);
    if (val.toUpperCase() === words[idx]) {
      setSolved((prev) => new Set([...prev, idx]));
    }
  };

  const visibleLetters = lettersRef.current.filter((l) => !solved.has(l.wi));

  return (
    <Card style={{ marginBottom: 20, borderColor: "rgba(201,168,76,0.3)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ color: "#c9a84c", margin: 0, fontSize: 15, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>🔤 Word Scramble</h3>
        <span style={{ fontSize: 16, fontWeight: 700, color: finishTime ? "#7a9a5c" : "#c9a84c", fontFamily: "'Courier New', Courier, monospace" }}>
          {finishTime ? `${(finishTime / 1000).toFixed(2)}s` : startTime ? `${(elapsed / 1000).toFixed(1)}s` : "—"}
        </span>
      </div>

      {finishTime ? (
        <div style={{ textAlign: "center", padding: "14px 0" }}>
          <div style={{ fontSize: 12, color: "#7a9a5c", textTransform: "uppercase", letterSpacing: 2, fontWeight: 700 }}>✦ All Words Found ✦</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#c9a84c", margin: "8px 0", fontFamily: "'Courier New', Courier, monospace" }}>
            {(finishTime / 1000).toFixed(2)}s
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", marginTop: 8 }}>
            {words.map((w, i) => (
              <span key={i} style={{ color: WORD_COLORS[i], fontSize: 14, fontWeight: 700, fontFamily: WORD_FONTS[i % WORD_FONTS.length] }}>{w}</span>
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* Arena */}
          <div style={{
            position: "relative", width: arenaW, height: arenaH, margin: "0 auto 12px",
            background: "#060e1a", borderRadius: 10, border: "1px solid #253550", overflow: "hidden",
          }}>
            {visibleLetters.map((l, i) => (
              <div key={i} style={{
                position: "absolute", left: l.x, top: l.y,
                fontSize: 22, fontWeight: 900, color: WORD_COLORS[l.wi],
                fontFamily: WORD_FONTS[l.wi % WORD_FONTS.length],
                textShadow: `0 0 8px ${WORD_COLORS[l.wi]}66`,
                userSelect: "none", pointerEvents: "none",
              }}>
                {l.char}
              </div>
            ))}
            {visibleLetters.length === 0 && (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#7a9a5c", fontSize: 14, fontWeight: 700 }}>
                🎉 All clear!
              </div>
            )}
          </div>

          {/* Inputs */}
          <div style={{ display: "grid", gap: 6 }}>
            {words.map((word, i) => (
              <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <div style={{ width: 12, height: 12, borderRadius: 3, background: WORD_COLORS[i], flexShrink: 0 }} />
                {solved.has(i) ? (
                  <div style={{
                    flex: 1, padding: "8px 12px", borderRadius: 8, fontSize: 15, fontWeight: 700,
                    color: WORD_COLORS[i], background: `${WORD_COLORS[i]}12`,
                    border: `1px solid ${WORD_COLORS[i]}44`,
                    fontFamily: WORD_FONTS[i % WORD_FONTS.length],
                  }}>✓ {word}</div>
                ) : (
                  <input
                    value={answers[i]}
                    onChange={(e) => handleInput(i, e.target.value)}
                    placeholder={`${word.length} letters`}
                    maxLength={word.length}
                    style={{
                      flex: 1, background: "#0a1020",
                      border: `1px solid ${WORD_COLORS[i]}55`,
                      borderRadius: 8, padding: "8px 12px", color: WORD_COLORS[i],
                      fontSize: 15, fontWeight: 700, outline: "none",
                      fontFamily: WORD_FONTS[i % WORD_FONTS.length],
                      letterSpacing: 2, textTransform: "uppercase",
                    }}
                  />
                )}
              </div>
            ))}
          </div>
          <div style={{ textAlign: "center", marginTop: 8, fontSize: 11, color: "#706050" }}>
            {solved.size}/{words.length} words found
          </div>
        </>
      )}
    </Card>
  );
}
