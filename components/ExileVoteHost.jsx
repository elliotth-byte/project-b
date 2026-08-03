import { useState, useEffect, useRef } from "react";
import { Btn, Card, Badge } from "./ui";
import { storageSet, storageUpdate, subscribeGameState } from "../lib/gameStorage";
import { KEY_EXILE } from "../lib/gameState";
import { computeEliminateOutcome, computeSaveOutcome, buildRevealOrder } from "../lib/exileLogic";
import PostToGroupMe from "./PostToGroupMe";
import { requestAdvance } from "../lib/advanceNow";

const CARD_DECK = ["🂡 Ace", "🂮 King", "🂭 Queen", "🂫 Jack", "🃏 Joker — The Power of Chaos smiles on no one tonight", "10", "7", "3"];

export default function ExileVoteHost({ gameId, players, round }) {
  const [exile, setExile] = useState(null);
  const [votes, setVotes] = useState({});
  const [revealOrder, setRevealOrder] = useState(null);
  const [revealIndex, setRevealIndex] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState({});
  const dirtyRef = useRef(new Set());

  const votesKey = `pb:exile-votes:${round?.round}`;

  useEffect(() => {
    const unsubscribe = subscribeGameState(gameId, KEY_EXILE, setExile);
    return unsubscribe;
  }, [gameId, round?.round]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!round?.round) return;
    const unsubscribe = subscribeGameState(gameId, votesKey, (v) => setVotes(v || {}));
    return unsubscribe;
  }, [gameId, round?.round]); // eslint-disable-line react-hooks/exhaustive-deps

  const alive = players.filter((p) => p.approved && p.alive);

  useEffect(() => {
    setDrafts((prev) => {
      const next = { ...prev };
      alive.forEach((voter) => {
        if (dirtyRef.current.has(voter.id)) return;
        next[voter.id] = votes?.[voter.id]?.targetId || "";
      });
      return next;
    });
  }, [votes, alive]); // eslint-disable-line react-hooks/exhaustive-deps

  if (round?.phase !== "exile") {
    return <Card><p style={{ color: "#706050", fontStyle: "italic" }}>Not in the Exile Vote phase right now.</p></Card>;
  }
  if (!exile) return <Card><p style={{ color: "#706050", fontStyle: "italic" }}>Loading...</p></Card>;

  const chaosHolder = players.find((p) => p.id === exile.chaosHolderId);
  const voteRows = Object.entries(votes).map(([voterId, v]) => ({ voterId, targetId: v.targetId }));
  const nomineeIds = exile.nominees.map((n) => n.playerId);
  const byId = {};
  exile.nominees.forEach((n) => (byId[n.playerId] = n.name));

  const outcome = exile.mode === "save"
    ? computeSaveOutcome(voteRows, exile.chaosNullifiedNomineeId, nomineeIds)
    : computeEliminateOutcome(voteRows, exile.chaosNullifiedNomineeId, nomineeIds);

  const setNullified = async (nomineeId) => {
    await storageUpdate(gameId, KEY_EXILE, (fresh) => {
      if (!fresh) return null;
      fresh.chaosNullifiedNomineeId = nomineeId || null;
      return fresh;
    });
  };

  const drawCard = async () => {
    const card = CARD_DECK[Math.floor(Math.random() * CARD_DECK.length)];
    await storageUpdate(gameId, KEY_EXILE, (fresh) => {
      if (!fresh) return null;
      fresh.cardsFanned = true;
      fresh.cardDrawnText = card;
      return fresh;
    });
  };

  const commitVote = async (voterId, targetId) => {
    dirtyRef.current.add(voterId);
    const voterName = players.find((p) => p.id === voterId)?.display_name || "?";
    const targetName = byId[targetId] || "";
    await storageUpdate(gameId, votesKey, (fresh) => {
      const existing = fresh || {};
      if (!targetId) { delete existing[voterId]; return existing; }
      existing[voterId] = { targetId, targetName, voterName, time: new Date().toLocaleTimeString() };
      return existing;
    });
    dirtyRef.current.delete(voterId);
  };

  const closeVoting = async () => {
    await storageUpdate(gameId, KEY_EXILE, (fresh) => {
      if (!fresh) return null;
      fresh.votingOpen = false;
      return fresh;
    });
  };

  const startReveal = () => {
    const order = buildRevealOrder(voteRows.map((r) => ({ ...r, targetName: byId[r.targetId] })));
    setRevealOrder(order);
    setRevealIndex(order.length ? 0 : -1);
  };
  const revealNext = () => setRevealIndex((i) => Math.min(i + 1, (revealOrder?.length || 1) - 1));
  const revealAll = () => setRevealIndex((revealOrder?.length || 1) - 1);
  const revealDone = revealOrder && revealIndex >= revealOrder.length - 1;

  const setTieBreak = async (nomineeId) => {
    await storageUpdate(gameId, KEY_EXILE, (fresh) => {
      if (!fresh) return null;
      fresh.tieBreakChoiceId = nomineeId;
      return fresh;
    });
  };

  const finishNow = async () => {
    setBusy(true);
    await requestAdvance(gameId, true);
    setBusy(false);
  };

  const tied = outcome.tied || [];
  const needsTieBreak = outcome.needsTieBreak;

  return (
    <Card style={{ borderColor: "rgba(201,168,76,0.3)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <h3 style={{ color: "#c9a84c", margin: 0, fontSize: 15, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>
          🃏 Exile Vote — Round {round.round}
        </h3>
        {exile.mode === "save" && <Badge color="#c45c3c">Double Elimination · Vote to SAVE</Badge>}
      </div>
      <p style={{ color: "#706050", fontSize: 12, margin: "0 0 12px", fontStyle: "italic" }}>
        Nominees: {exile.nominees.map((n) => n.name).join(", ")}.{" "}
        {exile.mode === "save"
          ? "Everyone votes for who to SAVE. Whoever the Power of Chaos nullifies, and whoever has the fewest save votes among the rest, are both exiled."
          : "Everyone votes for who to eliminate. Whoever the Power of Chaos nullifies can't be exiled no matter how many votes they get."}
      </p>

      <div style={{ background: "#0a1020", borderRadius: 8, padding: 10, marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "#a09080", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
          🃏 Power of Chaos: <span style={{ color: "#c45c3c" }}>{chaosHolder?.display_name || "—"}</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: "#a09080" }}>Nullify votes for:</span>
          <select value={exile.chaosNullifiedNomineeId || ""} onChange={(e) => setNullified(e.target.value)}
            style={{ background: "#132038", border: "1px solid #253550", borderRadius: 6, padding: "5px 8px", color: "#f0e6d3", fontSize: 12 }}>
            <option value="">— no one yet —</option>
            {exile.nominees.map((n) => <option key={n.playerId} value={n.playerId}>{n.name}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <Btn small variant="ghost" onClick={drawCard}>🃏 Fan of Cards — Draw</Btn>
          {exile.cardDrawnText && <span style={{ fontSize: 12, color: "#c9a84c" }}>{exile.cardDrawnText}</span>}
        </div>
      </div>

      {exile.votingOpen ? (
        <Btn variant="danger" onClick={closeVoting} small>Close Voting</Btn>
      ) : (
        <Badge color="#7a9a5c">Voting closed</Badge>
      )}

      <div style={{ marginTop: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#a09080", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
          Votes: {voteRows.length}/{alive.length} in
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          {alive.map((voter) => (
            <div key={voter.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ width: 100, fontSize: 12, fontWeight: 700, color: "#f0e6d3", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {voter.display_name}
              </span>
              <select
                value={drafts[voter.id] || ""}
                onChange={(e) => { dirtyRef.current.add(voter.id); setDrafts((d) => ({ ...d, [voter.id]: e.target.value })); commitVote(voter.id, e.target.value); }}
                style={{ flex: 1, background: "#0a1020", border: "1px solid #253550", borderRadius: 6, padding: "4px 8px", color: "#f0e6d3", fontSize: 12 }}
              >
                <option value="">—</option>
                {exile.nominees.map((n) => <option key={n.playerId} value={n.playerId}>{n.name}</option>)}
              </select>
            </div>
          ))}
        </div>
      </div>

      {needsTieBreak && (
        <Card style={{ borderColor: "rgba(196,92,60,0.5)", marginBottom: 12 }}>
          <p style={{ color: "#c45c3c", fontSize: 13, fontWeight: 700, margin: "0 0 8px" }}>
            🃏 It's tied — {chaosHolder?.display_name || "the Power of Chaos holder"} must break the tie.
          </p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {tied.map((id) => (
              <Btn key={id} small variant={exile.tieBreakChoiceId === id ? "danger" : "ghost"} onClick={() => setTieBreak(id)}>
                {byId[id]}{exile.mode === "save" ? " (also exile)" : ""}
              </Btn>
            ))}
          </div>
        </Card>
      )}

      {!exile.votingOpen && voteRows.length > 0 && (
        <div style={{ borderTop: "1px solid #253550", paddingTop: 12, marginBottom: 12 }}>
          {!revealOrder ? (
            <Btn onClick={startReveal}>Start Dramatic Reveal</Btn>
          ) : (
            <div>
              <div style={{ display: "grid", gap: 8, marginBottom: 10 }}>
                {revealOrder.slice(0, revealIndex + 1).map((row, i) => (
                  <div key={row.voterId} style={{ fontSize: 13, color: "#f0e6d3", background: "#0a1020", border: "1px solid #253550", borderRadius: 8, padding: "8px 12px", opacity: i === revealIndex ? 1 : 0.6 }}>
                    {players.find((p) => p.id === row.voterId)?.display_name}: {row.targetName}
                  </div>
                ))}
              </div>
              {!revealDone ? (
                <div style={{ display: "flex", gap: 8 }}>
                  <Btn onClick={revealNext}>Reveal Next Vote</Btn>
                  <Btn variant="ghost" small onClick={revealAll}>Reveal All</Btn>
                </div>
              ) : (
                <Btn onClick={finishNow} disabled={busy || needsTieBreak}>{busy ? "Working..." : "Finalize Exile & Continue"}</Btn>
              )}
            </div>
          )}
        </div>
      )}

      <PostToGroupMe gameId={gameId} icon="🃏" label="Exile Vote Announcement"
        text={`🃏 The Exile Vote is underway. Nominees: ${exile.nominees.map((n) => n.name).join(", ")}. Power of Chaos: ${chaosHolder?.display_name || "?"}.`} />
    </Card>
  );
}
