import { useState, useEffect, useRef } from "react";
import { Btn, Card, Badge } from "./ui";
import { storageUpdate, subscribeGameState } from "../lib/gameStorage";
import { KEY_FINALE } from "../lib/gameState";
import { computeFinaleOutcome } from "../lib/exileLogic";
import { FINALE_CONTEXT, subscribeChaosSecret } from "../lib/chaosSecrets";
import PostToGroupMe from "./PostToGroupMe";
import { postToGroupMe } from "../lib/groupmeClient";
import { requestAdvance } from "../lib/advanceNow";

const VOTES_KEY = "pb:finale-votes";

export default function FinaleHost({ gameId, players, round }) {
  const [finale, setFinale] = useState(null);
  const [votes, setVotes] = useState({});
  const [nullifiedId, setNullifiedId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [postedToGroupMe, setPostedToGroupMe] = useState(false);
  const dirtyRef = useRef(new Set());

  useEffect(() => {
    const unsubscribe = subscribeGameState(gameId, KEY_FINALE, setFinale);
    return unsubscribe;
  }, [gameId]);

  useEffect(() => {
    const unsubscribe = subscribeGameState(gameId, VOTES_KEY, (v) => setVotes(v || {}));
    return unsubscribe;
  }, [gameId]);

  useEffect(() => {
    const unsubscribe = subscribeChaosSecret(gameId, FINALE_CONTEXT, setNullifiedId);
    return unsubscribe;
  }, [gameId]);

  if (round?.phase !== "finale") {
    return <Card><p style={{ color: "#6b4f99", fontStyle: "italic" }}>Not in the Finale yet.</p></Card>;
  }
  if (!finale) return <Card><p style={{ color: "#6b4f99", fontStyle: "italic" }}>Loading...</p></Card>;

  const exiledPlayers = players.filter((p) => p.approved && !p.alive);
  const chaosHolder = players.find((p) => p.id === finale.chaosHolderId);
  const byId = {};
  finale.finalists.forEach((f) => (byId[f.playerId] = f.name));
  const voteRows = Object.entries(votes).map(([voterId, v]) => ({ voterId, targetId: v.targetId, reason: v.reason }));
  const finalistIds = finale.finalists.map((f) => f.playerId);
  const outcome = computeFinaleOutcome(voteRows, nullifiedId, finalistIds);

  const commitVote = async (voterId, targetId) => {
    dirtyRef.current.add(voterId);
    const voterName = players.find((p) => p.id === voterId)?.display_name || "?";
    const targetName = byId[targetId] || "";
    await storageUpdate(gameId, VOTES_KEY, (fresh) => {
      const existing = fresh || {};
      if (!targetId) { delete existing[voterId]; return existing; }
      existing[voterId] = { ...(existing[voterId] || {}), targetId, targetName, voterName, time: new Date().toLocaleTimeString() };
      return existing;
    });
    dirtyRef.current.delete(voterId);
  };

  const closeVoting = async () => {
    await storageUpdate(gameId, KEY_FINALE, (fresh) => {
      if (!fresh) return null;
      fresh.votingOpen = false;
      return fresh;
    });
  };

  // Fallback only — the expected path is the chaos holder breaking the
  // tie themselves from their own screen (see ChaosPowerPlayer.jsx).
  const setTieBreak = async (finalistId) => {
    await storageUpdate(gameId, KEY_FINALE, (fresh) => {
      if (!fresh) return null;
      fresh.tieBreakChoiceId = finalistId;
      return fresh;
    });
  };

  const finishNow = async () => {
    setBusy(true);
    await requestAdvance(gameId, true);
    setBusy(false);
  };

  const postSummaryToGroupMe = async () => {
    setBusy(true);
    const lines = voteRows.map((r) => `${players.find((p) => p.id === r.voterId)?.display_name || "?"} → ${byId[r.targetId] || "?"}${r.reason ? ` ("${r.reason}")` : ""}`);
    const chaosLine = nullifiedId ? `🃏 ${chaosHolder?.display_name || "The Power of Chaos"} nullified ${byId[nullifiedId] || "?"} — they can't win.` : "";
    const text = `🔥 Finale votes — ${finale.finalists.map((f) => f.name).join(", ")}\n\n${lines.join("\n")}\n\n${chaosLine}`.trim();
    const res = await postToGroupMe(gameId, text);
    setBusy(false);
    if (!res.ok) { alert("Couldn't post to GroupMe: " + res.error); return; }
    setPostedToGroupMe(true);
  };

  return (
    <Card style={{ borderColor: "rgba(255,45,149,0.4)" }}>
      <h3 style={{ color: "#ff2d95", margin: "0 0 4px", fontSize: 16, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🔥 Finale</h3>
      <p style={{ color: "#6b4f99", fontSize: 12, margin: "0 0 12px", fontStyle: "italic" }}>
        Finalists: {finale.finalists.map((f) => f.name).join(", ")}. Every exiled player votes FOR a winner. The nullified finalist can never win; whoever has the most votes between the other two wins.
      </p>

      <div style={{ background: "#0d0618", borderRadius: 8, padding: 10, marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
          🃏 Power of Chaos (drawn from the exiled): <span style={{ color: "#ff3860" }}>{chaosHolder?.display_name || "—"}</span>
        </div>
        <p style={{ fontSize: 12, color: nullifiedId ? "#00ff9d" : "#a68fd6", margin: 0 }}>
          {nullifiedId ? "✓ Their pick is locked in — secret until the reveal." : `Waiting on ${chaosHolder?.display_name || "them"} to choose, from their own screen.`}
        </p>
      </div>

      {finale.votingOpen ? (
        <Btn variant="danger" small onClick={closeVoting}>Close Voting</Btn>
      ) : (
        <Badge color="#00ff9d">Voting closed</Badge>
      )}

      <div style={{ marginTop: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
          Exiled players voting: {voteRows.length}/{exiledPlayers.length} in
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          {exiledPlayers.map((voter) => (
            <div key={voter.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ width: 100, fontSize: 12, fontWeight: 700, color: "#f5f0ff", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {voter.display_name}
              </span>
              <select
                value={votes[voter.id]?.targetId || ""}
                onChange={(e) => commitVote(voter.id, e.target.value)}
                style={{ flex: 1, background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 6, padding: "4px 8px", color: "#f5f0ff", fontSize: 12 }}
              >
                <option value="">—</option>
                {finale.finalists.map((f) => <option key={f.playerId} value={f.playerId}>{f.name}</option>)}
              </select>
              {votes[voter.id]?.reason && <span style={{ fontSize: 10, color: "#6b4f99" }} title={votes[voter.id].reason}>💬</span>}
            </div>
          ))}
          {exiledPlayers.length === 0 && <p style={{ color: "#6b4f99", fontSize: 12, fontStyle: "italic" }}>No exiled players yet to vote — this can happen in a short game.</p>}
        </div>
      </div>

      {outcome.needsTieBreak && (
        <Card style={{ borderColor: "rgba(255,56,96,0.5)", marginBottom: 12 }}>
          <p style={{ color: "#ff3860", fontSize: 13, fontWeight: 700, margin: "0 0 8px" }}>
            🃏 It's tied — waiting on {chaosHolder?.display_name || "the Power of Chaos holder"} to choose the winner from their own screen.
          </p>
          <p style={{ color: "#6b4f99", fontSize: 11, margin: "0 0 8px", fontStyle: "italic" }}>Host fallback, if needed:</p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {outcome.tied.map((id) => (
              <Btn key={id} small variant={finale.tieBreakChoiceId === id ? "success" : "ghost"} onClick={() => setTieBreak(id)}>{byId[id]}</Btn>
            ))}
          </div>
        </Card>
      )}

      {!finale.votingOpen && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <Btn onClick={finishNow} disabled={busy || outcome.needsTieBreak}>{busy ? "Working..." : "🎭 Reveal Winner In-App"}</Btn>
          <Btn variant="slack" onClick={postSummaryToGroupMe} disabled={busy || outcome.needsTieBreak || postedToGroupMe}>
            {postedToGroupMe ? "✓ Posted to GroupMe" : busy ? "Posting..." : "📱 Just Post to GroupMe"}
          </Btn>
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        <PostToGroupMe gameId={gameId} icon="🔥" label="Finale Announcement"
          text={`🔥 The Finale is here! ${finale.finalists.map((f) => f.name).join(", ")} — every exiled player now votes for a winner.`} />
      </div>
    </Card>
  );
}
