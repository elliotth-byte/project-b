import { useState, useEffect } from "react";
import { Card } from "./ui";
import { storageUpdate, subscribeGameState } from "../lib/gameStorage";
import { KEY_FATES, KEY_CHALLENGE } from "../lib/gameState";
import { isValidNomination } from "../lib/fatesLogic";

export default function FatesPlayer({ gameId, player, players, round }) {
  const [fates, setFates] = useState(null);
  const [challenge, setChallenge] = useState(null);
  const [choice, setChoice] = useState("");

  useEffect(() => {
    const unsubscribe = subscribeGameState(gameId, KEY_FATES, setFates);
    return unsubscribe;
  }, [gameId, round?.round]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const unsubscribe = subscribeGameState(gameId, KEY_CHALLENGE, setChallenge);
    return unsubscribe;
  }, [gameId, round?.round]); // eslint-disable-line react-hooks/exhaustive-deps

  if (round?.phase !== "fates" || !fates) return null;

  const myEntry = fates.nominatorOrder.find((n) => n.playerId === player?.id);
  if (!myEntry) {
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <div style={{ fontSize: 12, letterSpacing: 4, textTransform: "uppercase", color: "#c9a84c", marginBottom: 6 }}>⚖️ Fates Ceremony</div>
        <p style={{ color: "#706050", fontSize: 13, fontStyle: "italic", margin: 0 }}>
          The top 3 finishers are making their nominations. Await the reveal.
        </p>
      </Card>
    );
  }

  const winnerId = (challenge?.placements || []).find((p) => p.place === 1)?.playerId || null;
  const alreadySubmitted = fates.nominations?.[player.id];
  const others = (players || []).filter((p) => p.approved && p.alive);

  if (alreadySubmitted) {
    const name = others.find((p) => p.id === alreadySubmitted)?.display_name;
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <div style={{ fontSize: 12, letterSpacing: 4, textTransform: "uppercase", color: "#7a9a5c", marginBottom: 6 }}>Nomination Submitted</div>
        <p style={{ color: "#f0e6d3", fontSize: 15, margin: 0 }}>You nominated <strong style={{ color: "#c45c3c" }}>{name}</strong></p>
      </Card>
    );
  }

  const submit = async () => {
    if (!choice) return;
    await storageUpdate(gameId, KEY_FATES, (fresh) => {
      if (!fresh) return null;
      fresh.nominations = { ...(fresh.nominations || {}), [player.id]: choice };
      return fresh;
    });
  };

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 12, letterSpacing: 6, textTransform: "uppercase", color: "#c9a84c", marginBottom: 8 }}>⚖️</div>
        <h2 style={{ color: "#f0e6d3", fontFamily: "'Palatino Linotype', Palatino, Georgia, serif", marginBottom: 4 }}>Make Your Nomination</h2>
        <p style={{ color: "#a09080", fontSize: 13 }}>You finished #{myEntry.place} — nominate someone for exile.</p>
      </div>
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "grid", gap: 8 }}>
          {others.map((p) => {
            const check = isValidNomination(player.id, p.id, winnerId);
            if (!check.ok) return null;
            return (
              <button key={p.id} onClick={() => setChoice(p.id)} style={{
                background: choice === p.id ? "linear-gradient(135deg, rgba(196,92,60,0.15), rgba(196,92,60,0.08))" : "#0a1020",
                border: `2px solid ${choice === p.id ? "#c45c3c" : "#253550"}`, borderRadius: 10, padding: "12px 18px",
                cursor: "pointer", color: choice === p.id ? "#c45c3c" : "#f0e6d3", fontSize: 15,
                fontWeight: choice === p.id ? 700 : 500, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif",
                textAlign: "left", width: "100%",
              }}>{choice === p.id ? "🃏  " : ""}{p.display_name}</button>
            );
          })}
        </div>
      </Card>
      <button onClick={submit} disabled={!choice} style={{
        width: "100%", background: choice ? "linear-gradient(135deg, #c9a84c, #a5822f)" : "#253550",
        color: choice ? "#0c1425" : "#706050", border: "none", borderRadius: 10, padding: "14px 24px",
        fontSize: 16, fontWeight: 700, cursor: choice ? "pointer" : "not-allowed",
        fontFamily: "'Palatino Linotype', Palatino, Georgia, serif", letterSpacing: 0.5,
      }}>Submit Nomination</button>
    </div>
  );
}
