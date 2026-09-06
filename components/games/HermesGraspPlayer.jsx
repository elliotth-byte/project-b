import { useState, useEffect } from "react";
import { Card, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { useCountdown } from "./useCountdown";
import { usePersistedStart } from "./usePersistedStart";
import { reportScore } from "../../lib/challengeScores";
import { RELICS, generateDeck } from "../../lib/games/hermesGraspData";

const ROUND_COUNT = 8;
const MISTAKE_PENALTY_MS = 2000; // steeper than Stroop's 1500ms — a wrong grab here means misreading which of only 2 possible logic branches applied, not a simple mixup
const DNF_BASE = 999999; // same convention as StroopPlayer.jsx: a lower-is-better time gets inverted into a higher-is-better score, and DNFs still rank by progress below every finisher

export default function HermesGraspPlayer({ gameId, challenge, round, player }) {
  const seed = challenge?.startedAt || 1; // same 8 cards for everyone — a "race" only means something if it's the identical deck
  const [deck] = useState(() => generateDeck(seed, ROUND_COUNT));
  const { timeUp } = useCountdown(challenge?.endsAt);
  // Personal clock, not the shared challenge start — see StroopPlayer.jsx's
  // matching comment for why (a late page-load shouldn't inflate a
  // player's own reported time).
  const myStartTime = usePersistedStart(gameId, round.round, challenge?.startedAt, player.id);
  const [cardIdx, setCardIdx] = useState(0);
  const [penaltyMs, setPenaltyMs] = useState(0);
  const [flash, setFlash] = useState(null); // { relicId, correct } | null
  const [done, setDone] = useState(false);
  const [finalMs, setFinalMs] = useState(null);
  const [reported, setReported] = useState(false);
  const [, forceTick] = useState(0);

  const card = cardIdx < deck.length ? deck[cardIdx] : null;

  useEffect(() => {
    if (!myStartTime || done) return;
    const interval = window.setInterval(() => forceTick((t) => t + 1), 250);
    return () => window.clearInterval(interval);
  }, [myStartTime, done]);

  const grab = (relicId) => {
    if (!card || done) return;
    const correct = relicId === card.answerRelicId;
    setFlash({ relicId, correct });
    window.setTimeout(() => setFlash(null), 250);

    if (correct) {
      if (cardIdx + 1 >= ROUND_COUNT) {
        // Same negative-clamp reasoning as StroopPlayer.jsx: a device
        // clock drifting mid-session should never be able to inflate
        // the reported time into something better than real.
        const elapsed = Math.max(0, Date.now() - myStartTime) + penaltyMs;
        setFinalMs(elapsed);
        setDone(true);
      }
      setCardIdx((i) => i + 1);
    } else {
      setPenaltyMs((p) => p + MISTAKE_PENALTY_MS);
    }
  };

  useEffect(() => {
    if (timeUp && !done) setDone(true);
  }, [timeUp, done]);

  useEffect(() => {
    if (!done || reported) return;
    setReported(true);
    const score = finalMs != null ? Math.max(1, DNF_BASE - finalMs) : cardIdx;
    reportScore(gameId, round.round, player.id, player.name, score, { final: true });
  }, [done]); // eslint-disable-line react-hooks/exhaustive-deps

  const elapsedDisplay = myStartTime ? ((Math.max(0, Date.now() - myStartTime) + penaltyMs) / 1000).toFixed(1) : "0.0";

  if (done) {
    return finalMs != null
      ? <GameResultCard icon="🪽" title="All 8 Grasped!" valueLabel={`${(finalMs / 1000).toFixed(1)}s`} />
      : <GameResultCard icon="🪽" title="Time's Up" valueLabel={`${cardIdx}/${ROUND_COUNT} correct`} />;
  }

  if (!myStartTime) {
    return <Card style={{ marginBottom: 20, textAlign: "center" }}><p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic" }}>Loading...</p></Card>;
  }

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🪽 Hermes' Grasp</h3>
        <Badge>{elapsedDisplay}s · {cardIdx}/{ROUND_COUNT}</Badge>
      </div>
      <p style={{ color: "#6b4f99", fontSize: 11, margin: "0 0 12px", fontStyle: "italic" }}>
        If one relic below is shown in its own true color, grab that one. If neither is, grab the relic whose object AND true color are both missing from the two shown. Wrong grab costs {MISTAKE_PENALTY_MS / 1000}s.
      </p>

      <div style={{ display: "flex", justifyContent: "center", gap: 14, marginBottom: 16 }}>
        {card?.shown.map((s, i) => {
          const relic = RELICS.find((r) => r.id === s.relicId);
          return (
            <div
              key={i}
              style={{
                width: 96, padding: "14px 8px", borderRadius: 12,
                background: `linear-gradient(160deg, ${s.hex}33, ${s.hex}11)`,
                border: `2px solid ${s.hex}`,
                boxShadow: `0 2px 8px ${s.hex}22`,
              }}
            >
              <div style={{ fontSize: 34, marginBottom: 6 }}>{relic.emoji}</div>
              <div style={{ color: s.hex, fontSize: 11.5, fontWeight: 900, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
                {s.colorName}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
        {RELICS.map((r) => {
          const isFlashing = flash?.relicId === r.id;
          return (
            <button
              key={r.id}
              onClick={() => grab(r.id)}
              style={{
                padding: "10px 4px", borderRadius: 10, cursor: "pointer",
                background: isFlashing ? (flash.correct ? "rgba(0,255,157,0.25)" : "rgba(255,56,96,0.25)") : `linear-gradient(160deg, ${r.hex}33, ${r.hex}11)`,
                border: `2px solid ${isFlashing ? (flash.correct ? "#00ff9d" : "#ff3860") : r.hex}`,
              }}
              title={`${r.owner} ${r.name} — true color ${r.colorName}`}
            >
              <div style={{ fontSize: 22 }}>{r.emoji}</div>
              <div style={{ color: r.hex, fontSize: 9.5, fontWeight: 800, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>{r.colorName}</div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
