import { useState, useEffect } from "react";
import { Card } from "./ui";
import { storageGet, storageUpdate, subscribeGameState } from "../lib/gameStorage";
import { KEY_EXILE } from "../lib/gameState";
import MemoryWall from "./MemoryWall";

export default function ExileVotePlayer({ gameId, player, round, players }) {
  const [exile, setExile] = useState(null);
  const [choice, setChoice] = useState("");
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [existing, setExisting] = useState(null);

  const votesKey = `pb:exile-votes:${round?.round}`;

  useEffect(() => {
    const unsubscribe = subscribeGameState(gameId, KEY_EXILE, setExile);
    return unsubscribe;
  }, [gameId, round?.round]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!round?.round || !player?.id) return;
    (async () => {
      const votes = await storageGet(gameId, votesKey);
      if (votes && votes[player.id]) {
        setExisting(votes[player.id]);
        setSubmitted(true);
      } else {
        setExisting(null);
        setSubmitted(false);
      }
    })();
  }, [gameId, player?.id, round?.round]); // eslint-disable-line react-hooks/exhaustive-deps

  if (round?.phase !== "exile" || !exile) return null;

  const votingOpen = exile.votingOpen;
  const verb = exile.mode === "save" ? "SAVE" : "eliminate";

  const submitVote = async () => {
    if (!choice) return;
    const targetName = exile.nominees.find((n) => n.playerId === choice)?.name || "";
    const res = await storageUpdate(gameId, votesKey, (fresh) => {
      const existingMap = fresh || {};
      existingMap[player.id] = { targetId: choice, targetName, voterName: player.name, reason: reason.trim() || null, time: new Date().toLocaleTimeString() };
      return existingMap;
    });
    if (res.ok) {
      setExisting(res.value[player.id]);
      setSubmitted(true);
    }
  };

  const changeVote = () => { setSubmitted(false); setExisting(null); setChoice(existing?.targetId || ""); setReason(existing?.reason || ""); };

  if (!votingOpen && !submitted) {
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <div style={{ fontSize: 12, letterSpacing: 4, textTransform: "uppercase", color: "#ff2d95", marginBottom: 6 }}>🃏</div>
        <p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic", margin: 0 }}>The vote is quiet. Await the host's command.</p>
      </Card>
    );
  }

  if (submitted) {
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <div style={{ fontSize: 12, letterSpacing: 4, textTransform: "uppercase", color: "#00ff9d", marginBottom: 6 }}>Vote Cast</div>
        <p style={{ color: "#f5f0ff", fontSize: 15, margin: "0 0 10px" }}>
          You voted to {verb} <strong style={{ color: "#ff3860" }}>{existing?.targetName}</strong>
        </p>
        {existing?.reason && (
          <p style={{ color: "#a68fd6", fontSize: 12, fontStyle: "italic", margin: "0 0 14px", padding: "8px 12px", background: "#0d0618", borderRadius: 8 }}>
            "{existing.reason}"
          </p>
        )}
        {votingOpen && (
          <button onClick={changeVote} style={{
            background: "transparent", border: "1px solid #3d1f5c", borderRadius: 10, padding: "10px 24px",
            color: "#a68fd6", fontSize: 14, cursor: "pointer", fontFamily: "'Orbitron', 'Segoe UI', sans-serif",
          }}>Change My Vote</button>
        )}
      </Card>
    );
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <div style={{ fontSize: 12, letterSpacing: 6, textTransform: "uppercase", color: "#ff2d95", marginBottom: 8 }}>🃏</div>
        <h2 style={{ color: "#f5f0ff", fontFamily: "'Orbitron', 'Segoe UI', sans-serif", marginBottom: 4 }}>Exile Vote — Round {round.round}</h2>
        <p style={{ color: "#a68fd6", fontSize: 14 }}>Vote to {verb}:</p>
      </div>
      <Card style={{ marginBottom: 14 }}>
        <MemoryWall candidates={exile.nominees} players={players} selectedId={choice} onSelect={setChoice} />
      </Card>
      <Card style={{ marginBottom: 18 }}>
        <label style={{ display: "block", fontSize: 11, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
          Why? (optional — shown when votes are revealed)
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={280}
          rows={3}
          placeholder="Say your piece..."
          style={{ width: "100%", background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 8, padding: "10px 12px", color: "#f5f0ff", fontSize: 13, fontFamily: "'Orbitron', 'Segoe UI', sans-serif", resize: "vertical" }}
        />
      </Card>
      <button onClick={submitVote} disabled={!choice} style={{
        width: "100%", background: choice ? "linear-gradient(135deg, #ff2d95, #b829ff)" : "#3d1f5c",
        color: choice ? "#05010f" : "#6b4f99", border: "none", borderRadius: 10, padding: "14px 24px",
        fontSize: 16, fontWeight: 700, cursor: choice ? "pointer" : "not-allowed",
        fontFamily: "'Orbitron', 'Segoe UI', sans-serif", letterSpacing: 0.5,
      }}>Cast My Vote</button>
    </div>
  );
}
