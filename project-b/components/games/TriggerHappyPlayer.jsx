import { useState, useEffect, useRef, useMemo } from "react";
import { Card, Badge, Btn } from "../ui";
import GameResultCard from "./GameResultCard";
import TriggerHappyGridInput from "./TriggerHappyGridInput";
import { useCountdown } from "./useCountdown";
import { reportScore } from "../../lib/challengeScores";
import { RELICS } from "../../lib/games/hermesGraspData";
import { GRID_ROWS, GRID_COLS, TOTAL_CELLS, generateLayout, countCorrect } from "../../lib/games/triggerHappyData";

function relicEmoji(id) {
  return RELICS.find((r) => r.id === id)?.emoji || "";
}

// Score tier + replication-time clamp, same shape as
// SlidingPuzzlePlayer.jsx's FINISH_BASE fix (see its own comment for
// the full story) — chosen large enough that accuracy always
// dominates: 20 possible cells * 10,000,000 per cell comfortably
// exceeds any Math.min-clamped replicationMs subtracted from it, so a
// single extra correct cell always outranks any amount of speed, and
// within equal accuracy a strictly smaller replicationMs always wins.
// This is deliberately baked directly into the reported score value,
// not left to lib/challenges/scores.js's own generic
// first-to-report-wins tiebreak — that tiebreak would otherwise
// resolve ties on OVERALL submission order (however long a player
// spent freely studying the grid before ever pulling the lever), not
// on pure replication speed the way this game is meant to reward.
const ACCURACY_TIER = 10000000;
const MS_CAP = 9999999;

// Design call: submission is allowed as soon as at least one cell has
// been placed, rather than gating "Lock In" behind a fully-filled
// grid. A player who's simply unsure of 1-2 cells (or ran out of
// patience) can still lock in — every still-blank cell just scores as
// wrong, exactly as if they'd guessed something incorrect there. This
// was picked over a hard full-fill requirement specifically to avoid a
// confused/stuck player who can't get their last cell right ever
// having no way to submit at all; the countdown-driven timeout below
// is the final backstop for anyone who never submits regardless.
export default function TriggerHappyPlayer({ gameId, challenge, round, player }) {
  const startedAt = challenge?.startedAt || null;
  const layout = useMemo(() => generateLayout(startedAt || 1), [startedAt]);
  const { timeUp } = useCountdown(challenge?.endsAt);

  const [leverPulledAt, setLeverPulledAt] = useState(null);
  const [placed, setPlaced] = useState(() => Array(TOTAL_CELLS).fill(null));
  const [result, setResult] = useState(null); // { accuracy, replicationMs }
  const reportedRef = useRef(false);

  // Per-cell randomized flicker params, generated once per layout —
  // exactly the "hard to screenshot" technique from
  // components/games/WordScramblePlayer.jsx (see its own comment,
  // lines ~83-107): each cell gets its own randomized fadePeriodMs and
  // fadePhase, and opacity is computed live at render time from
  // Date.now(), never fully invisible (min 0.08).
  const flickerRef = useRef(null);
  if (!flickerRef.current) {
    flickerRef.current = layout.map(() => ({
      fadePeriodMs: 6000 + Math.random() * 3000,
      fadePhase: Math.random() * Math.PI * 2,
    }));
  }
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (leverPulledAt || result) return; // grid's blank (or the game's over) — nothing left to flicker
    const id = window.setInterval(() => forceTick((t) => t + 1), 80);
    return () => window.clearInterval(id);
  }, [leverPulledAt, result]);

  const pullLever = () => {
    if (leverPulledAt) return;
    setLeverPulledAt(Date.now());
  };

  const finalize = (accuracy, replicationMs) => {
    if (result) return;
    setResult({ accuracy, replicationMs: Math.max(0, replicationMs) });
  };

  const submit = () => {
    if (!leverPulledAt || result) return;
    finalize(countCorrect(layout, placed), Date.now() - leverPulledAt);
  };

  // Safety net: the round's own outer timer running out before the
  // player ever pulls the lever or submits — same
  // useCountdown-driven auto-finalize every solo game here uses, so an
  // AFK player still gets a real reported score instead of leaving the
  // round stalled on them.
  useEffect(() => {
    if (!timeUp || result) return;
    if (!leverPulledAt) {
      finalize(0, MS_CAP);
    } else {
      finalize(countCorrect(layout, placed), Date.now() - leverPulledAt);
    }
  }, [timeUp]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!result || reportedRef.current) return;
    reportedRef.current = true;
    const value = result.accuracy * ACCURACY_TIER - Math.min(result.replicationMs, MS_CAP);
    reportScore(gameId, round.round, player.id, player.name, value, { final: true });
  }, [result]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!startedAt) {
    return <Card style={{ marginBottom: 20, textAlign: "center" }}><p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic" }}>Loading...</p></Card>;
  }

  if (result) {
    return (
      <GameResultCard
        icon="🎚️"
        title="Locked In"
        valueLabel={`${result.accuracy}/${TOTAL_CELLS} correct — ${(result.replicationMs / 1000).toFixed(1)}s`}
      />
    );
  }

  const filledCount = placed.filter((c) => c != null).length;

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🎚️ Trigger Happy</h3>
        {leverPulledAt && <Badge>{filledCount}/{TOTAL_CELLS} placed</Badge>}
      </div>

      {!leverPulledAt ? (
        <>
          <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 12px" }}>
            Study where every relic sits — take as long as you like — then pull the lever to blank the grid and replicate it from memory.
          </p>
          <div
            style={{
              display: "grid", gridTemplateColumns: `repeat(${GRID_COLS}, 52px)`, gridTemplateRows: `repeat(${GRID_ROWS}, 52px)`,
              gap: 5, margin: "0 auto 16px", width: "fit-content", background: "#05010f", border: "2px solid #3d1f5c", borderRadius: 8, padding: 6,
            }}
          >
            {layout.map((relicId, i) => {
              const fp = flickerRef.current[i];
              const opacity = 0.08 + 0.92 * (0.5 + 0.5 * Math.sin((Date.now() / fp.fadePeriodMs) * Math.PI * 2 + fp.fadePhase));
              return (
                <div
                  key={i}
                  style={{
                    width: 52, height: 52, fontSize: 24, borderRadius: 6, background: "linear-gradient(160deg, #1a1330, #0d0618)",
                    border: "2px solid #3d1f5c", display: "flex", alignItems: "center", justifyContent: "center",
                    opacity, transition: "opacity 0.05s linear",
                  }}
                >
                  {relicEmoji(relicId)}
                </div>
              );
            })}
          </div>
          <Btn onClick={pullLever}>Pull the Lever 🎚️</Btn>
        </>
      ) : (
        <>
          <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 10px" }}>
            Grid's blank — place every relic back where it was.
          </p>
          <TriggerHappyGridInput grid={placed} onChange={setPlaced} cols={GRID_COLS} />
          <div style={{ marginTop: 12 }}>
            <Btn onClick={submit} disabled={filledCount === 0}>Lock In My Grid</Btn>
          </div>
        </>
      )}
    </Card>
  );
}
