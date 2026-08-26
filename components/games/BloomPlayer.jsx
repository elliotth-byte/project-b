import { useState, useRef, useEffect } from "react";
import { Card, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { useCountdown } from "./useCountdown";
import { usePersistedStart } from "./usePersistedStart";
import { generateBoard, sweep, isBloomComplete, COLORS, BOARD_SIZE } from "../../lib/games/bloomData";
import { reportScore } from "../../lib/challengeScores";

// Solo, client-only (see lib/games/bloomData.js's own header comment).
// No par to compute or show — "no clock pressure" from the game's own
// rules means time isn't a real scoring factor here, only a deterministic
// tiebreak for two players who happen to finish in the exact same sweep
// count. Sweep count is the whole story.
export default function BloomPlayer({ gameId, round, challenge, player }) {
  const { timeUp } = useCountdown(challenge?.endsAt);
  const seed = (challenge?.startedAt || 1) + (player?.id ? player.id.length : 0);
  const [board] = useState(() => generateBoard(seed));
  const startTime = usePersistedStart(gameId, round.round, challenge?.startedAt, player.id);
  const [cells, setCells] = useState(board.cells);
  const [patchIndices, setPatchIndices] = useState([board.centerIndex]);
  const [sweepCount, setSweepCount] = useState(0);
  const [done, setDone] = useState(false);
  const reportedRef = useRef(false);
  const patchColor = cells[patchIndices[0]];

  const finish = () => {
    if (reportedRef.current || !startTime) return;
    reportedRef.current = true;
    setDone(true);
    const elapsedMs = Math.max(0, Date.now() - startTime); // clamped -- a device clock drifting mid-session must never send this negative (see RedLightGreenLightPlayer.jsx for the full story on why this matters: it INFLATES a score instead of just corrupting it the usual way)
    // Higher is better (rank: score-desc). Fewer sweeps always wins —
    // the constant just needs to comfortably dwarf any realistic sweep
    // count, with elapsed time only breaking an exact sweep-count tie.
    const value = Math.max(1, 1_000_000 - sweepCount * 1000 - Math.floor(elapsedMs / 1000));
    reportScore(gameId, round.round, player.id, player.name, value, { final: true, sweeps: sweepCount });
  };

  useEffect(() => {
    if (timeUp && !reportedRef.current) finish();
  }, [timeUp]); // eslint-disable-line react-hooks/exhaustive-deps

  const tapColor = (colorIndex) => {
    if (done || colorIndex === patchColor) return; // tapping the current patch color is always a no-op — nothing new can be reachable that wasn't already absorbed last sweep
    const result = sweep({ cells, size: board.size }, patchIndices, colorIndex);
    setCells(result.cells);
    setPatchIndices(result.patchIndices);
    setSweepCount((s) => s + 1);
    if (isBloomComplete(board, result.patchIndices)) finish();
  };

  if (done) {
    return <GameResultCard icon="🌸" title="Bloomed" valueLabel={`${sweepCount} sweep${sweepCount === 1 ? "" : "s"}`} />;
  }

  if (!startTime) {
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic" }}>Loading...</p>
      </Card>
    );
  }

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <h3 style={{ color: "#c99bdb", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🌸 Bloom</h3>
        <Badge>{sweepCount} sweep{sweepCount === 1 ? "" : "s"}</Badge>
      </div>
      <p style={{ color: "#6b4f99", fontSize: 11, margin: "0 0 12px" }}>
        Tap a hue — the center patch floods to that color and absorbs it. Get the whole board to one light.
      </p>

      <div style={{
        display: "grid", gridTemplateColumns: `repeat(${BOARD_SIZE}, 1fr)`, gap: 2,
        maxWidth: 340, margin: "0 auto 14px", borderRadius: 8, overflow: "hidden",
      }}>
        {cells.map((colorIdx, i) => (
          <div
            key={i}
            style={{
              aspectRatio: "1", background: COLORS[colorIdx],
              outline: patchIndices.includes(i) ? "2px solid rgba(255,255,255,0.6)" : "none",
              outlineOffset: -2,
            }}
          />
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
        {COLORS.map((hex, i) => (
          <button
            key={i} onClick={() => tapColor(i)} disabled={i === patchColor}
            style={{
              width: 44, height: 44, borderRadius: "50%", background: hex, cursor: i === patchColor ? "default" : "pointer",
              border: i === patchColor ? "3px solid rgba(255,255,255,0.8)" : "2px solid rgba(255,255,255,0.2)",
              opacity: i === patchColor ? 0.6 : 1,
            }}
          />
        ))}
      </div>
    </Card>
  );
}
