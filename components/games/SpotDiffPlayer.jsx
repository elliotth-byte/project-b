import { useState, useEffect, useRef } from "react";
import { Card, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { useCountdown } from "./useCountdown";
import { generateScenes, drawScene } from "../../lib/games/spotDiffData";
import { reportScore } from "../../lib/challengeScores";

const W = 300, H = 200;

export default function SpotDiffPlayer({ gameId, round, challenge, player }) {
  const cfg = challenge?.gameConfig || { differences: 5 };
  const { timeUp } = useCountdown(challenge?.endsAt);
  const seed = (challenge?.startedAt || 1) + (player?.id ? player.id.length : 0);
  const [scene] = useState(() => generateScenes(seed, cfg.differences || 5, W, H));
  const [differences, setDifferences] = useState(scene.differences);
  const [startTime] = useState(() => Date.now());
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
          b.strokeStyle = "#7a9a5c"; b.lineWidth = 3;
          b.beginPath(); b.arc(d.x, d.y, d.r, 0, Math.PI * 2); b.stroke();
        }
      });
    }
  }, [differences]); // eslint-disable-line react-hooks/exhaustive-deps

  const reportComposite = (found, final) => {
    const elapsed = Date.now() - startTime;
    const value = found * 1_000_000 - elapsed; // more found always beats fewer; faster breaks ties within equal found-count
    reportScore(gameId, round.round, player.id, player.name, value, { final, foundCount: found });
  };

  useEffect(() => { reportComposite(foundCount, false); }, [foundCount]); // eslint-disable-line react-hooks/exhaustive-deps

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
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
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
    }
  };

  if (done) {
    return <GameResultCard icon="🔍" title="Round Complete" valueLabel={`${foundCount}/${differences.length} found`} />;
  }

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ color: "#c9a84c", margin: 0, fontSize: 15, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>🔍 Spot the Difference</h3>
        <Badge>{foundCount}/{differences.length} found</Badge>
      </div>
      <p style={{ color: "#706050", fontSize: 11, margin: "0 0 6px" }}>Top: original. Bottom: tap where it's different.</p>
      <canvas ref={canvasARef} width={W} height={H} style={{ background: "#060e1a", borderRadius: 8, border: "1px solid #253550", marginBottom: 6, display: "block", margin: "0 auto 6px" }} />
      <canvas ref={canvasBRef} width={W} height={H} onClick={onClickB} style={{ background: "#060e1a", borderRadius: 8, border: "1px solid #253550", cursor: "crosshair", display: "block", margin: "0 auto" }} />
    </Card>
  );
}
