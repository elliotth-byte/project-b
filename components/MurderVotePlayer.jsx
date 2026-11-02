import { useState, useEffect } from "react";
import { notifyHostEvent } from "../lib/hostPushNotifications";
import { Btn, Card } from "./traitorsUi";
import { traitorStorageUpdate, subscribeTraitorState } from "../lib/traitorStorage";
import { murderVoteKey } from "../lib/murderVoteData";

const SCARLET = "#d6334a";

// ─── Traitors' Murder Vote: Player View ───
// `myRole` (e.g. "traitor-red") determines which faction's vote this
// reads — a Black Traitor's client never even queries the Red key, so
// there's nothing for it to accidentally reveal. Combined with the RLS in
// sql/add-faction-murder-vote.sql (which would refuse the query anyway),
// this means a Traitor genuinely cannot see the other faction's vote by
// any means short of directly tampering with Supabase itself.
//
// Scarlet Dagger: when the host offers it (mv.scarletDaggerAvailable), each
// Traitor can also vote to draw it — a single-use double murder — and name
// the second victim. Leaving it off counts as a "no".
export default function MurderVotePlayer({ gameId, playerName, myRole }) {
  const storageKey = murderVoteKey(myRole);
  const [mv, setMv] = useState(null);
  const [selected, setSelected] = useState("");
  const [useDagger, setUseDagger] = useState(false);
  const [second, setSecond] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!myRole) return;
    const unsubscribe = subscribeTraitorState(gameId, storageKey, setMv);
    return unsubscribe;
  }, [gameId, storageKey, myRole]);

  const myVote = mv?.votes?.[playerName];

  // Seed the dagger controls from a vote already on file, so changing only
  // the main target doesn't silently drop an earlier dagger vote. Keyed on
  // updatedAt, which only changes when THIS player submits.
  useEffect(() => {
    if (!myVote) return;
    setUseDagger(!!myVote.useDagger);
    setSecond(myVote.secondTargetName || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myVote?.updatedAt]);

  if (!myRole || !mv || mv.status !== "open") return null;
  if (!mv.eligibleVoters?.includes(playerName)) return null;

  const locked = myVote && !mv.allowVoteChanges;
  const daggerOffered = !!mv.scarletDaggerAvailable;
  const wantsDagger = daggerOffered && useDagger;

  const pickTarget = (name) => {
    setSelected(name);
    if (second === name) setSecond("");
  };

  const submit = async () => {
    if (!selected || locked) return;
    if (wantsDagger && (!second || second === selected)) return;
    setSubmitting(true);
    const res = await traitorStorageUpdate(gameId, storageKey, (fresh) => {
      if (!fresh || fresh.status !== "open") return null;
      if (!fresh.eligibleVoters.includes(playerName)) return null;
      if (!fresh.eligibleTargets.includes(selected)) return null;
      if (!fresh.allowVoteChanges && fresh.votes[playerName]) return null;
      // The dagger may have been withdrawn since this screen rendered
      // (spent on the other faction's vote); if so this is a plain vote.
      const withDagger = wantsDagger && !!fresh.scarletDaggerAvailable;
      if (withDagger && (!fresh.eligibleTargets.includes(second) || second === selected)) return null;
      const now = Date.now();
      fresh.votes[playerName] = {
        targetName: selected,
        ...(withDagger ? { useDagger: true, secondTargetName: second } : {}),
        submittedAt: fresh.votes[playerName]?.submittedAt || now,
        updatedAt: now,
      };
      return fresh;
    });
    setSubmitting(false);
    if (res.ok) {
      setMv(res.value);
      notifyHostEvent(gameId, "murder_vote", {
        playerName, targetName: selected, factionLabel: myRole === "traitor-black" ? "Black" : "Red",
        count: Object.keys(res.value.votes || {}).length, total: (res.value.eligibleVoters || []).length,
      });
    }
  };

  const submitDisabled = !selected || submitting || (wantsDagger && !second);

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
          {myVote.useDagger ? (
            <p style={{ color: SCARLET, fontSize: 13, margin: "0 0 6px" }}>
              🩸 You voted to draw the Scarlet Dagger — second victim: <strong>{myVote.secondTargetName}</strong>
            </p>
          ) : daggerOffered ? (
            <p style={{ color: "#706050", fontSize: 12, margin: "0 0 6px" }}>You did not vote to draw the Scarlet Dagger.</p>
          ) : null}
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
              <button key={name} onClick={() => pickTarget(name)} style={{
                padding: "10px 14px", borderRadius: 8, textAlign: "left",
                background: selected === name ? "rgba(196,92,60,0.15)" : "#0a1020",
                border: `2px solid ${selected === name ? "#c45c3c" : "#253550"}`,
                color: selected === name ? "#c45c3c" : "#f0e6d3", cursor: "pointer", fontSize: 14, fontWeight: selected === name ? 700 : 500,
              }}>
                {selected === name ? "🗡️  " : ""}{name}
              </button>
            ))}
          </div>

          {daggerOffered && (
            <div style={{
              margin: "0 0 14px", padding: 12, borderRadius: 10, textAlign: "left",
              border: `2px solid ${useDagger ? SCARLET : "#253550"}`,
              background: useDagger ? "rgba(214,51,74,0.10)" : "#0a1020",
              boxShadow: useDagger ? "0 0 16px rgba(214,51,74,0.25)" : "none",
            }}>
              <button onClick={() => { setUseDagger((v) => !v); if (useDagger) setSecond(""); }} style={{
                width: "100%", padding: "10px 14px", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 700, textAlign: "center",
                background: useDagger ? SCARLET : "transparent",
                border: `1px solid ${SCARLET}`, color: useDagger ? "#fff" : SCARLET,
              }}>
                🩸 {useDagger ? "Scarlet Dagger: DRAWN — tap to put it away" : "Draw the Scarlet Dagger"}
              </button>
              <p style={{ color: "#a09080", fontSize: 12, margin: "8px 0 0", fontStyle: "italic" }}>
                A double murder. It can only be used once — and it is gone for good the moment it is drawn. It only happens if enough Traitors vote to draw it.
              </p>
              {useDagger && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 11, color: SCARLET, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
                    Second victim{selected ? ` (besides ${selected})` : ""}
                  </div>
                  <div style={{ display: "grid", gap: 6 }}>
                    {mv.eligibleTargets.filter((name) => name !== selected).map((name) => (
                      <button key={name} onClick={() => setSecond(name)} style={{
                        padding: "10px 14px", borderRadius: 8, textAlign: "left",
                        background: second === name ? "rgba(214,51,74,0.15)" : "#0a1020",
                        border: `2px solid ${second === name ? SCARLET : "#253550"}`,
                        color: second === name ? SCARLET : "#f0e6d3", cursor: "pointer", fontSize: 14, fontWeight: second === name ? 700 : 500,
                      }}>
                        {second === name ? "🩸  " : ""}{name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <Btn variant="danger" onClick={submit} disabled={submitDisabled} style={{ width: "100%" }}>
            {submitting ? "Submitting..." : wantsDagger ? (myVote ? "Change Vote + Scarlet Dagger" : "Submit Vote + Scarlet Dagger") : myVote ? "Change Vote" : "Submit Murder Vote"}
          </Btn>
          {wantsDagger && !second && (
            <p style={{ color: "#706050", fontSize: 11, margin: "6px 0 0" }}>Pick a second victim to submit with the dagger.</p>
          )}
        </>
      )}
    </Card>
  );
}
