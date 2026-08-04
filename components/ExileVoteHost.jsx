import { useState, useEffect, useRef } from "react";
import { Btn, Card, Badge } from "./ui";
import { storageUpdate, subscribeGameState } from "../lib/gameStorage";
import { KEY_EXILE } from "../lib/gameState";
import { computeEliminateOutcome, computeSaveOutcome, buildRevealOrder } from "../lib/exileLogic";
import { exileContext, subscribeChaosSecret } from "../lib/chaosSecrets";
import PostToGroupMe from "./PostToGroupMe";
import { postToGroupMe } from "../lib/groupmeClient";
import { requestAdvance } from "../lib/advanceNow";

const CARD_DECK = ["🂡 Ace", "🂮 King", "🂭 Queen", "🂫 Jack", "🃏 Joker — The Power of Chaos smiles on no one tonight", "10", "7", "3"];

export default function ExileVoteHost({ gameId, players, round }) {
  const [exile, setExile] = useState(null);
  const [votes, setVotes] = useState({});
  const [nullifiedId, setNullifiedId] = useState(null); // host CAN read this (see sql/add-chaos-secrets.sql) — just doesn't show it until reveal
  const [revealOrder, setRevealOrder] = useState(null);
  const [revealIndex, setRevealIndex] = useState(-1);
  const [chaosRevealed, setChaosRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState({});
  const dirtyRef = useRef(new Set());

  const votesKey = `pb:exile-votes:${round?.round}`;
  const context = exileContext(round?.round);

  useEffect(() => {
    const unsubscribe = subscribeGameState(gameId, KEY_EXILE, setExile);
    return unsubscribe;
  }, [gameId, round?.round]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!round?.round) return;
    const unsubscribe = subscribeGameState(gameId, votesKey, (v) => setVotes(v || {}));
    return unsubscribe;
  }, [gameId, round?.round]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!round?.round) return;
    const unsubscribe = subscribeChaosSecret(gameId, context, setNullifiedId);
    return unsubscribe;
  }, [gameId, context]);

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
    return <Card><p style={{ color: "#6b4f99", fontStyle: "italic" }}>Not in the Exile Vote phase right now.</p></Card>;
  }
  if (!exile) return <Card><p style={{ color: "#6b4f99", fontStyle: "italic" }}>Loading...</p></Card>;

  const chaosHolder = players.find((p) => p.id === exile.chaosHolderId);
  const voteRows = Object.entries(votes).map(([voterId, v]) => ({ voterId, targetId: v.targetId, reason: v.reason }));
  const nomineeIds = exile.nominees.map((n) => n.playerId);
  const byId = {};
  exile.nominees.forEach((n) => (byId[n.playerId] = n.name));

  const outcome = exile.mode === "save"
    ? computeSaveOutcome(voteRows, nullifiedId, nomineeIds)
    : computeEliminateOutcome(voteRows, nullifiedId, nomineeIds);

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
      existing[voterId] = { ...(existing[voterId] || {}), targetId, targetName, voterName, time: new Date().toLocaleTimeString() };
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

  // Fallback only — the expected path is the chaos holder breaking the
  // tie themselves from their own screen (see ChaosPowerPlayer.jsx).
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

  const postSummaryToGroupMe = async () => {
    setBusy(true);
    const lines = voteRows.map((r) => `${players.find((p) => p.id === r.voterId)?.display_name || "?"} → ${byId[r.targetId] || "?"}${r.reason ? ` ("${r.reason}")` : ""}`);
    const chaosLine = nullifiedId ? `🃏 ${chaosHolder?.display_name || "The Power of Chaos"} nullified ${byId[nullifiedId] || "?"}.` : "";
    const text = `🃏 Exile Vote results — Round ${round.round}\n\n${lines.join("\n")}\n\n${chaosLine}`.trim();
    const res = await postToGroupMe(gameId, text);
    setBusy(false);
    if (!res.ok) { alert("Couldn't post to GroupMe: " + res.error); return; }
    setChaosRevealed(true);
  };

  const tied = outcome.tied || [];
  const needsTieBreak = outcome.needsTieBreak;

  return (
    <Card style={{ borderColor: "rgba(255,45,149,0.3)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
          🃏 Exile Vote — Round {round.round}
        </h3>
        {exile.mode === "save" && <Badge color="#ff3860">Double Elimination · Vote to SAVE</Badge>}
      </div>
      <p style={{ color: "#6b4f99", fontSize: 12, margin: "0 0 12px", fontStyle: "italic" }}>
        Nominees: {exile.nominees.map((n) => n.name).join(", ")}.{" "}
        {exile.mode === "save"
          ? "Everyone votes for who to SAVE. Whoever the Power of Chaos nullifies, and whoever has the fewest save votes among the rest, are both exiled."
          : "Everyone votes for who to eliminate. Whoever the Power of Chaos nullifies can't be exiled no matter how many votes they get."}
      </p>

      <div style={{ background: "#0d0618", borderRadius: 8, padding: 10, marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
          🃏 Power of Chaos: <span style={{ color: "#ff3860" }}>{chaosHolder?.display_name || "—"}</span>
        </div>
        <p style={{ fontSize: 12, color: nullifiedId ? "#00ff9d" : "#a68fd6", margin: "0 0 8px" }}>
          {nullifiedId ? "✓ Their pick is locked in — secret until you reveal it below." : `Waiting on ${chaosHolder?.display_name || "them"} to choose, from their own screen.`}
        </p>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <Btn small variant="ghost" onClick={drawCard}>🃏 Fan of Cards — Draw</Btn>
          {exile.cardDrawnText && <span style={{ fontSize: 12, color: "#ff2d95" }}>{exile.cardDrawnText}</span>}
        </div>
      </div>

      {exile.votingOpen ? (
        <Btn variant="danger" onClick={closeVoting} small>Close Voting</Btn>
      ) : (
        <Badge color="#00ff9d">Voting closed</Badge>
      )}

      <div style={{ marginTop: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
          Votes: {voteRows.length}/{alive.length} in
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          {alive.map((voter) => (
            <div key={voter.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ width: 100, fontSize: 12, fontWeight: 700, color: "#f5f0ff", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {voter.display_name}
              </span>
              <select
                value={drafts[voter.id] || ""}
                onChange={(e) => { dirtyRef.current.add(voter.id); setDrafts((d) => ({ ...d, [voter.id]: e.target.value })); commitVote(voter.id, e.target.value); }}
                style={{ flex: 1, background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 6, padding: "4px 8px", color: "#f5f0ff", fontSize: 12 }}
              >
                <option value="">—</option>
                {exile.nominees.map((n) => <option key={n.playerId} value={n.playerId}>{n.name}</option>)}
              </select>
              {votes[voter.id]?.reason && <span style={{ fontSize: 10, color: "#6b4f99" }} title={votes[voter.id].reason}>💬</span>}
            </div>
          ))}
        </div>
      </div>

      {needsTieBreak && (
        <Card style={{ borderColor: "rgba(255,56,96,0.5)", marginBottom: 12 }}>
          <p style={{ color: "#ff3860", fontSize: 13, fontWeight: 700, margin: "0 0 8px" }}>
            🃏 It's tied — waiting on {chaosHolder?.display_name || "the Power of Chaos holder"} to break it from their own screen.
          </p>
          <p style={{ color: "#6b4f99", fontSize: 11, margin: "0 0 8px", fontStyle: "italic" }}>Host fallback, if needed:</p>
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
        <div style={{ borderTop: "1px solid #3d1f5c", paddingTop: 12, marginBottom: 12 }}>
          {!revealOrder && !chaosRevealed ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Btn onClick={startReveal}>🎭 Reveal In-App</Btn>
              <Btn variant="slack" onClick={postSummaryToGroupMe} disabled={busy}>{busy ? "Posting..." : "📱 Just Post to GroupMe"}</Btn>
            </div>
          ) : chaosRevealed && !revealOrder ? (
            <Btn onClick={finishNow} disabled={busy || needsTieBreak}>{busy ? "Working..." : "Finalize Exile & Continue"}</Btn>
          ) : (
            <div>
              <div style={{ display: "grid", gap: 8, marginBottom: 10 }}>
                {revealOrder.slice(0, revealIndex + 1).map((row, i) => (
                  <div key={row.voterId} style={{ fontSize: 13, color: "#f5f0ff", background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 8, padding: "8px 12px", opacity: i === revealIndex ? 1 : 0.6 }}>
                    <div>{players.find((p) => p.id === row.voterId)?.display_name}: {row.targetName}</div>
                    {row.reason && <div style={{ color: "#a68fd6", fontSize: 12, fontStyle: "italic", marginTop: 4 }}>"{row.reason}"</div>}
                  </div>
                ))}
              </div>
              {!revealDone ? (
                <div style={{ display: "flex", gap: 8 }}>
                  <Btn onClick={revealNext}>Reveal Next Vote</Btn>
                  <Btn variant="ghost" small onClick={revealAll}>Reveal All</Btn>
                </div>
              ) : !chaosRevealed ? (
                <Btn onClick={() => setChaosRevealed(true)} disabled={needsTieBreak}>
                  🃏 Reveal the Power of Chaos — {chaosHolder?.display_name || "?"} chose {nullifiedId ? byId[nullifiedId] || "?" : "no one"}
                </Btn>
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
