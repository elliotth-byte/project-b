import { useState, useEffect, useRef } from "react";
import { Card, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { reportScore } from "../../lib/challengeScores";
import {
  subscribeAcrophobia, submitPhrase, submitVote, tickAcrophobia, isValidPhrase, placementValue,
} from "../../lib/games/acrophobiaData";

// ─── Acrophobia — Big Screen (phone side) ───
// The acronym, the anonymized submissions during voting, and the
// reveal all live on the TV (see components/bigscreen/
// AcrophobiaTvDisplay.jsx) — this screen is purely an input device:
// a text box to write a phrase during "submitting", anonymous vote
// buttons (by the same A/B/C labels the TV shows, from the shared
// votingOrder) during "voting", and a small personal outcome note
// during "resolved". See lib/games/acrophobiaData.js's own header
// comment for the full mechanic.
export default function AcrophobiaTvPlayer({ gameId, round, challenge, player }) {
  const [state, setState] = useState(null);
  const [draft, setDraft] = useState("");
  const reportedRef = useRef(false);

  useEffect(() => subscribeAcrophobia(gameId, round.round, setState), [gameId, round.round]);

  useEffect(() => {
    const id = setInterval(() => tickAcrophobia(gameId, round.round), 500);
    return () => clearInterval(id);
  }, [gameId, round.round]);

  useEffect(() => {
    setDraft("");
  }, [state?.subRound]);

  useEffect(() => {
    if (!state) return;
    reportScore(gameId, round.round, player.id, player.name, placementValue(state, player.id), { final: false });
  }, [state?.scores]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!challenge?.active && state && !reportedRef.current) {
      reportedRef.current = true;
      reportScore(gameId, round.round, player.id, player.name, placementValue(state, player.id), { final: true });
    }
  }, [challenge?.active, state]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!challenge?.active) {
    const myScore = state ? placementValue(state, player.id) : 0;
    return <GameResultCard icon="🔤" title="Acrophobia" valueLabel={`${myScore} pt${myScore === 1 ? "" : "s"}`} />;
  }
  if (!state) return <Card style={{ marginBottom: 20, textAlign: "center" }}><p style={{ color: "#6b4f99", fontStyle: "italic" }}>Loading...</p></Card>;

  const myScore = placementValue(state, player.id);
  const myPhrase = state.submissions?.[player.id];
  const myVote = state.votes?.[player.id];
  const draftValid = isValidPhrase(draft, state.letters);

  const doSubmit = () => {
    if (!draftValid) return;
    submitPhrase(gameId, round.round, player.id, draft);
  };
  const doVote = (authorId) => submitVote(gameId, round.round, player.id, authorId);

  const votableAuthors = (state.votingOrder || []).filter((id) => id !== player.id);
  const nothingToVoteOn = votableAuthors.length === 0;

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🔤 Acrophobia</h3>
        <Badge color="#00ff9d">{myScore} pt{myScore === 1 ? "" : "s"}</Badge>
      </div>

      {state.phase === "submitting" && !myPhrase && (
        <>
          <p style={{ color: "#a68fd6", fontSize: 13, margin: "0 0 4px" }}>Look at the big screen for your letters.</p>
          <p style={{ color: "#f5f0ff", fontSize: 13, margin: "0 0 12px" }}>
            One word per letter, in order: {state.letters.join(" - ")}
          </p>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`e.g. ${state.letters.map((l) => l + "...").join(" ")}`}
            style={{
              width: "100%", padding: "12px 14px", borderRadius: 10, marginBottom: 10, boxSizing: "border-box",
              background: "#0d0618", border: `2px solid ${draft.length === 0 ? "#3d1f5c" : draftValid ? "#00ff9d" : "#ff3860"}`,
              color: "#f5f0ff", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif",
            }}
          />
          <button onClick={doSubmit} disabled={!draftValid} style={{
            width: "100%", padding: "14px 16px", borderRadius: 10, cursor: draftValid ? "pointer" : "not-allowed",
            background: draftValid ? "rgba(0,255,157,0.15)" : "#0d0618", border: `2px solid ${draftValid ? "#00ff9d" : "#3d1f5c"}`,
            color: draftValid ? "#00ff9d" : "#6b4f99", fontSize: 15, fontWeight: 700, fontFamily: "'Orbitron', 'Segoe UI', sans-serif",
          }}>
            Submit
          </button>
        </>
      )}

      {state.phase === "submitting" && myPhrase && (
        <p style={{ color: "#6b4f99", fontSize: 14, fontStyle: "italic" }}>Submitted — waiting on everyone else...</p>
      )}

      {state.phase === "voting" && nothingToVoteOn && (
        <p style={{ color: "#6b4f99", fontSize: 14, fontStyle: "italic" }}>
          {myPhrase ? "You're the only one who submitted this round — check the big screen." : "Nothing to vote on this round — check the big screen."}
        </p>
      )}

      {state.phase === "voting" && !nothingToVoteOn && !myVote && (
        <>
          <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 10px" }}>Read the phrases on the big screen and vote for your favorite:</p>
          <div style={{ display: "grid", gap: 8 }}>
            {votableAuthors.map((authorId) => {
              const label = String.fromCharCode(65 + state.votingOrder.indexOf(authorId));
              return (
                <button key={authorId} onClick={() => doVote(authorId)} style={{
                  textAlign: "left", padding: "12px 14px", borderRadius: 8, cursor: "pointer",
                  background: "#0d0618", border: "2px solid #3d1f5c", color: "#f5f0ff", fontSize: 15,
                  fontFamily: "'Orbitron', 'Segoe UI', sans-serif",
                }}>
                  {label}. {state.submissions[authorId]}
                </button>
              );
            })}
          </div>
        </>
      )}

      {state.phase === "voting" && !nothingToVoteOn && myVote && (
        <p style={{ color: "#6b4f99", fontSize: 14, fontStyle: "italic" }}>Vote submitted — waiting on everyone else...</p>
      )}

      {state.phase === "resolved" && state.lastOutcome && (
        <>
          {myPhrase ? (
            state.lastOutcome.topAuthorIds.includes(player.id) ? (
              <p style={{ color: "#c9a84c", fontSize: 16, fontWeight: 700 }}>👑 Crowd favorite! +{state.lastOutcome.pointsAwarded[player.id]}</p>
            ) : (
              <p style={{ color: "#00ff9d", fontSize: 15, fontWeight: 700 }}>+{state.lastOutcome.pointsAwarded[player.id] ?? 0} vote{state.lastOutcome.pointsAwarded[player.id] === 1 ? "" : "s"}</p>
            )
          ) : (
            <p style={{ color: "#a68fd6", fontSize: 14 }}>Didn't submit this round.</p>
          )}
          <p style={{ color: "#6b4f99", fontSize: 12, marginTop: 8 }}>Next round starting soon...</p>
        </>
      )}
    </Card>
  );
}
