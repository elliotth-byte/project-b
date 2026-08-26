import { useState, useRef, useEffect, useCallback } from "react";
import { Card, Badge, Btn } from "../ui";
import GameResultCard from "./GameResultCard";
import { useCountdown } from "./useCountdown";
import { usePersistedStart } from "./usePersistedStart";
import { useSwipeControls } from "../../lib/games/useSwipeControls";
import { generateLevel, push, isSolved, isDeadlocked, SIZE } from "../../lib/games/tavoData";
import { reportScore } from "../../lib/challengeScores";

const DIR_MAP = { up: { dx: 0, dy: -1 }, down: { dx: 0, dy: 1 }, left: { dx: -1, dy: 0 }, right: { dx: 1, dy: 0 } };

// Solo, client-only (see lib/games/tavoData.js's own extensive header
// comment on how solvability is actually guaranteed here — this
// component just plays the already-verified-solvable board it's
// handed, same read/act shape as every other solo game in this batch).
export default function TavoPlayer({ gameId, round, challenge, player }) {
  const { timeUp } = useCountdown(challenge?.endsAt);
  const seed = (challenge?.startedAt || 1) + (player?.id ? player.id.length : 0);
  const [level] = useState(() => generateLevel(seed));
  const startTime = usePersistedStart(gameId, round.round, challenge?.startedAt, player.id);
  const [state, setState] = useState(level.state);
  const [history, setHistory] = useState([]);
  const [moveCount, setMoveCount] = useState(0);
  const [done, setDone] = useState(false);
  const reportedRef = useRef(false);

  const finish = useCallback((finalMoveCount) => {
    if (reportedRef.current || !startTime) return;
    reportedRef.current = true;
    setDone(true);
    const elapsedMs = Math.max(0, Date.now() - startTime); // clamped -- a device clock drifting mid-session must never send this negative (see RedLightGreenLightPlayer.jsx for the full story on why this matters: it INFLATES a score instead of just corrupting it the usual way)
    // "Mostly the clock, with a small bonus for a clean line" — speed
    // is the primary factor (matching every other speed-scored game
    // here), efficiency is a small, capped bonus on top, not a
    // separate scoring axis of its own. A board that ends in deadlock
    // rather than genuinely solved never reaches this function at all
    // — see the deadlock banner below, which routes back to Undo
    // instead of ever "finishing" that way.
    //
    // finalMoveCount is passed explicitly rather than read from the
    // moveCount closure — this gets called from inside move()'s own
    // setState updater, right after queuing setMoveCount(m => m+1);
    // React batches that update, so this function's own closure over
    // moveCount would still see the PRE-increment value at the moment
    // it actually runs, silently off-by-one on the winning move
    // specifically. The timeout path below has no such update in
    // flight, so passing the plain moveCount state there is correct.
    const usedMoves = finalMoveCount ?? moveCount;
    const cleanBonus = usedMoves <= level.solution.length ? 1000 : 0;
    const value = Math.max(1, 10_000_000 - elapsedMs + cleanBonus);
    reportScore(gameId, round.round, player.id, player.name, value, { final: true, moves: usedMoves });
  }, [startTime, moveCount, level.solution.length, gameId, round.round, player.id, player.name]);

  useEffect(() => {
    if (timeUp && !reportedRef.current) finish();
  }, [timeUp, finish]);

  const move = useCallback((dir) => {
    if (done) return;
    setState((current) => {
      const next = push(current, dir);
      if (next === current) return current; // illegal move — nothing to record
      setHistory((h) => [...h, current]);
      setMoveCount((m) => {
        const newCount = m + 1;
        if (isSolved(next, level.markers)) finish(newCount);
        return newCount;
      });
      return next;
    });
  }, [done, level.markers, finish]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowUp") move(DIR_MAP.up);
      else if (e.key === "ArrowDown") move(DIR_MAP.down);
      else if (e.key === "ArrowLeft") move(DIR_MAP.left);
      else if (e.key === "ArrowRight") move(DIR_MAP.right);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move]);

  const swipeEnabled = !!player?.gamePrefs?.swipeControls;
  const swipeHandlers = useSwipeControls((dir) => move(DIR_MAP[dir]), swipeEnabled);

  const undo = () => {
    if (done || history.length === 0) return;
    setState(history[history.length - 1]);
    setHistory((h) => h.slice(0, -1));
    setMoveCount((m) => Math.max(0, m - 1));
  };

  const reset = () => {
    if (done) return;
    setState(level.state);
    setHistory([]);
    setMoveCount(0);
  };

  if (done) {
    return <GameResultCard icon="📦" title="Delivered!" valueLabel={`${moveCount} move${moveCount === 1 ? "" : "s"}`} />;
  }

  if (!startTime) {
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic" }}>Loading...</p>
      </Card>
    );
  }

  const stuck = isDeadlocked(state, level.markers);
  const homeCount = level.markers.filter((m) => state.crates.some((c) => c.x === m.x && c.y === m.y)).length;

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <h3 style={{ color: "#7a5cff", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>📦 Tavo</h3>
        <Badge>{homeCount}/{level.markers.length} home · {moveCount} moves</Badge>
      </div>
      <p style={{ color: "#6b4f99", fontSize: 11, margin: "0 0 10px" }}>
        Walk into a crate to push it. Every crate onto a marker. You can only push, never pull.
      </p>

      {stuck && (
        <div style={{ background: "rgba(255,56,96,0.12)", border: "1px solid #ff3860", borderRadius: 8, padding: "8px 10px", marginBottom: 10 }}>
          <p style={{ fontSize: 12, color: "#ff3860", margin: 0, fontWeight: 600 }}>
            A crate's stuck — this board can't be finished from here. Undo to keep going.
          </p>
        </div>
      )}

      <div
        onTouchStart={swipeHandlers.onTouchStart} onTouchEnd={swipeHandlers.onTouchEnd}
        style={{
          display: "grid", gridTemplateColumns: `repeat(${SIZE}, 1fr)`, gap: 2,
          maxWidth: 320, margin: "0 auto 14px", borderRadius: 8, overflow: "hidden",
          background: "#0d0618", padding: 4, touchAction: "none",
        }}
      >
        {Array.from({ length: SIZE * SIZE }, (_, i) => {
          const x = i % SIZE, y = Math.floor(i / SIZE);
          const isMarker = level.markers.some((m) => m.x === x && m.y === y);
          const crateIdx = state.crates.findIndex((c) => c.x === x && c.y === y);
          const onCrate = crateIdx !== -1;
          const crateHome = onCrate && isMarker;
          const isPlayer = state.player.x === x && state.player.y === y;
          return (
            <div key={i} style={{
              aspectRatio: "1", position: "relative", borderRadius: 4,
              background: isMarker ? "rgba(122,92,255,0.18)" : "rgba(255,255,255,0.03)",
              border: isMarker ? "1px solid rgba(122,92,255,0.5)" : "none",
            }}>
              {onCrate && (
                <div style={{
                  position: "absolute", inset: 3, borderRadius: 4,
                  background: crateHome ? "#00ff9d" : "#7a5cff", opacity: crateHome ? 0.85 : 1,
                }} />
              )}
              {isPlayer && (
                <div style={{
                  position: "absolute", inset: "22%", borderRadius: "50%",
                  background: "#ff2d95", boxShadow: "0 0 8px rgba(255,45,149,0.7)",
                }} />
              )}
            </div>
          );
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 44px)", gap: 4, justifyContent: "center", marginBottom: 12 }}>
        <div />
        <Btn small onClick={() => move(DIR_MAP.up)}>↑</Btn>
        <div />
        <Btn small onClick={() => move(DIR_MAP.left)}>←</Btn>
        <Btn small onClick={() => move(DIR_MAP.down)}>↓</Btn>
        <Btn small onClick={() => move(DIR_MAP.right)}>→</Btn>
      </div>

      <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
        <Btn small variant="ghost" onClick={undo} disabled={history.length === 0}>↩ Undo</Btn>
        <Btn small variant="ghost" onClick={reset} disabled={history.length === 0}>🔄 Reset</Btn>
      </div>
    </Card>
  );
}
