import { useState, useEffect, useRef, useMemo } from "react";
import { Card, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { useCountdown } from "./useCountdown";
import { usePersistedStart } from "./usePersistedStart";
import { reportScore } from "../../lib/challengeScores";
import {
  SIZE, UP, RIGHT, DOWN, LEFT, generateAqueduct, rotateCell, currentMask,
  isCellConsistent, consistentCellCount, isSolved,
} from "../../lib/games/naiadsAqueductData";

const FINISH_BASE = 100000000000; // same finish-tier trick as SlidingPuzzlePlayer.jsx/MinotaurMazePlayer.jsx — always beats an unsolved DNF's partial-progress score, faster solves score higher within the tier.
const CELL_PX = 34;
const INK = "#1a0f08";
const CLAY = "#c2703d";
const WATER = "#00d9ff";
const WATER_DIM = "#0a3a4a";

// A tile's pipe artwork, drawn directly from its current 4-bit opening
// mask (no CSS rotation needed — currentMask() already resolves the
// rotated shape, so the SVG just draws whatever's open right now).
function TileArt({ mask, flowing }) {
  const stroke = flowing ? WATER : CLAY;
  const segs = [];
  const C = 17; // half of CELL_PX, the tile's own center in its local SVG space
  if (mask & UP) segs.push(`M${C},${C} L${C},0`);
  if (mask & RIGHT) segs.push(`M${C},${C} L34,${C}`);
  if (mask & DOWN) segs.push(`M${C},${C} L${C},34`);
  if (mask & LEFT) segs.push(`M${C},${C} L0,${C}`);
  return (
    <svg width={CELL_PX} height={CELL_PX} viewBox="0 0 34 34" style={{ display: "block" }}>
      {segs.map((d, i) => (
        <path key={i} d={d} stroke={stroke} strokeWidth={9} strokeLinecap="round" fill="none" />
      ))}
      <circle cx={C} cy={C} r={mask === 0 ? 0 : 5.5} fill={stroke} />
    </svg>
  );
}

// BFS over MATCHED (currently-consistent) connections from the source —
// used only for the post-solve water-fill animation's per-cell delay.
// Purely cosmetic: the win condition itself (naiadsAqueductData.js's
// isSolved) never depends on connectivity, only on local consistency.
function flowDistances(trueShapes, rotations, size, source) {
  const dist = Array.from({ length: size }, () => Array(size).fill(-1));
  dist[source.r][source.c] = 0;
  const queue = [[source.r, source.c]];
  let head = 0;
  const dirs = [{ bit: UP, dr: -1, dc: 0, opp: DOWN }, { bit: RIGHT, dr: 0, dc: 1, opp: LEFT }, { bit: DOWN, dr: 1, dc: 0, opp: UP }, { bit: LEFT, dr: 0, dc: -1, opp: RIGHT }];
  while (head < queue.length) {
    const [r, c] = queue[head++];
    const mask = currentMask(trueShapes[r][c], rotations[r][c]);
    for (const d of dirs) {
      if (!(mask & d.bit)) continue;
      const nr = r + d.dr, nc = c + d.dc;
      if (nr < 0 || nr >= size || nc < 0 || nc >= size || dist[nr][nc] !== -1) continue;
      const nMask = currentMask(trueShapes[nr][nc], rotations[nr][nc]);
      if (!(nMask & d.opp)) continue;
      dist[nr][nc] = dist[r][c] + 1;
      queue.push([nr, nc]);
    }
  }
  return dist;
}

export default function NaiadsAqueductPlayer({ gameId, challenge, round, player }) {
  // Seeded off the SHARED challenge.startedAt — everyone racing this
  // battle gets the identical grid — while timing/scoring runs off this
  // player's own persisted start, exactly like SlidingPuzzlePlayer.jsx.
  // See naiadsAqueductData.js's own header comment for the full reasoning.
  const startedAt = challenge?.startedAt || null;
  const myStartTime = usePersistedStart(gameId, round.round, challenge?.startedAt, player.id);
  const { timeUp } = useCountdown(challenge?.endsAt);

  const puzzle = useMemo(() => generateAqueduct(startedAt || 1, SIZE), [startedAt]);
  const [rotations, setRotations] = useState(puzzle.rotations);
  const [taps, setTaps] = useState(0);
  const [done, setDone] = useState(false);
  const [finishedMs, setFinishedMs] = useState(null);
  const reportedRef = useRef(false);
  const [, forceTick] = useState(0);

  useEffect(() => { setRotations(puzzle.rotations); }, [puzzle]);

  useEffect(() => {
    if (!myStartTime || done) return;
    const interval = window.setInterval(() => forceTick((t) => t + 1), 250);
    return () => window.clearInterval(interval);
  }, [myStartTime, done]);

  const solved = useMemo(() => isSolved(puzzle.trueShapes, rotations, puzzle.size), [puzzle, rotations]);
  const progress = useMemo(() => consistentCellCount(puzzle.trueShapes, rotations, puzzle.size), [puzzle, rotations]);

  const tap = (r, c) => {
    if (done) return;
    setRotations((prev) => rotateCell(prev, r, c));
    setTaps((t) => t + 1);
  };

  useEffect(() => {
    if (solved && !done) {
      setFinishedMs(Math.max(0, Date.now() - (myStartTime || Date.now())));
      setDone(true);
    }
  }, [solved]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (timeUp && !done) setDone(true);
  }, [timeUp, done]);

  useEffect(() => {
    if (!done || reportedRef.current) return;
    reportedRef.current = true;
    // Math.max floors above size*size - 1 (the highest possible non-solved
    // progress score — see consistentCellCount's own comment: all cells
    // consistent IS solved, so a DNF tops out one below the grid total),
    // same reasoning as SlidingPuzzlePlayer.jsx's identical fix.
    const maxPartial = puzzle.size * puzzle.size - 1;
    const value = finishedMs != null ? Math.max(maxPartial + 1, FINISH_BASE - finishedMs) : progress;
    reportScore(gameId, round.round, player.id, player.name, value, { final: true });
  }, [done]); // eslint-disable-line react-hooks/exhaustive-deps

  const elapsedSec = myStartTime ? (Math.max(0, Date.now() - myStartTime) / 1000).toFixed(1) : "0.0";
  const dists = useMemo(() => (solved ? flowDistances(puzzle.trueShapes, rotations, puzzle.size, puzzle.source) : null), [solved, puzzle, rotations]);

  if (done) {
    return finishedMs != null
      ? <GameResultCard icon="🏺" title="Aqueduct Complete!" valueLabel={`${(finishedMs / 1000).toFixed(1)}s — ${taps} turns`} />
      : <GameResultCard icon="💧" title="Time's Up" valueLabel={`${progress}/${puzzle.size * puzzle.size} channels aligned`} />;
  }

  if (!startedAt || !myStartTime) {
    return <Card style={{ marginBottom: 20, textAlign: "center" }}><p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic" }}>Loading...</p></Card>;
  }

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🏺 Naiads' Aqueduct</h3>
        <Badge>{elapsedSec}s · {progress}/{puzzle.size * puzzle.size}</Badge>
      </div>
      <p style={{ color: "#6b4f99", fontSize: 11, margin: "0 0 10px", fontStyle: "italic" }}>
        Tap a channel to rotate it 90°. Connect every channel to the spring (top-left) with no gaps or dead ends facing the wrong way.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${puzzle.size}, ${CELL_PX}px)`,
          gridTemplateRows: `repeat(${puzzle.size}, ${CELL_PX}px)`,
          gap: 1, margin: "0 auto", width: "fit-content", background: "#05010f", border: `3px solid ${INK}`, padding: 3,
        }}
      >
        {Array.from({ length: puzzle.size }, (_, r) =>
          Array.from({ length: puzzle.size }, (_, c) => {
            const mask = currentMask(puzzle.trueShapes[r][c], rotations[r][c]);
            const isSource = r === puzzle.source.r && c === puzzle.source.c;
            const consistent = isCellConsistent(puzzle.trueShapes, rotations, r, c, puzzle.size);
            const flowing = solved && dists && dists[r][c] !== -1;
            const delay = flowing ? dists[r][c] * 45 : 0;
            return (
              <button
                key={`${r}-${c}`}
                onClick={() => tap(r, c)}
                style={{
                  width: CELL_PX, height: CELL_PX, padding: 0, cursor: "pointer",
                  background: isSource ? "rgba(0,217,255,0.12)" : consistent ? "rgba(0,255,157,0.05)" : "#0f0a1e",
                  border: `1px solid ${isSource ? WATER : "#251a3d"}`,
                  transition: `background 0.3s ease ${delay}ms`,
                  position: "relative",
                }}
              >
                <TileArt mask={mask} flowing={flowing} />
                {isSource && (
                  <span style={{ position: "absolute", top: 1, left: 1, fontSize: 9 }}>💧</span>
                )}
              </button>
            );
          })
        )}
      </div>
    </Card>
  );
}
