import { useState, useEffect, useRef } from "react";
import { Btn, Card, Badge, ChaosStatusBadge } from "./ui";
import { storageUpdate, subscribeGameState } from "../lib/gameStorage";
import { KEY_EXILE } from "../lib/gameState";
import { computeEliminateOutcome, computeSaveOutcome, buildRevealOrder } from "../lib/exileLogic";
import { filterCancelledVote } from "../lib/characterPowers";
import { exileContext, subscribeChaosSecret } from "../lib/chaosSecrets";
import { exileDrawContext, chaosPicksKey } from "../lib/chaosDraw";
import CopyMessage from "./CopyMessage";
import { requestAdvance } from "../lib/advanceNow";

export default function ExileVoteHost({ gameId, players, round }) {
  const [exile, setExile] = useState(null);
  const [votes, setVotes] = useState({});
  const [chaosSecret, setChaosSecret] = useState(null); // { nomineeId, reason } | null — host CAN read this (see sql/add-chaos-secrets.sql) — just doesn't show it until reveal
  const [drawPicks, setDrawPicks] = useState({});
  const [revealOrder, setRevealOrder] = useState(null);
  const [revealIndex, setRevealIndex] = useState(-1);
  const [chaosRevealed, setChaosRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState({});
  const dirtyRef = useRef(new Set());
  const [showComments, setShowComments] = useState(false);

  const votesKey = `pb:exile-votes:${round?.round}`;
  const context = exileContext(round?.round);
  const drawContext = exileDrawContext(round?.round);

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
    const unsubscribe = subscribeChaosSecret(gameId, context, setChaosSecret);
    return unsubscribe;
  }, [gameId, context]);

  useEffect(() => {
    if (!round?.round) return;
    const unsubscribe = subscribeGameState(gameId, chaosPicksKey(drawContext), (v) => setDrawPicks(v || {}));
    return unsubscribe;
  }, [gameId, drawContext]);

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
  const nullifiedId = chaosSecret?.nomineeId || null;
  const voteRows = filterCancelledVote(
    Object.entries(votes).map(([voterId, v]) => ({ voterId, targetId: v.targetId, reason: v.reason })),
    exile.artemisCancelledVoterId
  );
  const nomineeIds = exile.nominees.map((n) => n.playerId);
  const byId = {};
  exile.nominees.forEach((n) => (byId[n.playerId] = n.name));

  const outcome = exile.mode === "save"
    ? computeSaveOutcome(voteRows, nullifiedId, nomineeIds)
    : computeEliminateOutcome(voteRows, nullifiedId, nomineeIds);

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
    const result = await requestAdvance(gameId, true);
    setBusy(false);
    if (result.error) alert("Couldn't move on: " + result.error);
  };

  const buildResultsSummary = () => {
    const lines = voteRows.map((r) => `${players.find((p) => p.id === r.voterId)?.display_name || "?"} → ${byId[r.targetId] || "?"}${r.reason ? ` ("${r.reason}")` : ""}`);
    const chaosLine = nullifiedId ? `🃏 ${chaosHolder?.display_name || "The Power of Khaos"} nullified ${byId[nullifiedId] || "?"}.${chaosSecret?.reason ? ` ("${chaosSecret.reason}")` : ""}` : "";
    return `🃏 Exile Vote results — Round ${round.round}\n\n${lines.join("\n")}\n\n${chaosLine}`.trim();
  };

  const skipReveal = () => setChaosRevealed(true);

  const tied = outcome.tied || [];
  const needsTieBreak = outcome.needsTieBreak;
  // needsTieBreak alone stays true forever once a tie exists — it's a pure
  // function of the vote tally, which doesn't change just because someone
  // broke the tie. The buttons below need to unblock once a choice has
  // actually been made (matches lib/roundEngine.js's own check, which is
  // exactly `needsTieBreak && !exile.tieBreakChoiceId`).
  const tieBreakUnresolved = needsTieBreak && !exile.tieBreakChoiceId;

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
          ? "Everyone votes for who to SAVE. Whoever the Power of Khaos nullifies, and whoever has the fewest save votes among the rest, are both exiled."
          : "Everyone votes for who to eliminate. Whoever the Power of Khaos nullifies can't be exiled no matter how many votes they get."}
      </p>

      <div style={{ background: "#0d0618", borderRadius: 8, padding: 10, marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
          🃏 Power of Khaos
        </div>
        {chaosHolder ? (
          <p style={{ fontSize: 12, color: nullifiedId ? "#00ff9d" : "#a68fd6", margin: 0 }}>
            <strong style={{ color: "#ff3860" }}>{chaosHolder.display_name}</strong> claimed it.{" "}
            {nullifiedId ? (
              <>✓ Locked in: nullifying <strong style={{ color: "#ff3860" }}>{byId[nullifiedId] || "?"}</strong> — visible to you now, still secret from players until you reveal it below.</>
            ) : (
              "Waiting on them to choose, from their own screen."
            )}
          </p>
        ) : (
          <p style={{ fontSize: 12, color: "#a68fd6", margin: 0 }}>
            Every voter got one shot at a mystery-card draw on their own screen ({alive.length} cards, one Power of Khaos) — {Object.keys(drawPicks).length}/{alive.length} have picked so far.
            {exile.votingOpen ? " Still up for grabs." : " Voting's closed with nobody claiming it — no one holds it this round."}
          </p>
        )}
        {nullifiedId && chaosSecret?.reason && (
          <p style={{ fontSize: 11, color: "#a68fd6", fontStyle: "italic", margin: "6px 0 0" }}>"{chaosSecret.reason}"</p>
        )}
      </div>

      {exile.votingOpen ? (
        <Btn variant="danger" onClick={closeVoting} small>Close Voting</Btn>
      ) : (
        <Badge color="#00ff9d">Voting closed</Badge>
      )}

      <div style={{ marginTop: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
          Votes: {voteRows.length}/{alive.length} in
        </div>
        <div style={{ fontSize: 10, color: "#6b4f99", marginBottom: 8 }}>🃏 next to a name shows their Power of Khaos draw status — green = won it, red = picked but didn't win, gray = hasn't picked yet.</div>
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
              <ChaosStatusBadge holderId={exile.chaosHolderId} playerId={voter.id} drawPicks={drawPicks} />
            </div>
          ))}
        </div>
      </div>

      {voteRows.some((r) => r.reason) && (
        <div style={{ marginBottom: 12 }}>
          <Btn small variant="ghost" onClick={() => setShowComments(!showComments)}>
            {showComments ? "▲ Hide Comments" : `▼ Show Comments (${voteRows.filter((r) => r.reason).length})`}
          </Btn>
          {showComments && (
            <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
              {voteRows.filter((r) => r.reason).map((r) => (
                <div key={r.voterId} style={{ background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 8, padding: "8px 12px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#f5f0ff", marginBottom: 2 }}>
                    {players.find((p) => p.id === r.voterId)?.display_name || "?"}
                  </div>
                  <div style={{ fontSize: 12, color: "#a68fd6", fontStyle: "italic" }}>"{r.reason}"</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {needsTieBreak && (
        <Card style={{ borderColor: exile.tieBreakChoiceId ? "rgba(0,255,157,0.5)" : "rgba(255,56,96,0.5)", marginBottom: 12 }}>
          {exile.tieBreakChoiceId ? (
            <p style={{ color: "#00ff9d", fontSize: 13, fontWeight: 700, margin: "0 0 8px" }}>
              ✓ Tie broken — {byId[exile.tieBreakChoiceId] || "?"} chosen. Ready to continue below.
            </p>
          ) : (
            <p style={{ color: "#ff3860", fontSize: 13, fontWeight: 700, margin: "0 0 8px" }}>
              🃏 It's tied — waiting on {chaosHolder?.display_name || "the Power of Khaos holder"} to break it from their own screen.
            </p>
          )}
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
            <div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                <Btn onClick={startReveal}>🎭 Reveal In-App</Btn>
                <Btn variant="ghost" onClick={skipReveal} disabled={busy}>⏭ Skip Reveal — Just Finalize</Btn>
              </div>
              <CopyMessage icon="🃏" label="Copy Results Summary" text={buildResultsSummary()} />
            </div>
          ) : chaosRevealed && !revealOrder ? (
            <Btn onClick={finishNow} disabled={busy || tieBreakUnresolved}>{busy ? "Working..." : "Finalize Exile & Continue"}</Btn>
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
                <Btn onClick={() => setChaosRevealed(true)} disabled={tieBreakUnresolved}>
                  🃏 Reveal the Power of Khaos — {chaosHolder?.display_name || "?"} chose {nullifiedId ? byId[nullifiedId] || "?" : "no one"}
                </Btn>
              ) : (
                <div>
                  {chaosSecret?.reason && (
                    <p style={{ color: "#a68fd6", fontSize: 12, fontStyle: "italic", margin: "0 0 10px", padding: "8px 12px", background: "#0d0618", borderRadius: 8 }}>
                      🃏 "{chaosSecret.reason}"
                    </p>
                  )}
                  <Btn onClick={finishNow} disabled={busy || tieBreakUnresolved}>{busy ? "Working..." : "Finalize Exile & Continue"}</Btn>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <CopyMessage icon="🃏" label="Exile Vote Announcement"
        text={`In Olympus, all crave power. Power, however, comes at a cost. Whom are you willing to betray, to manipulate, to exile?\n\n🃏 The Exile Vote is underway. Nominees: ${exile.nominees.map((n) => n.name).join(", ")}. Power of Khaos: ${chaosHolder?.display_name || "?"}.`} />
    </Card>
  );
}
