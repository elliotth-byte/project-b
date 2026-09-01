import { useState, useEffect } from "react";
import { Card } from "./traitorsUi";
import { storageGet, storageUpdate, subscribeGameState } from "../lib/gameStorage";
import { STORAGE_KEY_ROUND_INFO, VOTES_KEY_PREFIX } from "../lib/roundtableData";

// ─── Roundtable: Player View ───
// See the scope note in RoundtableHost.jsx — this covers casting a vote,
// not the full traitor/murder game state.
export default function RoundtableVoter({ gameId, playerName }) {
  const [roundInfo, setRoundInfo] = useState(null);
  const [vote, setVote] = useState("");
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [existingVote, setExistingVote] = useState(null);

  useEffect(() => {
    const unsubscribe = subscribeGameState(gameId, STORAGE_KEY_ROUND_INFO, setRoundInfo);
    return unsubscribe;
  }, [gameId]);

  // Check whether this player already voted this round
  useEffect(() => {
    if (!roundInfo?.round) return;
    (async () => {
      const votes = await storageGet(gameId, VOTES_KEY_PREFIX + roundInfo.round);
      if (votes && votes[playerName]) {
        setExistingVote(votes[playerName]);
        setSubmitted(true);
      } else {
        setExistingVote(null);
        setSubmitted(false);
      }
    })();
  }, [gameId, playerName, roundInfo?.round]);

  if (!roundInfo) return null;

  const others = (roundInfo.players || []).filter((p) => p.name !== playerName);
  const votingOpen = roundInfo.votingOpen;

  const submitVote = async () => {
    if (!vote) return;
    const key = VOTES_KEY_PREFIX + roundInfo.round;
    const res = await storageUpdate(gameId, key, (fresh) => {
      const existing = fresh || {};
      existing[playerName] = { target: vote, reason, time: new Date().toLocaleTimeString() };
      return existing;
    });
    if (res.ok) {
      setExistingVote(res.value[playerName]);
      setSubmitted(true);
    }
  };

  const changeVote = () => { setSubmitted(false); setExistingVote(null); setVote(""); setReason(""); };

  if (!votingOpen && !submitted) {
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <div style={{ fontSize: 12, letterSpacing: 4, textTransform: "uppercase", color: "#c9a84c", marginBottom: 6 }}>✦</div>
        <p style={{ color: "#706050", fontSize: 13, fontStyle: "italic", margin: 0 }}>
          The roundtable is quiet. Await the host's command.
        </p>
      </Card>
    );
  }

  if (submitted) {
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <div style={{ fontSize: 12, letterSpacing: 4, textTransform: "uppercase", color: "#7a9a5c", marginBottom: 6 }}>Vote Cast</div>
        <p style={{ color: "#f0e6d3", fontSize: 15, margin: "0 0 6px" }}>
          You voted for <strong style={{ color: "#c45c3c" }}>{existingVote?.target}</strong>
        </p>
        {existingVote?.reason && (
          <p style={{ color: "#a09080", fontSize: 13, fontStyle: "italic", margin: "0 0 14px" }}>"{existingVote.reason}"</p>
        )}
        <p style={{ color: "#a09080", fontSize: 13, marginBottom: 16 }}>The host shall reveal all when the time comes.</p>
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
        <div style={{ fontSize: 12, letterSpacing: 6, textTransform: "uppercase", color: "#c9a84c", marginBottom: 8 }}>✦</div>
        <h2 style={{ color: "#f0e6d3", fontFamily: "'Palatino Linotype', Palatino, Georgia, serif", marginBottom: 4 }}>
          Roundtable — Round {roundInfo.round}
        </h2>
        <p style={{ color: "#a09080", fontSize: 14 }}>Voting as <strong style={{ color: "#c9a84c" }}>{playerName}</strong></p>
      </div>

      <Card style={{ marginBottom: 18 }}>
        <h3 style={{ color: "#f0e6d3", margin: "0 0 4px", fontSize: 16, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>
          Who do you believe is a Traitor?
        </h3>
        <p style={{ color: "#706050", fontSize: 12, margin: "0 0 14px", fontStyle: "italic" }}>Select one player to banish.</p>
        <div style={{ display: "grid", gap: 8 }}>
          {others.map((p) => (
            <button key={p.id} onClick={() => setVote(p.name)} style={{
              background: vote === p.name ? "linear-gradient(135deg, rgba(196,92,60,0.15), rgba(196,92,60,0.08))" : "#0a1020",
              border: `2px solid ${vote === p.name ? "#c45c3c" : "#253550"}`, borderRadius: 10, padding: "12px 18px",
              cursor: "pointer", color: vote === p.name ? "#c45c3c" : "#f0e6d3", fontSize: 15,
              fontWeight: vote === p.name ? 700 : 500, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif",
              textAlign: "left", width: "100%",
            }}>{vote === p.name ? "⚔️  " : ""}{p.name}</button>
          ))}
          {others.length === 0 && <p style={{ color: "#706050", fontSize: 12, fontStyle: "italic" }}>No other players yet.</p>}
        </div>
      </Card>

      {vote && (
        <Card style={{ marginBottom: 18 }}>
          <h3 style={{ color: "#f0e6d3", margin: "0 0 4px", fontSize: 16, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>
            State your case against {vote}
          </h3>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why should they be banished?" rows={3}
            style={{
              width: "100%", background: "#0a1020", border: "1px solid #253550", borderRadius: 10, padding: "12px 16px",
              color: "#f0e6d3", fontSize: 15, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif",
              resize: "vertical", outline: "none", boxSizing: "border-box", lineHeight: 1.6,
            }} />
        </Card>
      )}

      <button onClick={submitVote} disabled={!vote} style={{
        width: "100%", background: vote ? "linear-gradient(135deg, #c9a84c, #b8943e)" : "#253550",
        color: vote ? "#0c1425" : "#706050", border: "none", borderRadius: 10, padding: "14px 24px",
        fontSize: 16, fontWeight: 700, cursor: vote ? "pointer" : "not-allowed",
        fontFamily: "'Palatino Linotype', Palatino, Georgia, serif", letterSpacing: 0.5,
      }}>Cast My Vote</button>
    </div>
  );
}
