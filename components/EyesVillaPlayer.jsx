import { useState, useEffect, useRef } from "react";
import { Card, Badge, PausedBanner } from "./traitorsUi";
import { storageUpdate, subscribeGameState } from "../lib/gameStorage";
import { STORAGE_KEY_EYES_VILLA, EYES_VILLA_ROUNDS } from "../lib/eyesVillaData";
import { MaskGallery, MASK_COLORS } from "./games/TraitorsMaskIcons";
import { TRAITORS_GAME_REGISTRY } from "../lib/traitorsMiniGames";
import TraitorsRulesGate from "./games/TraitorsRulesGate";

// ─── Eyes of the Villa: Player View ───
// Each player moves through the same pre-generated 8 rounds (see
// EyesVillaHost.jsx's start()) entirely at their own pace — no waiting
// on anyone else, same shape components/MasqueradePlayer.jsx's guesses
// map already uses, just keyed by round index instead of a guess type.
export default function EyesVillaPlayer({ gameId, playerName }) {
  const [st, setSt] = useState(null);
  const [feedback, setFeedback] = useState(null); // { correct: bool, correctZone } | null
  const roundStartRef = useRef(Date.now());

  useEffect(() => {
    const unsubscribe = subscribeGameState(gameId, STORAGE_KEY_EYES_VILLA, setSt);
    return unsubscribe;
  }, [gameId]);

  const myEntry = st?.results?.[playerName];
  const roundIndex = myEntry?.answers?.length || 0;

  useEffect(() => { roundStartRef.current = Date.now(); }, [roundIndex]);

  if (!st || !st.active) return null;
  if (st.paused) return <PausedBanner icon="👁️" title="Eyes of the Villa" />;

  const isParticipant = !st.participants || st.participants.includes(playerName);
  if (st.participants && !isParticipant) {
    return (
      <Card style={{ marginBottom: 20, borderColor: "rgba(201,168,76,0.3)", textAlign: "center" }}>
        <h3 style={{ color: "#c9a84c", margin: "0 0 6px", fontSize: 15, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>👁️ Eyes of the Villa</h3>
        <p style={{ color: "#a09080", fontSize: 13, margin: 0, fontStyle: "italic" }}>You're spectating this mission.</p>
      </Card>
    );
  }

  const done = roundIndex >= EYES_VILLA_ROUNDS;
  const registryEntry = TRAITORS_GAME_REGISTRY[STORAGE_KEY_EYES_VILLA];

  if (done) {
    return (
      <TraitorsRulesGate icon={registryEntry.icon} label={registryEntry.label} blurb={registryEntry.blurb} resetKey={st.createdAt}>
        <Card style={{ marginBottom: 20, borderColor: "rgba(201,168,76,0.3)", textAlign: "center" }}>
          <h3 style={{ color: "#c9a84c", margin: "0 0 6px", fontSize: 15, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>👁️ Eyes of the Villa</h3>
          <p style={{ fontSize: 13, color: "#7a9a5c", fontWeight: 700, margin: "10px 0" }}>
            ✦ {myEntry.correctCount}/{EYES_VILLA_ROUNDS} correct ✦
          </p>
          <p style={{ fontSize: 12, color: "#a09080", margin: 0 }}>Total time: {(myEntry.totalTimeMs / 1000).toFixed(1)}s</p>
        </Card>
      </TraitorsRulesGate>
    );
  }

  const currentRound = st.rounds?.[roundIndex];
  if (!currentRound) return <Card style={{ marginBottom: 20, textAlign: "center" }}><p style={{ color: "#706050", fontStyle: "italic" }}>Loading...</p></Card>;

  const answer = async (zoneKey) => {
    if (feedback) return;
    const timeMs = Date.now() - roundStartRef.current;
    const correct = currentRound.correctZone === zoneKey;
    setFeedback({ correct, correctZone: currentRound.correctZone });
    const res = await storageUpdate(gameId, STORAGE_KEY_EYES_VILLA, (fresh) => {
      if (!fresh) return null;
      const existing = fresh.results[playerName] || { answers: [], correctCount: 0, totalTimeMs: 0 };
      if (existing.answers[roundIndex]) return null; // already answered this one
      const isCorrect = fresh.rounds[roundIndex].correctZone === zoneKey;
      const nextAnswers = [...existing.answers];
      nextAnswers[roundIndex] = { correct: isCorrect, timeMs };
      fresh.results[playerName] = {
        answers: nextAnswers,
        correctCount: existing.correctCount + (isCorrect ? 1 : 0),
        totalTimeMs: existing.totalTimeMs + timeMs,
      };
      return fresh;
    });
    if (res.ok) setSt(res.value);
    setTimeout(() => setFeedback(null), 1200);
  };

  return (
    <TraitorsRulesGate icon={registryEntry.icon} label={registryEntry.label} blurb={registryEntry.blurb} resetKey={st.createdAt}>
    <Card style={{ marginBottom: 20, borderColor: "rgba(201,168,76,0.3)", textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <h3 style={{ color: "#c9a84c", margin: 0, fontSize: 15, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>👁️ Eyes of the Villa</h3>
        <Badge>Round {roundIndex + 1} / {EYES_VILLA_ROUNDS}</Badge>
      </div>
      <p style={{ color: "#a09080", fontSize: 13, margin: "0 0 14px" }}>
        Which gallery has the most <strong style={{ color: MASK_COLORS[currentRound.targetColor] }}>{currentRound.targetColor}</strong> masks?
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10, maxWidth: 280, margin: "0 auto" }}>
        {currentRound.zones.map((zone) => (
          <MaskGallery
            key={zone.zone} zone={zone} size={240}
            highlight={feedback && zone.zone === feedback.correctZone}
            onClick={() => answer(zone.zone)}
            disabled={!!feedback}
          />
        ))}
      </div>
      {feedback && (
        <p style={{ marginTop: 12, fontSize: 14, fontWeight: 700, color: feedback.correct ? "#7a9a5c" : "#c45c3c" }}>
          {feedback.correct ? "✅ Correct!" : `Gallery ${feedback.correctZone} had the most`}
        </p>
      )}
    </Card>
    </TraitorsRulesGate>
  );
}
