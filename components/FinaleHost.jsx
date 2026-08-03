import { useState, useEffect, useRef } from "react";
import { Btn, Card, Badge } from "./ui";
import { storageUpdate, subscribeGameState } from "../lib/gameStorage";
import { KEY_FINALE } from "../lib/gameState";
import { computeFinaleOutcome } from "../lib/exileLogic";
import PostToGroupMe from "./PostToGroupMe";
import { requestAdvance } from "../lib/advanceNow";

const VOTES_KEY = "pb:finale-votes";

export default function FinaleHost({ gameId, players, round }) {
  const [finale, setFinale] = useState(null);
  const [votes, setVotes] = useState({});
  const [busy, setBusy] = useState(false);
  const dirtyRef = useRef(new Set());

  useEffect(() => {
    const unsubscribe = subscribeGameState(gameId, KEY_FINALE, setFinale);
    return unsubscribe;
  }, [gameId]);

  useEffect(() => {
    const unsubscribe = subscribeGameState(gameId, VOTES_KEY, (v) => setVotes(v || {}));
    return unsubscribe;
  }, [gameId]);

  if (round?.phase !== "finale") {
    return <Card><p style={{ color: "#706050", fontStyle: "italic" }}>Not in the Finale yet.</p></Card>;
  }
  if (!finale) return <Card><p style={{ color: "#706050", fontStyle: "italic" }}>Loading...</p></Card>;

  const exiledPlayers = players.filter((p) => p.approved && !p.alive);
  const chaosHolder = players.find((p) => p.id === finale.chaosHolderId);
  const byId = {};
  finale.finalists.forEach((f) => (byId[f.playerId] = f.name));
  const voteRows = Object.entries(votes).map(([voterId, v]) => ({ voterId, targetId: v.targetId }));
  const finalistIds = finale.finalists.map((f) => f.playerId);
  const outcome = computeFinaleOutcome(voteRows, finale.nullifiedFinalistId, finalistIds);

  const setNullified = async (finalistId) => {
    await storageUpdate(gameId, KEY_FINALE, (fresh) => {
      if (!fresh) return null;
      fresh.nullifiedFinalistId = finalistId || null;
      return fresh;
    });
  };

  const commitVote = async (voterId, targetId) => {
    dirtyRef.current.add(voterId);
    const voterName = players.find((p) => p.id === voterId)?.display_name || "?";
    const targetName = byId[targetId] || "";
    await storageUpdate(gameId, VOTES_KEY, (fresh) => {
      const existing = fresh || {};
      if (!targetId) { delete existing[voterId]; return existing; }
      existing[voterId] = { targetId, targetName, voterName, time: new Date().toLocaleTimeString() };
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

  return (
    <Card style={{ borderColor: "rgba(201,168,76,0.4)" }}>
      <h3 style={{ color: "#c9a84c", margin: "0 0 4px", fontSize: 16, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>🔥 Finale</h3>
      <p style={{ color: "#706050", fontSize: 12, margin: "0 0 12px", fontStyle: "italic" }}>
        Finalists: {finale.finalists.map((f) => f.name).join(", ")}. Every exiled player votes FOR a winner. The nullified finalist can never win; whoever has the most votes between the other two wins.
      </p>

      <div style={{ background: "#0a1020", borderRadius: 8, padding: 10, marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "#a09080", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
          🃏 Power of Chaos (drawn from the exiled): <span style={{ color: "#c45c3c" }}>{chaosHolder?.display_name || "—"}</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "#a09080" }}>Nullify votes for:</span>
          <select value={finale.nullifiedFinalistId || ""} onChange={(e) => setNullified(e.target.value)}
            style={{ background: "#132038", border: "1px solid #253550", borderRadius: 6, padding: "5px 8px", color: "#f0e6d3", fontSize: 12 }}>
            <option value="">— no one yet —</option>
            {finale.finalists.map((f) => <option key={f.playerId} value={f.playerId}>{f.name}</option>)}
          </select>
        </div>
      </div>

      {finale.votingOpen ? (
        <Btn variant="danger" small onClick={closeVoting}>Close Voting</Btn>
      ) : (
        <Badge color="#7a9a5c">Voting closed</Badge>
      )}

      <div style={{ marginTop: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#a09080", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
          Exiled players voting: {voteRows.length}/{exiledPlayers.length} in
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          {exiledPlayers.map((voter) => (
            <div key={voter.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ width: 100, fontSize: 12, fontWeight: 700, color: "#f0e6d3", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {voter.display_name}
              </span>
              <select
                value={votes[voter.id]?.targetId || ""}
                onChange={(e) => commitVote(voter.id, e.target.value)}
                style={{ flex: 1, background: "#0a1020", border: "1px solid #253550", borderRadius: 6, padding: "4px 8px", color: "#f0e6d3", fontSize: 12 }}
              >
                <option value="">—</option>
                {finale.finalists.map((f) => <option key={f.playerId} value={f.playerId}>{f.name}</option>)}
              </select>
            </div>
          ))}
          {exiledPlayers.length === 0 && <p style={{ color: "#706050", fontSize: 12, fontStyle: "italic" }}>No exiled players yet to vote — this can happen in a short game.</p>}
        </div>
      </div>

      {outcome.needsTieBreak && (
        <Card style={{ borderColor: "rgba(196,92,60,0.5)", marginBottom: 12 }}>
          <p style={{ color: "#c45c3c", fontSize: 13, fontWeight: 700, margin: "0 0 8px" }}>
            🃏 It's tied — {chaosHolder?.display_name || "the Power of Chaos holder"} must choose the winner.
          </p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {outcome.tied.map((id) => (
              <Btn key={id} small variant={finale.tieBreakChoiceId === id ? "success" : "ghost"} onClick={() => setTieBreak(id)}>{byId[id]}</Btn>
            ))}
          </div>
        </Card>
      )}

      <Btn onClick={finishNow} disabled={busy || outcome.needsTieBreak || finale.votingOpen}>
        {busy ? "Working..." : "Reveal Winner"}
      </Btn>

      <div style={{ marginTop: 12 }}>
        <PostToGroupMe gameId={gameId} icon="🔥" label="Finale Announcement"
          text={`🔥 The Finale is here! ${finale.finalists.map((f) => f.name).join(", ")} — every exiled player now votes for a winner.`} />
      </div>
    </Card>
  );
}
