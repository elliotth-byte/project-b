import { useState, useEffect, useRef } from "react";
import { Card, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { useCountdown } from "./useCountdown";
import { usePersistedStart } from "./usePersistedStart";
import { reportScore } from "../../lib/challengeScores";
import { COLORS, generateWall } from "../../lib/games/stroopData";

const WALL_SIZE = 20;
const MISTAKE_PENALTY_MS = 1500;
const DNF_BASE = 999999; // reported (as a lower-is-better value) if time runs out before finishing — always worse than any real finish time, but still ranks by progress among other DNFs

export default function StroopPlayer({ gameId, challenge, round, player }) {
  const seed = challenge?.startedAt || 1; // same wall for everyone — a "race" only means something if it's the same wall
  const [wall] = useState(() => generateWall(seed, WALL_SIZE));
  const { timeUp } = useCountdown(challenge?.endsAt);
  // Timing is based on myStartTime (this player's own, persisted start),
  // not the shared challenge start — see RedLightGreenLightPlayer.jsx's
  // own comment for the full story on why. The previous version here
  // deliberately used the shared clock, reasoning that a late page-load
  // "shouldn't grant extra time" — but that assumed lateness would only
  // ever mean a few seconds of natural loading delay. In practice a
  // player can open this screen minutes, even hours, after the
  // challenge actually started (waiting on something else in the app,
  // stepping away, anything), and the shared-clock version baked that
  // whole gap into their reported time before they'd solved a single
  // tile — exactly the bug a real report caught. myStartTime fixes that
  // without losing anything: the wall itself is still identical for
  // everyone (seeded from the shared start above), only the CLOCK
  // measuring how fast someone solves it is now personal.
  const myStartTime = usePersistedStart(gameId, round.round, challenge?.startedAt, player.id);
  const [cleared, setCleared] = useState(new Set());
  const [penaltyMs, setPenaltyMs] = useState(0);
  const [flash, setFlash] = useState(null); // { idx, correct } | null
  const [done, setDone] = useState(false);
  const [finalMs, setFinalMs] = useState(null);
  const reportedRef = useRef(false);
  const [, forceTick] = useState(0);

  // The current target is always just "the next uncleared tile in
  // left-to-right, top-to-bottom order" — the wall renders in exactly
  // that order already (a plain 4-column grid over the array), so array
  // index IS reading order. No separate tap-to-select step: answering
  // always applies to this tile, and clearing it naturally advances to
  // whichever tile is now first in the remaining order.
  const currentIdx = wall.findIndex((_, i) => !cleared.has(i));

  useEffect(() => {
    if (!myStartTime || done) return;
    const interval = window.setInterval(() => forceTick((t) => t + 1), 250);
    return () => window.clearInterval(interval);
  }, [myStartTime, done]);

  const answerColor = (colorName) => {
    if (currentIdx === -1 || done) return;
    const tile = wall[currentIdx];
    const correct = tile.ink === colorName;
    setFlash({ idx: currentIdx, correct });
    window.setTimeout(() => setFlash(null), 250);

    if (correct) {
      setCleared((c) => {
        const next = new Set(c);
        next.add(currentIdx);
        if (next.size >= WALL_SIZE) {
          // Clamped to never go negative before adding the mistake
          // penalty — same reasoning as RedLightGreenLightPlayer.jsx's
          // identical fix (a device clock drifting mid-session can
          // otherwise inflate the score instead of just corrupting it
          // the usual way). penaltyMs itself is always >= 0 already, so
          // only the raw elapsed portion needs the clamp.
          const elapsed = Math.max(0, Date.now() - myStartTime) + penaltyMs;
          setFinalMs(elapsed);
          setDone(true);
        }
        return next;
      });
    } else {
      setPenaltyMs((p) => p + MISTAKE_PENALTY_MS);
    }
  };

  useEffect(() => {
    if (timeUp && !done) {
      setDone(true);
    }
  }, [timeUp, done]);

  useEffect(() => {
    if (!done || reportedRef.current) return;
    reportedRef.current = true;
    const score = finalMs != null ? Math.max(1, DNF_BASE - finalMs) : cleared.size; // finishers occupy a high tier (faster = higher, since it's DNF_BASE minus their time); DNFs rank below by raw progress
    reportScore(gameId, round.round, player.id, player.name, score, { final: true });
  }, [done]); // eslint-disable-line react-hooks/exhaustive-deps

  const elapsedDisplay = myStartTime ? ((Math.max(0, Date.now() - myStartTime) + penaltyMs) / 1000).toFixed(1) : "0.0";

  if (done) {
    return finalMs != null
      ? <GameResultCard icon="🌈" title="Wall Cleared!" valueLabel={`${(finalMs / 1000).toFixed(1)}s`} />
      : <GameResultCard icon="🌈" title="Time's Up" valueLabel={`${cleared.size}/${WALL_SIZE} cleared`} />;
  }

  if (!myStartTime) {
    return <Card style={{ marginBottom: 20, textAlign: "center" }}><p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic" }}>Loading...</p></Card>;
  }

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🌈 Stroop Wall</h3>
        <Badge>{elapsedDisplay}s · {cleared.size}/{WALL_SIZE}</Badge>
      </div>
      <p style={{ color: "#6b4f99", fontSize: 11, margin: "0 0 10px", fontStyle: "italic" }}>
        Working left to right, top to bottom — tap the color each word is actually PRINTED in, not what it says. Wrong answer costs {MISTAKE_PENALTY_MS / 1000}s.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginBottom: 14 }}>
        {wall.map((tile, i) => {
          const isCleared = cleared.has(i);
          const isCurrent = i === currentIdx;
          const isFlashing = flash?.idx === i;
          return (
            <div
              key={i}
              style={{
                padding: "10px 4px", borderRadius: 8, fontSize: 13, fontWeight: 900,
                background: isCleared ? "#0d0618" : isFlashing ? (flash.correct ? "rgba(0,255,157,0.2)" : "rgba(255,56,96,0.2)") : isCurrent ? "rgba(255,45,149,0.15)" : "#150a28",
                border: `2px solid ${isCleared ? "#3d1f5c" : isCurrent ? "#ff2d95" : "#3d1f5c"}`,
                color: isCleared ? "#3d1f5c" : tile.inkHex,
                opacity: isCleared ? 0.4 : 1,
                fontFamily: "'Orbitron', 'Segoe UI', sans-serif",
                boxShadow: isCurrent ? "0 0 12px rgba(255,45,149,0.5)" : "none",
              }}
            >
              {isCleared ? "✓" : tile.word}
            </div>
          );
        })}
      </div>

      <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 8px" }}>What color is the highlighted word printed in?</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        {COLORS.map((c) => (
          <button
            key={c.name}
            onClick={() => answerColor(c.name)}
            style={{
              padding: "12px 8px", borderRadius: 8, cursor: "pointer",
              background: `${c.hex}22`, border: `2px solid ${c.hex}`, color: c.hex,
              fontSize: 13, fontWeight: 900, fontFamily: "'Orbitron', 'Segoe UI', sans-serif",
            }}
          >
            {c.name}
          </button>
        ))}
      </div>
    </Card>
  );
}
