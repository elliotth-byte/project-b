import { useState, useEffect, useRef } from "react";
import { Card } from "../ui";

// A real hourglass silhouette (two bulbs pinched at a narrow neck)
// instead of a plain rounded-rect "tube" — same polygon used for both
// the glass outline and to clip the sand fill, so the sand only ever
// appears where actual glass is.
const HOURGLASS_CLIP = "polygon(10% 0%, 90% 0%, 90% 8%, 58% 48%, 58% 52%, 90% 92%, 90% 100%, 10% 100%, 10% 92%, 42% 52%, 42% 48%, 10% 8%)";
import GameResultCard from "./GameResultCard";
import { useCountdown } from "./useCountdown";
import { reportScore } from "../../lib/challengeScores";
import {
  NUM_HOURGLASSES, FLIP_THRESHOLD_FRACTION, SAND_COLORS,
  generateHourglassDurations, elapsedFraction, canFlip, hasRunOut, opacityForFlipCount,
  getOrInitPlayerState, recordFlip, recordLoss,
} from "../../lib/games/sandsOfTimeData";

// ─── Sands of Time ───
// See lib/games/sandsOfTimeData.js for the full mechanic and the
// anti-cheat reasoning behind why this game is server-persisted rather
// than a single usePersistedStart timestamp. This component is mostly
// a thin visual layer over that data — it reads the persisted state,
// ticks a local re-render loop to animate the countdowns smoothly, and
// forwards flip clicks to the server, which is the actual source of
// truth for whether a flip is allowed.
export default function SandsOfTimePlayer({ gameId, challenge, round, player }) {
  const { timeUp } = useCountdown(challenge?.endsAt);
  const [playerState, setPlayerState] = useState(null); // null while loading
  const [done, setDone] = useState(false);
  const [finalScoreMs, setFinalScoreMs] = useState(null);
  const [flipBusy, setFlipBusy] = useState(null); // hourglass index currently mid-flip-request, or null
  const reportedRef = useRef(false);
  const [, forceTick] = useState(0);

  const durations = challenge?.startedAt ? generateHourglassDurations(challenge.startedAt) : null;

  useEffect(() => {
    if (!gameId || !challenge?.startedAt || !round?.round || !player?.id) return;
    let cancelled = false;
    getOrInitPlayerState(gameId, round.round, challenge.startedAt, player.id).then((state) => {
      if (cancelled) return;
      setPlayerState(state);
      if (state?.done) { setDone(true); setFinalScoreMs(state.finalScoreMs); }
    });
    return () => { cancelled = true; };
  }, [gameId, challenge?.startedAt, round?.round, player?.id]);

  // A fast, local tick drives both the visual countdown/fade animation
  // AND the actual loss check — checking inside the same interval
  // callback (rather than a separate effect with no dependency array
  // that implicitly re-runs after every render) makes explicit exactly
  // when this check happens: once per tick, not "whenever React
  // happens to re-render for any reason." This never decides the loss
  // on its own, though — recordLoss below is what actually locks it in
  // server-side; this is just what notices it needs to happen.
  useEffect(() => {
    if (!playerState || done || !durations) return;
    const interval = window.setInterval(() => {
      forceTick((t) => t + 1);
      const now = Date.now();
      const lostIndex = playerState.hourglasses.findIndex((hg, i) => hasRunOut(hg.lastFlippedAt, durations[i], now));
      if (lostIndex !== -1) {
        const survivedMs = now - playerState.startedAt;
        setDone(true);
        setFinalScoreMs(survivedMs);
        recordLoss(gameId, round.round, challenge.startedAt, player.id, survivedMs);
      }
    }, 100);
    return () => window.clearInterval(interval);
  }, [playerState, done]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (timeUp && !done && playerState) {
      const survivedMs = Date.now() - playerState.startedAt;
      setDone(true);
      setFinalScoreMs(survivedMs);
      recordLoss(gameId, round.round, challenge.startedAt, player.id, survivedMs);
    }
  }, [timeUp, done, playerState]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!done || reportedRef.current || finalScoreMs == null) return;
    reportedRef.current = true;
    reportScore(gameId, round.round, player.id, player.name, finalScoreMs, { final: true });
  }, [done, finalScoreMs]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFlip = async (i) => {
    if (done || flipBusy != null || !durations) return;
    const hg = playerState.hourglasses[i];
    if (!canFlip(hg.lastFlippedAt, durations[i], Date.now())) return;
    setFlipBusy(i);
    const updated = await recordFlip(gameId, round.round, challenge.startedAt, player.id, i);
    setFlipBusy(null);
    if (updated) setPlayerState(updated);
  };

  if (done) {
    return (
      <GameResultCard
        icon="⏳"
        title="Time Ran Out"
        valueLabel={`Survived ${(finalScoreMs / 1000).toFixed(1)}s`}
      />
    );
  }

  if (!playerState || !durations) {
    return <Card style={{ marginBottom: 20, textAlign: "center" }}><p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic" }}>Loading...</p></Card>;
  }

  const now = Date.now();
  const survivedSoFar = ((now - playerState.startedAt) / 1000).toFixed(1);

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <h3 style={{ color: "#f5f0ff", marginBottom: 6 }}>⏳ Sands of Time</h3>
      <p style={{ color: "#a68fd6", fontSize: 12, marginBottom: 4 }}>
        Tap an hourglass to flip it once it's at least {Math.round(FLIP_THRESHOLD_FRACTION * 100)}% drained — keep all four going as long as you can.
        Every flip fades that hourglass a little more; after 5 flips it's invisible, so you'll have to time it from memory.
        If one fully runs out, it's over — everything is revealed and your time locked in.
      </p>
      <p style={{ color: "#00ff9d", fontSize: 18, fontWeight: 800, fontFamily: "'Orbitron', 'Segoe UI', sans-serif", marginBottom: 16 }}>
        {survivedSoFar}s survived
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, maxWidth: 340, margin: "0 auto" }}>
        {playerState.hourglasses.map((hg, i) => {
          const frac = elapsedFraction(hg.lastFlippedAt, durations[i], now);
          const remainingFrac = 1 - frac;
          const opacity = opacityForFlipCount(hg.flipCount);
          const eligible = canFlip(hg.lastFlippedAt, durations[i], now);
          const color = SAND_COLORS[i % SAND_COLORS.length];
          return (
            <button
              key={i}
              onClick={() => handleFlip(i)}
              disabled={!eligible || flipBusy != null}
              style={{
                background: "none", border: "none", padding: 0, cursor: eligible ? "pointer" : "default",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
              }}
            >
              <div style={{
                width: 44, height: 72, position: "relative",
                opacity, transition: "opacity 0.3s",
                // drop-shadow (not box-shadow) follows the clipped
                // shape's actual silhouette, so the glow traces the
                // hourglass outline itself rather than a rectangular box.
                filter: eligible ? `drop-shadow(0 0 5px ${color.hex}aa)` : "none",
              }}>
                {/* Glass outline */}
                <div style={{
                  position: "absolute", inset: 0, clipPath: HOURGLASS_CLIP,
                  background: "#0d0618", border: `2px solid ${eligible ? color.hex : "#3d1f5c"}`,
                }} />
                {/* Sand fill, clipped to the same hourglass shape via
                    overflow:hidden on this wrapper. */}
                <div style={{ position: "absolute", inset: 0, clipPath: HOURGLASS_CLIP, overflow: "hidden" }}>
                  <div style={{
                    position: "absolute", bottom: 0, left: 0, right: 0,
                    height: `${Math.max(0, remainingFrac * 100)}%`,
                    background: color.hex, transition: "height 0.1s linear",
                  }} />
                </div>
              </div>
              <span style={{ fontSize: 10, color: opacity > 0 ? "#a68fd6" : "#3d1f5c", fontWeight: 700 }}>
                {durations[i]}s
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
