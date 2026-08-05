import { useState, useEffect, useRef } from "react";
import { Card, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { useCountdown } from "./useCountdown";
import { generateScenes, drawScene } from "../../lib/games/spotDiffData";
import { reportScore } from "../../lib/challengeScores";
import { usePersistedStart } from "./usePersistedStart";

const W = 600, H = 400;
const WRONG_CLICK_PENALTY_MS = 3000;

export default function SpotDiffPlayer({ gameId, round, challenge, player }) {
  const cfg = challenge?.gameConfig || { differences: 5 };
  const { timeUp } = useCountdown(challenge?.endsAt);
  const seed = (challenge?.startedAt || 1) + (player?.id ? player.id.length : 0);
  const [scene] = useState(() => generateScenes(seed, cfg.differences || 5, W, H));
  const [differences, setDifferences] = useState(scene.differences);
  // Persisted (not just local) so a wrong-click penalty / found-count score
  // stays comparable across a remount — otherwise navigating away and back
  // would quietly reset the elapsed-time component of the score.
  const startTime = usePersistedStart(gameId, round.round, player.id);
  const [penaltyMs, setPenaltyMs] = useState(0);
  const [flash, setFlash] = useState(false); // brief red flash on a wrong click
  const [done, setDone] = useState(false);
  const canvasARef = useRef(null);
  const canvasBRef = useRef(null);
  const reportedRef = useRef(false);
  const foundCount = differences.filter((d) => d.found).length;

  useEffect(() => {
    const a = canvasARef.current?.getContext("2d");
    const b = canvasBRef.current?.getContext("2d");
    if (a) drawScene(a, W, H, scene.sceneA);
    if (b) {
      drawScene(b, W, H, scene.sceneB);
      differences.forEach((d) => {
        if (d.found) {
          b.strokeStyle = "#00ff9d"; b.lineWidth = 3;
          b.beginPath(); b.arc(d.x, d.y, d.r, 0, Math.PI * 2); b.stroke();
        }
      });
    }
  }, [differences]); // eslint-disable-line react-hooks/exhaustive-deps

  const reportComposite = (found, final, penalty = penaltyMs) => {
    if (!startTime) return;
    const elapsed = Date.now() - startTime + penalty;
    const value = found * 1_000_000 - elapsed; // more found always beats fewer; faster (incl. wrong-click penalties) breaks ties within equal found-count
    reportScore(gameId, round.round, player.id, player.name, value, { final, foundCount: found });
  };

  useEffect(() => { reportComposite(foundCount, false); }, [foundCount, penaltyMs, startTime]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (timeUp && !reportedRef.current) {
      reportedRef.current = true;
      setDone(true);
      reportComposite(foundCount, true);
    }
  }, [timeUp]); // eslint-disable-line react-hooks/exhaustive-deps

  const onClickB = (e) => {
    if (done) return;
    const rect = canvasBRef.current.getBoundingClientRect();
    const scaleX = W / rect.width, scaleY = H / rect.height;
    const x = (e.clientX - rect.left) * scaleX, y = (e.clientY - rect.top) * scaleY;
    let changed = false;
    const next = differences.map((d) => {
      if (!d.found && Math.hypot(d.x - x, d.y - y) < d.r + 6) { changed = true; return { ...d, found: true }; }
      return d;
    });
    if (changed) {
      setDifferences(next);
      if (next.every((d) => d.found) && !reportedRef.current) {
        reportedRef.current = true;
        setDone(true);
        reportComposite(next.length, true);
      }
    } else {
      // Missed — costs time, same as if the clock just ran that much further.
      setPenaltyMs((p) => p + WRONG_CLICK_PENALTY_MS);
      setFlash(true);
      window.setTimeout(() => setFlash(false), 250);
    }
  };

  if (done) {
    return <GameResultCard icon="🔍" title="Round Complete" valueLabel={`${foundCount}/${differences.length} found`} />;
  }
  if (!startTime) {
    return <Card style={{ marginBottom: 20, textAlign: "center" }}><p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic" }}>Loading...</p></Card>;
  }

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🔍 Spot the Difference</h3>
        <Badge>{foundCount}/{differences.length} found</Badge>
      </div>
      <p style={{ color: "#6b4f99", fontSize: 11, margin: "0 0 6px" }}>
        Top: original. Bottom: tap where it's different. Wrong clicks cost you {WRONG_CLICK_PENALTY_MS / 1000}s.
      </p>
      {penaltyMs > 0 && <p style={{ color: "#ff3860", fontSize: 11, margin: "0 0 6px", fontWeight: 700 }}>-{(penaltyMs / 1000).toFixed(0)}s time penalty so far</p>}
      <canvas ref={canvasARef} width={W} height={H} style={{ width: "100%", maxWidth: W, height: "auto", background: "#0d0618", borderRadius: 8, border: "1px solid #3d1f5c", marginBottom: 6, display: "block", margin: "0 auto 6px" }} />
      <canvas
        ref={canvasBRef} width={W} height={H} onClick={onClickB}
        style={{
          width: "100%", maxWidth: W, height: "auto", background: "#0d0618", borderRadius: 8,
          border: `2px solid ${flash ? "#ff3860" : "#3d1f5c"}`, cursor: "crosshair", display: "block", margin: "0 auto",
          transition: "border-color 0.15s",
        }}
      />
    </Card>
  );
}
