import { useState, useEffect, useRef, useMemo } from "react";
import { Card, Btn, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { useCountdown } from "./useCountdown";
import { usePersistedStart } from "./usePersistedStart";
import { reportScore } from "../../lib/challengeScores";
import { ROWS, COLS, TAPESTRY_W, TAPESTRY_H, TAPESTRY_VARIANTS, pickVariantIndex, generateScramble, isSolved, correctCount, shiftRow, shiftCol } from "../../lib/games/lifesTapestryData";

const FINISH_BASE = 100000000000; // same finish-tier trick as SlidingPuzzlePlayer.jsx — always beats anyone who didn't solve it, faster solves score higher within the tier.
const TILE = 54; // px, kept small enough that ROWS x COLS + the arrow gutters fit a phone width without horizontal scroll
const ARROW = 30;

export default function LifesTapestryPlayer({ gameId, challenge, round, player }) {
  // The Big Screen variant (lifestapestrytv) is mechanically identical —
  // same grid, same shift arrows, same scramble/scoring — the ONLY
  // difference is that the reference weaving shown below is dropped
  // entirely here and shown only on the TV (see
  // components/bigscreen/LifesTapestryTvDisplay.jsx), so the room
  // actually has to look up at the shared screen instead of just their
  // own phone.
  const hideReference = challenge?.gameType === "lifestapestrytv";
  // Same reasoning as SlidingPuzzlePlayer.jsx: startedAt only seeds the
  // shared scramble (everyone gets the identical starting weave), and
  // all timing/scoring runs off myStartTime instead, so a player who
  // opens this screen late isn't charged for time they weren't even here for.
  const startedAt = challenge?.startedAt || null;
  const myStartTime = usePersistedStart(gameId, round.round, challenge?.startedAt, player.id);
  const { timeUp } = useCountdown(challenge?.endsAt);
  // Same seed as the scramble below, but run through its own transform
  // (see pickVariantIndex) — every player in this Battle resolves the
  // same variant off the same shared startedAt, the same way everyone
  // gets the identical scramble.
  const variant = useMemo(() => TAPESTRY_VARIANTS[pickVariantIndex(startedAt || 1)], [startedAt]);
  const [grid, setGrid] = useState(() => generateScramble(startedAt || 1));
  const [moves, setMoves] = useState(0);
  const [misses, setMisses] = useState(0);
  const [shake, setShake] = useState(false);
  const [done, setDone] = useState(false);
  const [finishedMs, setFinishedMs] = useState(null);
  const reportedRef = useRef(false);
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (!myStartTime || done) return;
    const interval = window.setInterval(() => forceTick((t) => t + 1), 250);
    return () => window.clearInterval(interval);
  }, [myStartTime, done]);

  const applyRow = (r, dir) => {
    if (done) return;
    setGrid((g) => shiftRow(g, r, dir));
    setMoves((m) => m + 1);
  };
  const applyCol = (c, dir) => {
    if (done) return;
    setGrid((g) => shiftCol(g, c, dir));
    setMoves((m) => m + 1);
  };

  // Deliberately not auto-detected on every shift — same as the real
  // challenge, you decide when to check rather than the game quietly
  // solving itself the instant it happens to line up.
  const checkThis = () => {
    if (done) return;
    if (isSolved(grid)) {
      // Clamped to never go negative — same reasoning as
      // SlidingPuzzlePlayer.jsx/RedLightGreenLightPlayer.jsx's identical
      // fix: device clock drift can otherwise inflate the reported score.
      setFinishedMs(Math.max(0, Date.now() - myStartTime));
      setDone(true);
    } else {
      setMisses((m) => m + 1);
      setShake(true);
      window.setTimeout(() => setShake(false), 400);
    }
  };

  useEffect(() => {
    if (timeUp && !done) setDone(true);
  }, [timeUp, done]);

  useEffect(() => {
    if (!done || reportedRef.current) return;
    reportedRef.current = true;
    // Math.max floors above ROWS*COLS (the max possible correctCount),
    // not just 1 — same reasoning as SlidingPuzzlePlayer.jsx's identical
    // fix: a solver's score must always exceed the highest possible
    // unsolved-progress score, even in the floor case.
    const value = finishedMs != null ? Math.max(ROWS * COLS, FINISH_BASE - finishedMs) : correctCount(grid);
    reportScore(gameId, round.round, player.id, player.name, value, { final: true });
  }, [done]); // eslint-disable-line react-hooks/exhaustive-deps

  const elapsedSec = myStartTime ? (Math.max(0, Date.now() - myStartTime) / 1000).toFixed(1) : "0.0";

  if (done) {
    return finishedMs != null
      ? <GameResultCard icon="🧵" title={`${variant.label}'s Tapestry Complete!`} valueLabel={`${(finishedMs / 1000).toFixed(1)}s — ${moves} moves`} />
      : <GameResultCard icon="🧵" title="Time's Up" valueLabel={`${correctCount(grid)}/${ROWS * COLS} squares placed`} />;
  }

  if (!startedAt || !myStartTime) {
    return <Card style={{ marginBottom: 20, textAlign: "center" }}><p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic" }}>Loading...</p></Card>;
  }

  const tileBg = (homeIndex) => {
    const homeRow = Math.floor(homeIndex / COLS);
    const homeCol = homeIndex % COLS;
    return {
      backgroundImage: `url("${variant.dataUri}")`,
      backgroundSize: `${COLS * 100}% ${ROWS * 100}%`,
      backgroundPosition: `${(homeCol / (COLS - 1)) * 100}% ${(homeRow / (ROWS - 1)) * 100}%`,
    };
  };

  const gridCols = `${ARROW}px repeat(${COLS}, ${TILE}px) ${ARROW}px`;
  const gridRows = `${ARROW}px repeat(${ROWS}, ${TILE}px) ${ARROW}px`;

  const arrowBtnStyle = {
    width: ARROW, height: ARROW, display: "flex", alignItems: "center", justifyContent: "center",
    background: "#1c1030", border: "1px solid #3d1f5c", borderRadius: 6, color: "#ffb347",
    fontSize: 13, cursor: "pointer", padding: 0,
  };

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🧵 Life's a Tapestry</h3>
        <Badge>{elapsedSec}s · {moves} moves</Badge>
      </div>
      <p style={{ color: "#6b4f99", fontSize: 11, margin: "0 0 10px", fontStyle: "italic" }}>
        {hideReference
          ? 'Shift whole rows and columns — they wrap around — to rebuild the weaving shown on the big screen. Tap "Check This" when you think you\'ve matched it.'
          : 'Shift whole rows and columns — they wrap around — to rebuild the weaving shown on the right. Tap "Check This" when you think you\'ve matched it.'}
      </p>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "center", gap: 14, flexWrap: "wrap" }}>
        <div
          style={{
            display: "grid", gridTemplateColumns: gridCols, gridTemplateRows: gridRows, gap: 3,
            margin: "0 auto", width: "fit-content", background: "#05010f", border: "2px solid #3d1f5c", padding: 4,
            transform: shake ? "translateX(-4px)" : "none", transition: "transform 0.1s ease",
            animation: shake ? "tapestryShake 0.4s" : "none",
          }}
        >
          <style>{`@keyframes tapestryShake { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-6px); } 75% { transform: translateX(6px); } }`}</style>

          <div key="corner-tl" />
          {Array.from({ length: COLS }, (_, c) => (
            <button key={`up-${c}`} style={arrowBtnStyle} onClick={() => applyCol(c, -1)} title="Shift column up">⬆</button>
          ))}
          <div key="corner-tr" />

          {/* Flattened into one array (rather than a fragment per row) so
              every grid child is a direct child of the CSS grid container
              with its own key, in the exact left-arrow/tiles/right-arrow
              order each row needs. */}
          {Array.from({ length: ROWS }, (_, r) => [
            <button key={`left-${r}`} style={arrowBtnStyle} onClick={() => applyRow(r, -1)} title="Shift row left">⬅</button>,
            ...Array.from({ length: COLS }, (_, c) => {
              const idx = r * COLS + c;
              return (
                <div
                  key={idx}
                  style={{
                    width: TILE, height: TILE, borderRadius: 4, border: "1px solid #3d1f5c",
                    boxShadow: "inset 1px 1px 0 rgba(255,255,255,0.12), inset -2px -2px 4px rgba(0,0,0,0.4)",
                    ...tileBg(grid[idx]),
                  }}
                />
              );
            }),
            <button key={`right-${r}`} style={arrowBtnStyle} onClick={() => applyRow(r, 1)} title="Shift row right">➡</button>,
          ])}

          <div key="corner-bl" />
          {Array.from({ length: COLS }, (_, c) => (
            <button key={`down-${c}`} style={arrowBtnStyle} onClick={() => applyCol(c, 1)} title="Shift column down">⬇</button>
          ))}
          <div key="corner-br" />
        </div>

        {!hideReference && (
          <div style={{ textAlign: "center" }}>
            <p style={{ color: "#a68fd6", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, margin: "0 0 4px" }}>Match this</p>
            <div
              style={{
                width: TAPESTRY_W / 5.5, height: TAPESTRY_H / 5.5, borderRadius: 6, border: "2px solid #ffb347",
                backgroundImage: `url("${variant.dataUri}")`, backgroundSize: "cover", backgroundPosition: "center",
              }}
            />
          </div>
        )}
      </div>
      {hideReference && (
        <p style={{ color: "#ffb347", fontSize: 11, margin: "8px 0 0", fontStyle: "italic" }}>👀 Check the big screen for what you're rebuilding.</p>
      )}

      <div style={{ marginTop: 12 }}>
        <Btn onClick={checkThis}>✅ Check This</Btn>
        {misses > 0 && <p style={{ color: "#ff3860", fontSize: 11, margin: "6px 0 0" }}>Not quite — keep weaving! ({misses} check{misses === 1 ? "" : "s"} so far)</p>}
      </div>
    </Card>
  );
}
