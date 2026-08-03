import { useState, useEffect } from "react";
import { Card } from "./ui";
import { storageUpdate, subscribeGameState } from "../lib/gameStorage";
import { KEY_FATES, KEY_CHALLENGE } from "../lib/gameState";
import { isValidNomination } from "../lib/fatesLogic";
import MemoryWall from "./MemoryWall";

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
        <div style={{ fontSize: 12, letterSpacing: 4, textTransform: "uppercase", color: "#ff2d95", marginBottom: 6 }}>⚖️ Fates Ceremony</div>
        <p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic", margin: 0 }}>
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
        <div style={{ fontSize: 12, letterSpacing: 4, textTransform: "uppercase", color: "#00ff9d", marginBottom: 6 }}>Nomination Submitted</div>
        <p style={{ color: "#f5f0ff", fontSize: 15, margin: 0 }}>You nominated <strong style={{ color: "#ff3860" }}>{name}</strong></p>
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
        <div style={{ fontSize: 12, letterSpacing: 6, textTransform: "uppercase", color: "#ff2d95", marginBottom: 8 }}>⚖️</div>
        <h2 style={{ color: "#f5f0ff", fontFamily: "'Orbitron', 'Segoe UI', sans-serif", marginBottom: 4 }}>Make Your Nomination</h2>
        <p style={{ color: "#a68fd6", fontSize: 13 }}>You finished #{myEntry.place} — nominate someone for exile.</p>
      </div>
      <Card style={{ marginBottom: 16 }}>
        <MemoryWall
          candidates={others.map((p) => ({ playerId: p.id, name: p.display_name }))}
          players={players}
          selectedId={choice}
          onSelect={setChoice}
          disabledIds={others.filter((p) => !isValidNomination(player.id, p.id, winnerId).ok).map((p) => p.id)}
        />
      </Card>
      <button onClick={submit} disabled={!choice} style={{
        width: "100%", background: choice ? "linear-gradient(135deg, #ff2d95, #b829ff)" : "#3d1f5c",
        color: choice ? "#05010f" : "#6b4f99", border: "none", borderRadius: 10, padding: "14px 24px",
        fontSize: 16, fontWeight: 700, cursor: choice ? "pointer" : "not-allowed",
        fontFamily: "'Orbitron', 'Segoe UI', sans-serif", letterSpacing: 0.5,
      }}>Submit Nomination</button>
    </div>
  );
}
