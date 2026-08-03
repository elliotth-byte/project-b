import { useState, useEffect } from "react";
import { Card } from "./ui";
import { storageGet, storageUpdate, subscribeGameState } from "../lib/gameStorage";
import { KEY_FINALE } from "../lib/gameState";

const VOTES_KEY = "pb:finale-votes";

export default function FinalePlayer({ gameId, player, round }) {
  const [finale, setFinale] = useState(null);
  const [choice, setChoice] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [existing, setExisting] = useState(null);

  useEffect(() => {
    const unsubscribe = subscribeGameState(gameId, KEY_FINALE, setFinale);
    return unsubscribe;
  }, [gameId]);

  useEffect(() => {
    if (!player?.id) return;
    (async () => {
      const votes = await storageGet(gameId, VOTES_KEY);
      if (votes && votes[player.id]) { setExisting(votes[player.id]); setSubmitted(true); }
    })();
  }, [gameId, player?.id]);

  if (round?.phase !== "finale" || !finale) return null;

  const isFinalist = finale.finalists.some((f) => f.playerId === player?.id);
  if (isFinalist) {
    return (
      <Card style={{ marginBottom: 20, textAlign: "center", borderColor: "rgba(201,168,76,0.5)" }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>🔥</div>
        <p style={{ color: "#f0e6d3", fontSize: 16, fontWeight: 700, margin: "0 0 6px", fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>You made the Finale!</p>
        <p style={{ color: "#a09080", fontSize: 13, margin: 0 }}>Every exiled player is voting right now for who should win. Good luck.</p>
      </Card>
    );
  }

  const votingOpen = finale.votingOpen;

  if (!votingOpen && !submitted) {
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <p style={{ color: "#706050", fontSize: 13, fontStyle: "italic", margin: 0 }}>The finale vote hasn't opened yet.</p>
      </Card>
    );
  }

  if (submitted) {
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <div style={{ fontSize: 12, letterSpacing: 4, textTransform: "uppercase", color: "#7a9a5c", marginBottom: 6 }}>Vote Cast</div>
        <p style={{ color: "#f0e6d3", fontSize: 15, margin: 0 }}>You voted for <strong style={{ color: "#c9a84c" }}>{existing?.targetName}</strong> to win.</p>
      </Card>
    );
  }

  const submit = async () => {
    if (!choice) return;
    const targetName = finale.finalists.find((f) => f.playerId === choice)?.name || "";
    const res = await storageUpdate(gameId, VOTES_KEY, (fresh) => {
      const existingMap = fresh || {};
      existingMap[player.id] = { targetId: choice, targetName, voterName: player.name, time: new Date().toLocaleTimeString() };
      return existingMap;
    });
    if (res.ok) { setExisting(res.value[player.id]); setSubmitted(true); }
  };

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 12, letterSpacing: 6, textTransform: "uppercase", color: "#c9a84c", marginBottom: 8 }}>🔥</div>
        <h2 style={{ color: "#f0e6d3", fontFamily: "'Palatino Linotype', Palatino, Georgia, serif", marginBottom: 4 }}>Vote for the Winner</h2>
      </div>
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "grid", gap: 8 }}>
          {finale.finalists.map((f) => (
            <button key={f.playerId} onClick={() => setChoice(f.playerId)} style={{
              background: choice === f.playerId ? "linear-gradient(135deg, rgba(201,168,76,0.18), rgba(201,168,76,0.08))" : "#0a1020",
              border: `2px solid ${choice === f.playerId ? "#c9a84c" : "#253550"}`, borderRadius: 10, padding: "12px 18px",
              cursor: "pointer", color: choice === f.playerId ? "#c9a84c" : "#f0e6d3", fontSize: 15,
              fontWeight: choice === f.playerId ? 700 : 500, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif",
              textAlign: "left", width: "100%",
            }}>{choice === f.playerId ? "🏆  " : ""}{f.name}</button>
          ))}
        </div>
      </Card>
      <button onClick={submit} disabled={!choice} style={{
        width: "100%", background: choice ? "linear-gradient(135deg, #c9a84c, #a5822f)" : "#253550",
        color: choice ? "#0c1425" : "#706050", border: "none", borderRadius: 10, padding: "14px 24px",
        fontSize: 16, fontWeight: 700, cursor: choice ? "pointer" : "not-allowed",
        fontFamily: "'Palatino Linotype', Palatino, Georgia, serif", letterSpacing: 0.5,
      }}>Cast My Vote</button>
    </div>
  );
}
