import { useState, useEffect } from "react";
import { Card } from "./traitorsUi";
import { subscribeGameState } from "../lib/gameStorage";
import { STORAGE_KEY_ROUND_INFO } from "../lib/roundtableData";
import {
  subscribeEndGameState, subscribeMyEndGameVote, fetchMyEndGameVote, castEndGameVote,
} from "../lib/endGameVote";

const GOLD = "#e0b84c";
const RED = "#c45c3c";
const SERIF = "'Palatino Linotype', Palatino, Georgia, serif";

// ─── End Game vs Banish Again: Player View ───
// Appears under the Roundtable tab once the host opens an End Game vote
// after a banish. Everyone still standing picks "End Game" or "Banish
// Again" — like the show, the game only ends if EVERY living player picks
// End Game. Individual choices stay private (the endgame_votes table is
// only readable by the host and the voter's own account — see
// sql/add-endgame-vote.sql); once the host closes the vote, everyone just
// sees the result and the counts.
//
// Casting goes through cast_endgame_vote, which re-checks on the server
// that the caller is a living, approved player and that a vote for this
// exact round is open — so a banished player who still has this tab open
// simply gets "couldn't be recorded".
export default function EndGameVoteVoter({ gameId, playerName }) {
  const [roundInfo, setRoundInfo] = useState(null);
  const [egState, setEgState] = useState(null);
  const [myVote, setMyVote] = useState(null);
  const [choice, setChoice] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const unsubscribe = subscribeGameState(gameId, STORAGE_KEY_ROUND_INFO, setRoundInfo);
    return unsubscribe;
  }, [gameId]);

  useEffect(() => {
    const unsubscribe = subscribeEndGameState(gameId, setEgState);
    return unsubscribe;
  }, [gameId]);

  // Same trick GoldenDaggerVoter uses: roundInfo.players is the roster
  // snapshot taken when voting opened, which is where an id for this
  // player name comes from.
  const me = (roundInfo?.players || []).find((p) => p.name === playerName);

  useEffect(() => {
    if (!me?.id) return;
    const unsubscribe = subscribeMyEndGameVote(gameId, me.id, setMyVote);
    return unsubscribe;
  }, [gameId, me?.id]);

  // State from an earlier round (or a previous season) has a different
  // roundKey than the round that's currently live — ignore it.
  const valid = !!(me && roundInfo?.startedAt && egState && egState.roundKey === roundInfo.startedAt);
  if (!valid) return null;

  const voted = !!(myVote && myVote.round_key === egState.roundKey);

  const cardStyle = {
    marginBottom: 20, border: `2px solid ${GOLD}`,
    background: "linear-gradient(160deg, #1d1808 0%, #0e1830 100%)",
    boxShadow: "0 0 22px rgba(224,184,76,0.22)",
  };
  const heading = (
    <>
      <div style={{ fontSize: 28, textAlign: "center", marginBottom: 4 }}>🏁</div>
      <h3 style={{ color: GOLD, textAlign: "center", margin: "0 0 4px", fontSize: 17, fontFamily: SERIF }}>
        End Game, or Banish Again?
      </h3>
    </>
  );

  // ── Closed: show the published result ──
  if (!egState.open) {
    if (!egState.result) return null;
    const c = egState.counts || {};
    return (
      <Card style={cardStyle}>
        {heading}
        {egState.result === "end" ? (
          <p style={{ color: GOLD, fontSize: 15, fontWeight: 700, textAlign: "center", margin: "0 0 6px" }}>
            Unanimous — the game ends.
          </p>
        ) : (
          <p style={{ color: RED, fontSize: 15, fontWeight: 700, textAlign: "center", margin: "0 0 6px" }}>
            Not unanimous — someone must be banished again.
          </p>
        )}
        <p style={{ color: "#a09080", fontSize: 13, textAlign: "center", margin: 0 }}>
          End Game: {c.end ?? 0} · Banish Again: {c.banish ?? 0}
          {c.missing > 0 ? ` · No vote: ${c.missing}` : ""}
        </p>
      </Card>
    );
  }

  // ── Open ──
  const submit = async () => {
    if (!choice || busy) return;
    setBusy(true);
    setError(null);
    const res = await castEndGameVote(gameId, egState.roundKey, choice);
    if (res.ok) {
      setMyVote(await fetchMyEndGameVote(gameId, me.id));
      setEditing(false);
    } else {
      setError("That vote couldn't be recorded — voting may have just closed. Try again if it's still open.");
    }
    setBusy(false);
  };

  const startEdit = () => {
    setChoice(myVote?.choice || "");
    setError(null);
    setEditing(true);
  };

  if (voted && !editing) {
    return (
      <Card style={cardStyle}>
        {heading}
        <p style={{ color: "#f0e6d3", fontSize: 15, textAlign: "center", margin: "0 0 6px" }}>
          You voted:{" "}
          <strong style={{ color: myVote.choice === "end" ? GOLD : RED }}>
            {myVote.choice === "end" ? "End the Game" : "Banish Again"}
          </strong>
        </p>
        <p style={{ color: "#706050", fontSize: 12, textAlign: "center", margin: "0 0 12px" }}>
          Your vote is secret. The host will reveal the result when everyone's in.
        </p>
        <div style={{ textAlign: "center" }}>
          <button onClick={startEdit} style={{
            background: "transparent", border: "1px solid #253550", borderRadius: 10, padding: "10px 24px",
            color: "#a09080", fontSize: 14, cursor: "pointer", fontFamily: SERIF,
          }}>Change My Vote</button>
        </div>
      </Card>
    );
  }

  const options = [
    { value: "end", label: "🏁  End the Game", blurb: "Only ends if every player still standing votes this.", color: GOLD, bg: "rgba(224,184,76,0.14)" },
    { value: "banish", label: "⚔️  Banish Again", blurb: "One vote here is enough to force another banishment.", color: RED, bg: "rgba(196,92,60,0.14)" },
  ];

  return (
    <Card style={cardStyle}>
      {heading}
      <p style={{ color: "#a09080", fontSize: 13, textAlign: "center", margin: "0 0 14px", fontStyle: "italic" }}>
        Voting as <strong style={{ color: "#c9a84c" }}>{playerName}</strong> — in secret.
      </p>
      <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
        {options.map((o) => (
          <button key={o.value} onClick={() => setChoice(o.value)} style={{
            background: choice === o.value ? o.bg : "#0a1020",
            border: `2px solid ${choice === o.value ? o.color : "#253550"}`, borderRadius: 10, padding: "12px 18px",
            cursor: "pointer", color: choice === o.value ? o.color : "#f0e6d3", fontSize: 15,
            fontWeight: choice === o.value ? 700 : 500, fontFamily: SERIF, textAlign: "left", width: "100%",
          }}>
            <div>{o.label}</div>
            <div style={{ fontSize: 11.5, fontWeight: 400, color: "#a09080", marginTop: 2 }}>{o.blurb}</div>
          </button>
        ))}
      </div>
      {error && <p style={{ color: RED, fontSize: 12, margin: "0 0 10px" }}>{error}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={submit} disabled={!choice || busy} style={{
          flex: 1, background: choice && !busy ? `linear-gradient(135deg, ${GOLD}, #b8943e)` : "#253550",
          color: choice && !busy ? "#0c1425" : "#706050", border: "none", borderRadius: 10, padding: "14px 24px",
          fontSize: 16, fontWeight: 700, cursor: choice && !busy ? "pointer" : "not-allowed",
          fontFamily: SERIF, letterSpacing: 0.5,
        }}>{busy ? "Casting..." : voted ? "Update My Vote" : "Lock In My Vote"}</button>
        {editing && (
          <button onClick={() => setEditing(false)} style={{
            background: "transparent", border: "1px solid #253550", borderRadius: 10, padding: "14px 18px",
            color: "#a09080", fontSize: 14, cursor: "pointer",
          }}>Cancel</button>
        )}
      </div>
    </Card>
  );
}
