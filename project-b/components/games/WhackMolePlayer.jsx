import { useState, useEffect, useRef, useMemo } from "react";
import { Card, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { useCountdown } from "./useCountdown";
import { usePersistedStart } from "./usePersistedStart";
import { reportScore } from "../../lib/challengeScores";
import { HOLES, DURATION_MS, MOLE_TYPES, generateMoleSchedule } from "../../lib/games/whackMoleData";

const MOLE_STYLE = {
  normal: { emoji: "🐹", bg: "transparent", glow: "none", label: "" },
  gold: { emoji: "🐹", bg: "rgba(255,215,0,0.25)", glow: "0 0 16px #ffd700", label: "+5" },
  red: { emoji: "🐹", bg: "rgba(255,56,96,0.25)", glow: "0 0 16px #ff3860", label: "−3" },
};

export default function WhackMolePlayer({ gameId, round, challenge, player }) {
  // Whack-a-Mole always runs 90 seconds flat, independent of whatever
  // duration the host set for the round — so it uses its own clock
  // rather than challenge?.endsAt. That clock's start time is persisted
  // (see usePersistedStart) so navigating away mid-game and coming back
  // doesn't hand the player a fresh 90 seconds.
  const startedAt = usePersistedStart(gameId, round.round, challenge?.startedAt, player.id);
  const localEndsAt = startedAt ? startedAt + DURATION_MS : null;
  const { remainingSec, timeUp } = useCountdown(localEndsAt);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const [, setTick] = useState(0);
  const reportedRef = useRef(false);
  const whackedRef = useRef(new Set());

  // Same seed on every player's device -> the identical sequence of mole
  // spawns for everyone, so "most whacks" is a fair, standardized
  // contest — see lib/games/whackMoleData.js.
  const schedule = useMemo(() => generateMoleSchedule(challenge?.startedAt || 1), [challenge?.startedAt]);

  useEffect(() => {
    if (timeUp) return;
    const interval = window.setInterval(() => setTick((t) => t + 1), 80);
    return () => window.clearInterval(interval);
  }, [timeUp]);

  useEffect(() => {
    reportScore(gameId, round.round, player.id, player.name, score, { final: false });
  }, [score]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (timeUp && !reportedRef.current) {
      reportedRef.current = true;
      setDone(true);
      reportScore(gameId, round.round, player.id, player.name, score, { final: true });
    }
  }, [timeUp]); // eslint-disable-line react-hooks/exhaustive-deps

  const elapsed = startedAt ? Math.max(0, Date.now() - startedAt) : 0; // clamped -- a negative value here would show the wrong (or no) moles active, not corrupt the score itself (score is the raw whack count, not time-based), but it's never a meaningful value regardless
  // Several events can be active at once (different holes, possibly
  // different types) — that's "multiple mole types at the same time".
  const activeByHole = {};
  schedule.forEach((e) => {
    if (whackedRef.current.has(e.id)) return;
    if (elapsed >= e.time && elapsed < e.time + e.durationMs) activeByHole[e.holeIndex] = e;
  });

  const whack = (holeIndex) => {
    const event = activeByHole[holeIndex];
    if (!event || whackedRef.current.has(event.id)) return;
    whackedRef.current.add(event.id);
    const points = MOLE_TYPES[event.type].points;
    setScore((s) => Math.max(0, s + points));
    setTick((t) => t + 1); // force the just-whacked mole to disappear immediately
  };

  if (done) return <GameResultCard icon="🔨" title="Time's Up" valueLabel={`${score} pts`} />;
  if (!startedAt) return <Card style={{ marginBottom: 20, textAlign: "center" }}><p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic" }}>Loading...</p></Card>;

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🔨 Whack-a-Mole</h3>
        <Badge color={remainingSec != null && remainingSec <= 10 ? "#ff3860" : "#ff2d95"}>{remainingSec != null ? `${remainingSec}s` : "∞"} · {score} pts</Badge>
      </div>
      <p style={{ fontSize: 10.5, color: "#6b4f99", margin: "0 0 10px" }}>
        <span style={{ color: "#ffd700" }}>Gold</span> = +5 · <span style={{ color: "#ff3860" }}>Red</span> = −3 · plain = +1
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 70px)", gap: 8, margin: "0 auto", width: "fit-content" }}>
        {Array.from({ length: HOLES }).map((_, i) => {
          const event = activeByHole[i];
          const style = event ? MOLE_STYLE[event.type] : null;
          return (
            <button
              key={i} onClick={() => whack(i)}
              style={{
                width: 70, height: 70, borderRadius: "50%", fontSize: 32, cursor: "pointer", position: "relative",
                // A dark radial gradient (lighter rim, near-black center)
                // instead of a flat fill — reads as an actual hole to
                // pop out of rather than a plain dark circle. The
                // per-type glow (style.bg/glow) still layers on top via
                // the box-shadow below, unchanged.
                background: style
                  ? `radial-gradient(circle at 50% 40%, ${style.bg}, #050108 75%)`
                  : "radial-gradient(circle at 50% 40%, #1a0a2e, #050108 75%)",
                border: "3px solid #3d1f5c", overflow: "hidden",
                boxShadow: style ? `inset 0 4px 8px rgba(0,0,0,0.6), ${style.glow}` : "inset 0 4px 8px rgba(0,0,0,0.6)",
                transition: "background 0.05s, box-shadow 0.05s",
              }}
            >
              {style ? style.emoji : ""}
              {style?.label && (
                <span style={{ position: "absolute", top: 2, right: 4, fontSize: 10, fontWeight: 900, color: event.type === "gold" ? "#ffd700" : "#ff3860" }}>
                  {style.label}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </Card>
  );
}
