import { useState, useRef, useEffect, useCallback } from "react";
import { Card, Badge, Btn } from "../ui";
import GameResultCard from "./GameResultCard";
import { useCountdown } from "./useCountdown";
import { usePersistedStart } from "./usePersistedStart";
import {
  generatePuzzle, rescramble, computeCrossings, isUntangled, BOARD_W, BOARD_H,
} from "../../lib/games/tangleData";
import { reportScore } from "../../lib/challengeScores";

// Solo, client-only (see lib/games/tangleData.js's own header comment
// on how solvability is actually guaranteed — this component just
// renders and lets the player drag the already-verified-untanglable
// graph it's handed).
export default function TanglePlayer({ gameId, round, challenge, player }) {
  const { timeUp } = useCountdown(challenge?.endsAt);
  const seed = (challenge?.startedAt || 1) + (player?.id ? player.id.length : 0);
  const [puzzle] = useState(() => generatePuzzle(seed));
  const startTime = usePersistedStart(gameId, round.round, challenge?.startedAt, player.id);
  const [nodes, setNodes] = useState(puzzle.nodes);
  const [rescrambleCount, setRescrambleCount] = useState(0);
  const [done, setDone] = useState(false);
  const dragRef = useRef(null); // { nodeIndex } while a drag is in progress
  const svgRef = useRef(null);
  const reportedRef = useRef(false);

  const crossings = computeCrossings(nodes, puzzle.edges);

  const finish = useCallback(() => {
    if (reportedRef.current || !startTime) return;
    reportedRef.current = true;
    setDone(true);
    const elapsedMs = Math.max(0, Date.now() - startTime); // clamped -- a device clock drifting mid-session must never send this negative (see RedLightGreenLightPlayer.jsx for the full story on why this matters: it INFLATES a score instead of just corrupting it the usual way)
    // "Your time is your score — the faster you untangle, the
    // better" — purely speed-based, no secondary bonus of any kind,
    // matching the game's own rules exactly rather than inventing an
    // efficiency metric the way Tavo's move count or Hue's closeness
    // score do for THEIR games.
    const value = Math.max(1, 10_000_000 - elapsedMs);
    reportScore(gameId, round.round, player.id, player.name, value, { final: true });
  }, [startTime, gameId, round.round, player.id, player.name]);

  useEffect(() => {
    if (timeUp && !reportedRef.current) finish();
  }, [timeUp, finish]);

  // Converts a pointer event's screen coordinates into the SVG's own
  // internal viewBox coordinate space — necessary because the SVG is
  // displayed responsively (scaled to fit the screen width), so raw
  // clientX/clientY don't directly correspond to node coordinates.
  const toSvgPoint = useCallback((e) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const transformed = pt.matrixTransform(ctm.inverse());
    return { x: transformed.x, y: transformed.y };
  }, []);

  const onPointerDown = (nodeIndex) => (e) => {
    if (done) return;
    e.preventDefault();
    dragRef.current = { nodeIndex };
    e.target.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e) => {
    if (done || !dragRef.current) return;
    const p = toSvgPoint(e);
    if (!p) return;
    const { nodeIndex } = dragRef.current;
    setNodes((current) => {
      const next = [...current];
      next[nodeIndex] = {
        x: Math.max(0, Math.min(BOARD_W, p.x)),
        y: Math.max(0, Math.min(BOARD_H, p.y)),
      };
      return next;
    });
  };

  const onPointerUp = () => {
    if (done || !dragRef.current) return;
    dragRef.current = null;
    setNodes((current) => {
      if (isUntangled(current, puzzle.edges)) finish();
      return current;
    });
  };

  const doRescramble = () => {
    if (done) return;
    const next = rescramble(seed, rescrambleCount + 1);
    setRescrambleCount((c) => c + 1);
    setNodes(next);
  };

  if (done) {
    return <GameResultCard icon="🪢" title="Untangled!" valueLabel="Solved" />;
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
        <h3 style={{ color: "#4d96ff", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🪢 Tangle</h3>
        <Badge>{crossings.size > 0 ? `${crossings.size} crossing` : "clear"}{crossings.size === 1 ? "" : crossings.size > 0 ? "s" : ""}</Badge>
      </div>
      <p style={{ color: "#6b4f99", fontSize: 11, margin: "0 0 10px" }}>
        Drag the dots until no strings cross — every knot here can be fully untangled.
      </p>

      <svg
        ref={svgRef} viewBox={`0 0 ${BOARD_W} ${BOARD_H}`}
        style={{ width: "100%", maxWidth: 320, aspectRatio: "1", touchAction: "none", background: "#0d0618", borderRadius: 10 }}
        onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}
      >
        {puzzle.edges.map(([a, b], i) => (
          <line
            key={i} x1={nodes[a].x} y1={nodes[a].y} x2={nodes[b].x} y2={nodes[b].y}
            stroke={crossings.has(i) ? "#ff3860" : "#4d96ff"} strokeWidth={2.5} strokeLinecap="round"
          />
        ))}
        {nodes.map((n, i) => (
          <circle
            key={i} cx={n.x} cy={n.y} r={12} fill="#f5f0ff" stroke="#4d96ff" strokeWidth={2}
            onPointerDown={onPointerDown(i)} style={{ cursor: "grab" }}
          />
        ))}
      </svg>

      <Btn small variant="ghost" onClick={doRescramble} style={{ marginTop: 12 }}>🔄 Re-scramble</Btn>
      <p style={{ color: "#6b4f99", fontSize: 10, margin: "6px 0 0", fontStyle: "italic" }}>
        Re-scramble keeps the clock running.
      </p>
    </Card>
  );
}
