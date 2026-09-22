import { useState, useEffect } from "react";
import { Btn, Card } from "./traitorsUi";
import { traitorStorageUpdate, subscribeTraitorState } from "../lib/traitorStorage";
import { murderVoteKey } from "../lib/murderVoteData";

// ─── Traitors' Murder Vote: Player View ───
// `myRole` (e.g. "traitor-red") determines which faction's vote this
// reads — a Black Traitor's client never even queries the Red key, so
// there's nothing for it to accidentally reveal. Combined with the RLS in
// sql/add-faction-murder-vote.sql (which would refuse the query anyway),
// this means a Traitor genuinely cannot see the other faction's vote by
// any means short of directly tampering with Supabase itself.
export default function MurderVotePlayer({ gameId, playerName, myRole }) {
  const storageKey = murderVoteKey(myRole);
  const [mv, setMv] = useState(null);
  const [selected, setSelected] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!myRole) return;
    const unsubscribe = subscribeTraitorState(gameId, storageKey, setMv);
    return unsubscribe;
  }, [gameId, storageKey, myRole]);

  if (!myRole || !mv || mv.status !== "open") return null;
  if (!mv.eligibleVoters?.includes(playerName)) return null;

  const myVote = mv.votes?.[playerName];
  const locked = myVote && !mv.allowVoteChanges;

  const submit = async () => {
    if (!selected || locked) return;
    setSubmitting(true);
    const res = await traitorStorageUpdate(gameId, storageKey, (fresh) => {
      if (!fresh || fresh.status !== "open") return null;
      if (!fresh.eligibleVoters.includes(playerName)) return null;
      if (!fresh.eligibleTargets.includes(selected)) return null;
      if (!fresh.allowVoteChanges && fresh.votes[playerName]) return null;
      const now = Date.now();
      fresh.votes[playerName] = { targetName: selected, submittedAt: fresh.votes[playerName]?.submittedAt || now, updatedAt: now };
      return fresh;
    });
    setSubmitting(false);
    if (res.ok) setMv(res.value);
  };

  return (
    <Card style={{
      marginBottom: 20, textAlign: "center", padding: "24px 20px",
      background: "linear-gradient(160deg, #1a0e0e 0%, #0e1830 100%)",
      border: "2px solid #c45c3c", boxShadow: "0 0 24px rgba(196,92,60,0.25)",
    }}>
      <div style={{ fontSize: 32, marginBottom: 6 }}>🗡️</div>
      <h2 style={{ color: "#c45c3c", margin: "0 0 6px", fontFamily: "'Palatino Linotype', Palatino, Georgia, serif", fontSize: 20 }}>The Turret Awaits</h2>
      <p style={{ color: "#a09080", fontSize: 13, margin: "0 0 16px", fontStyle: "italic" }}>
        The Traitors have gathered. Choose who should not survive the night.
      </p>

      {myVote ? (
        <>
          <p style={{ color: "#f0e6d3", fontSize: 15, margin: "0 0 6px" }}>
            Your vote: <strong style={{ color: "#c45c3c" }}>{myVote.targetName}</strong>
          </p>
          <p style={{ color: "#7a9a5c", fontSize: 12, margin: "0 0 12px" }}>Your murder vote has been submitted.</p>
          {mv.allowVoteChanges ? (
            <p style={{ color: "#706050", fontSize: 11, marginBottom: 12 }}>You may change your vote until the host closes the murder vote.</p>
          ) : (
            <p style={{ color: "#706050", fontSize: 11, marginBottom: 12 }}>Your vote is locked.</p>
          )}
        </>
      ) : null}

      {!locked && (
        <>
          <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
            {mv.eligibleTargets.map((name) => (
              <button key={name} onClick={() => setSelected(name)} style={{
                padding: "10px 14px", borderRadius: 8, textAlign: "left",
                background: selected === name ? "rgba(196,92,60,0.15)" : "#0a1020",
                border: `2px solid ${selected === name ? "#c45c3c" : "#253550"}`,
                color: selected === name ? "#c45c3c" : "#f0e6d3", cursor: "pointer", fontSize: 14, fontWeight: selected === name ? 700 : 500,
              }}>
                {selected === name ? "🗡️  " : ""}{name}
              </button>
            ))}
          </div>
          <Btn variant="danger" onClick={submit} disabled={!selected || submitting} style={{ width: "100%" }}>
            {submitting ? "Submitting..." : myVote ? "Change Vote" : "Submit Murder Vote"}
          </Btn>
        </>
      )}
    </Card>
  );
}
