import { useState, useEffect } from "react";
import { Card, Badge, PausedBanner } from "./traitorsUi";
import { storageUpdate, subscribeGameState } from "../lib/gameStorage";
import { STORAGE_KEY_PICKPOCKET, PICKPOCKET_ROUND_COUNT, PICKPOCKET_MISTAKE_PENALTY_MS, TRINKETS } from "../lib/pickpocketGraspData";
import TrinketIcon from "./games/TraitorsTrinketIcons";
import { TRAITORS_GAME_REGISTRY } from "../lib/traitorsMiniGames";
import TraitorsRulesGate from "./games/TraitorsRulesGate";
import { useTraitorsPersistedStart } from "./games/useTraitorsPersistedStart";

// ─── The Pickpocket's Grasp: Player View ───
// Durable per-player start (useTraitorsPersistedStart) rather than a
// shared round timer — same convention WordPlayer.jsx uses for its own
// race clock, so a tab switch or remount reads back the same start
// time instead of quietly restarting this player's own race.
export default function PickpocketGraspPlayer({ gameId, playerName }) {
  const [st, setSt] = useState(null);
  const [cardIdx, setCardIdx] = useState(0);
  const [penaltyMs, setPenaltyMs] = useState(0);
  const [flash, setFlash] = useState(null); // { trinketId, correct } | null
  const [finishTime, setFinishTime] = useState(null);
  const [, forceTick] = useState(0);

  useEffect(() => {
    const unsubscribe = subscribeGameState(gameId, STORAGE_KEY_PICKPOCKET, (value) => {
      setSt(value);
      if (value?.times?.[playerName] != null) setFinishTime(value.times[playerName]);
    });
    return unsubscribe;
  }, [gameId, playerName]);

  const startTime = useTraitorsPersistedStart(gameId, STORAGE_KEY_PICKPOCKET, st?.createdAt, playerName);

  useEffect(() => {
    if (!startTime || finishTime || st?.paused) return;
    const interval = window.setInterval(() => forceTick((t) => t + 1), 250);
    return () => window.clearInterval(interval);
  }, [startTime, finishTime, st?.paused]);

  if (!st || !st.active) return null;
  if (st.paused) return <PausedBanner icon="🤌" title="The Pickpocket's Grasp" />;

  const isParticipant = !st.participants || st.participants.includes(playerName);
  if (st.participants && !isParticipant) {
    return (
      <Card style={{ marginBottom: 20, borderColor: "rgba(201,168,76,0.3)", textAlign: "center" }}>
        <h3 style={{ color: "#c9a84c", margin: "0 0 6px", fontSize: 15, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>🤌 The Pickpocket's Grasp</h3>
        <p style={{ color: "#a09080", fontSize: 13, margin: 0, fontStyle: "italic" }}>You're spectating this mission.</p>
      </Card>
    );
  }

  const registryEntry = TRAITORS_GAME_REGISTRY[STORAGE_KEY_PICKPOCKET];
  const card = cardIdx < (st.deck?.length || 0) ? st.deck[cardIdx] : null;

  const grab = async (trinketId) => {
    if (!card || finishTime) return;
    const correct = trinketId === card.answerTrinketId;
    setFlash({ trinketId, correct });
    window.setTimeout(() => setFlash(null), 250);

    if (correct) {
      if (cardIdx + 1 >= PICKPOCKET_ROUND_COUNT) {
        const elapsed = Math.max(0, Date.now() - startTime) + penaltyMs;
        setFinishTime(elapsed);
        await storageUpdate(gameId, STORAGE_KEY_PICKPOCKET, (fresh) => {
          if (!fresh || fresh.times[playerName] != null) return null;
          fresh.times = { ...(fresh.times || {}), [playerName]: elapsed };
          return fresh;
        });
      }
      setCardIdx((i) => i + 1);
    } else {
      setPenaltyMs((p) => p + PICKPOCKET_MISTAKE_PENALTY_MS);
    }
  };

  const elapsedDisplay = startTime ? ((Math.max(0, Date.now() - startTime) + penaltyMs) / 1000).toFixed(1) : "0.0";

  if (finishTime != null) {
    return (
      <TraitorsRulesGate icon={registryEntry.icon} label={registryEntry.label} blurb={registryEntry.blurb} resetKey={st.createdAt}>
        <Card style={{ marginBottom: 20, borderColor: "rgba(201,168,76,0.3)", textAlign: "center" }}>
          <h3 style={{ color: "#c9a84c", margin: "0 0 6px", fontSize: 15, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>🤌 The Pickpocket's Grasp</h3>
          <div style={{ fontSize: 12, color: "#7a9a5c", textTransform: "uppercase", letterSpacing: 2, fontWeight: 700, marginTop: 10 }}>✦ All 8 Grasped ✦</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#c9a84c", margin: "8px 0", fontFamily: "'Courier New', Courier, monospace" }}>
            {(finishTime / 1000).toFixed(2)}s
          </div>
        </Card>
      </TraitorsRulesGate>
    );
  }

  if (!startTime) {
    return <Card style={{ marginBottom: 20, textAlign: "center" }}><p style={{ color: "#706050", fontSize: 13, fontStyle: "italic" }}>Loading...</p></Card>;
  }

  return (
    <TraitorsRulesGate icon={registryEntry.icon} label={registryEntry.label} blurb={registryEntry.blurb} resetKey={st.createdAt}>
    <Card style={{ marginBottom: 20, borderColor: "rgba(201,168,76,0.3)", textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <h3 style={{ color: "#c9a84c", margin: 0, fontSize: 15, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>🤌 The Pickpocket's Grasp</h3>
        <Badge>{elapsedDisplay}s · {cardIdx}/{PICKPOCKET_ROUND_COUNT}</Badge>
      </div>
      <p style={{ color: "#706050", fontSize: 11, margin: "0 0 12px", fontStyle: "italic" }}>
        If one trinket below is shown in its own true color, grab that one. If neither is, grab the trinket whose object AND true color are both missing from the two shown. Wrong grab costs {PICKPOCKET_MISTAKE_PENALTY_MS / 1000}s.
      </p>

      <div style={{ display: "flex", justifyContent: "center", gap: 14, marginBottom: 16 }}>
        {card?.shown.map((s, i) => (
          <div
            key={i}
            style={{
              width: 96, padding: "14px 8px", borderRadius: 12,
              background: `linear-gradient(160deg, ${s.hex}33, ${s.hex}11)`,
              border: `2px solid ${s.hex}`,
            }}
          >
            <div style={{ marginBottom: 6 }}><TrinketIcon type={s.trinketId} color={s.hex} size={40} /></div>
            <div style={{ color: s.hex, fontSize: 11.5, fontWeight: 700, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>
              {s.colorName}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
        {TRINKETS.map((t) => {
          const isFlashing = flash?.trinketId === t.id;
          return (
            <button
              key={t.id}
              onClick={() => grab(t.id)}
              style={{
                padding: "10px 4px", borderRadius: 10, cursor: "pointer",
                background: isFlashing ? (flash.correct ? "rgba(122,154,92,0.25)" : "rgba(196,92,60,0.25)") : `linear-gradient(160deg, ${t.hex}33, ${t.hex}11)`,
                border: `2px solid ${isFlashing ? (flash.correct ? "#7a9a5c" : "#c45c3c") : t.hex}`,
              }}
              title={`${t.name} — true color ${t.colorName}`}
            >
              <div style={{ marginBottom: 2 }}><TrinketIcon type={t.id} color={t.hex} size={24} /></div>
              <div style={{ color: t.hex, fontSize: 9.5, fontWeight: 700, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>{t.colorName}</div>
            </button>
          );
        })}
      </div>
    </Card>
    </TraitorsRulesGate>
  );
}
