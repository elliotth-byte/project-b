import { useState, useEffect } from "react";
import { Card } from "./ui";
import { storageGet, storageUpdate, subscribeGameState } from "../lib/gameStorage";
import { KEY_EXILE } from "../lib/gameState";

export default function ExileVotePlayer({ gameId, player, round }) {
  const [exile, setExile] = useState(null);
  const [choice, setChoice] = useState("");
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
      existingMap[player.id] = { targetId: choice, targetName, voterName: player.name, time: new Date().toLocaleTimeString() };
      return existingMap;
    });
    if (res.ok) {
      setExisting(res.value[player.id]);
      setSubmitted(true);
    }
  };

  const changeVote = () => { setSubmitted(false); setExisting(null); setChoice(""); };

  if (!votingOpen && !submitted) {
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <div style={{ fontSize: 12, letterSpacing: 4, textTransform: "uppercase", color: "#c9a84c", marginBottom: 6 }}>🃏</div>
        <p style={{ color: "#706050", fontSize: 13, fontStyle: "italic", margin: 0 }}>The vote is quiet. Await the host's command.</p>
      </Card>
    );
  }

  if (submitted) {
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <div style={{ fontSize: 12, letterSpacing: 4, textTransform: "uppercase", color: "#7a9a5c", marginBottom: 6 }}>Vote Cast</div>
        <p style={{ color: "#f0e6d3", fontSize: 15, margin: "0 0 14px" }}>
          You voted to {verb} <strong style={{ color: "#c45c3c" }}>{existing?.targetName}</strong>
        </p>
        {votingOpen && (
          <button onClick={changeVote} style={{
            background: "transparent", border: "1px solid #253550", borderRadius: 10, padding: "10px 24px",
            color: "#a09080", fontSize: 14, cursor: "pointer", fontFamily: "'Palatino Linotype', Palatino, Georgia, serif",
          }}>Change My Vote</button>
        )}
      </Card>
    );
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <div style={{ fontSize: 12, letterSpacing: 6, textTransform: "uppercase", color: "#c9a84c", marginBottom: 8 }}>🃏</div>
        <h2 style={{ color: "#f0e6d3", fontFamily: "'Palatino Linotype', Palatino, Georgia, serif", marginBottom: 4 }}>Exile Vote — Round {round.round}</h2>
        <p style={{ color: "#a09080", fontSize: 14 }}>Vote to {verb}:</p>
      </div>
      <Card style={{ marginBottom: 18 }}>
        <div style={{ display: "grid", gap: 8 }}>
          {exile.nominees.map((n) => (
            <button key={n.playerId} onClick={() => setChoice(n.playerId)} style={{
              background: choice === n.playerId ? "linear-gradient(135deg, rgba(196,92,60,0.15), rgba(196,92,60,0.08))" : "#0a1020",
              border: `2px solid ${choice === n.playerId ? "#c45c3c" : "#253550"}`, borderRadius: 10, padding: "12px 18px",
              cursor: "pointer", color: choice === n.playerId ? "#c45c3c" : "#f0e6d3", fontSize: 15,
              fontWeight: choice === n.playerId ? 700 : 500, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif",
              textAlign: "left", width: "100%",
            }}>{choice === n.playerId ? "🃏  " : ""}{n.name}</button>
          ))}
        </div>
      </Card>
      <button onClick={submitVote} disabled={!choice} style={{
        width: "100%", background: choice ? "linear-gradient(135deg, #c9a84c, #a5822f)" : "#253550",
        color: choice ? "#0c1425" : "#706050", border: "none", borderRadius: 10, padding: "14px 24px",
        fontSize: 16, fontWeight: 700, cursor: choice ? "pointer" : "not-allowed",
        fontFamily: "'Palatino Linotype', Palatino, Georgia, serif", letterSpacing: 0.5,
      }}>Cast My Vote</button>
    </div>
  );
}
