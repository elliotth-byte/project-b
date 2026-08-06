import { useState, useEffect } from "react";
import { Card, Badge } from "./ui";
import { subscribeGameState, storageUpdate } from "../lib/gameStorage";
import { KEY_EXILE, KEY_FINALE } from "../lib/gameState";
import { computeEliminateOutcome, computeSaveOutcome, computeFinaleOutcome } from "../lib/exileLogic";
import { exileContext, FINALE_CONTEXT, setChaosNullify, subscribeChaosSecret } from "../lib/chaosSecrets";
import MemoryWall from "./MemoryWall";

// Renders nothing at all unless the current player genuinely holds the
// Power of Chaos for whatever's active right now. `players` is the full
// roster (for MemoryWall's color lookup).
export default function ChaosPowerPlayer({ gameId, round, player, players, readOnly = false }) {
  const isExile = round?.phase === "exile";
  const isFinale = round?.phase === "finale";
  const key = isExile ? KEY_EXILE : isFinale ? KEY_FINALE : null;
  const votesKey = isExile ? `pb:exile-votes:${round.round}` : isFinale ? "pb:finale-votes" : null;
  const context = isExile ? exileContext(round?.round) : isFinale ? FINALE_CONTEXT : null;

  const [state, setState] = useState(null);
  const [votes, setVotes] = useState({});
  const [myPick, setMyPick] = useState(null);

  useEffect(() => {
    if (!key) return;
    const unsubscribe = subscribeGameState(gameId, key, setState);
    return unsubscribe;
  }, [gameId, key, round?.round]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!votesKey) return;
    const unsubscribe = subscribeGameState(gameId, votesKey, (v) => setVotes(v || {}));
    return unsubscribe;
  }, [gameId, votesKey]);

  useEffect(() => {
    if (!context) return;
    const unsubscribe = subscribeChaosSecret(gameId, context, setMyPick);
    return unsubscribe;
  }, [gameId, context]);

  if (!state || state.chaosHolderId !== player?.id) return null;

  // A read-only viewer (the host "viewing as" this player) can't actually
  // read this player's secret pick anyway — chaos_secrets' RLS is keyed
  // to the real authenticated session, which is the host's, not this
  // player's — and must never be able to lock one in on their behalf, so
  // this skips straight to a plain "holds it, pick stays secret" card
  // instead of the interactive picker.
  if (readOnly) {
    return (
      <Card style={{ marginBottom: 20, borderColor: "#ff2d95", boxShadow: "0 0 24px rgba(255,45,149,0.25)" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 4 }}>🃏</div>
          <h3 style={{ color: "#ff2d95", margin: "0 0 4px", fontSize: 16, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
            Holds the Power of Chaos
          </h3>
          <p style={{ color: "#a68fd6", fontSize: 12, margin: 0 }}>Their pick is kept secret until the reveal — even from this viewer.</p>
        </div>
      </Card>
    );
  }

  const candidates = isExile ? state.nominees : state.finalists;
  const nomineeIds = candidates.map((c) => c.playerId);
  const voteRows = Object.entries(votes).map(([voterId, v]) => ({ voterId, targetId: v.targetId }));

  const pick = async (nomineeId) => {
    const ok = await setChaosNullify(gameId, context, nomineeId);
    if (!ok) alert("Couldn't lock that in — try again.");
  };

  // Tie-break only becomes relevant once voting has actually closed —
  // no point computing it while votes are still coming in.
  let outcome = null;
  if (!state.votingOpen) {
    if (isExile) {
      outcome = state.mode === "save"
        ? computeSaveOutcome(voteRows, myPick, nomineeIds)
        : computeEliminateOutcome(voteRows, myPick, nomineeIds);
    } else {
      outcome = computeFinaleOutcome(voteRows, myPick, nomineeIds);
    }
  }
  const needsTieBreak = outcome?.needsTieBreak && !state.tieBreakChoiceId;
  const tied = outcome?.tied || [];

  const breakTie = async (nomineeId) => {
    await storageUpdate(gameId, key, (fresh) => {
      if (!fresh) return null;
      fresh.tieBreakChoiceId = nomineeId;
      return fresh;
    });
  };

  const byId = {};
  candidates.forEach((c) => (byId[c.playerId] = c.name));

  return (
    <Card style={{ marginBottom: 20, borderColor: "#ff2d95", boxShadow: "0 0 24px rgba(255,45,149,0.25)" }}>
      <div style={{ textAlign: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 32, marginBottom: 4 }}>🃏</div>
        <h3 style={{ color: "#ff2d95", margin: "0 0 4px", fontSize: 16, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
          You hold the Power of Chaos
        </h3>
        <p style={{ color: "#a68fd6", fontSize: 12, margin: 0 }}>
          {isExile
            ? state.mode === "save"
              ? "Choose whose save-votes to nullify entirely — kept secret from everyone else until the reveal."
              : "Choose who can't be exiled this round, no matter how many votes they get — kept secret from everyone else until the reveal."
            : "Choose which finalist can never win — kept secret from everyone else until the reveal."}
        </p>
      </div>

      {needsTieBreak ? (
        <div>
          <p style={{ color: "#ff3860", fontSize: 13, fontWeight: 700, textAlign: "center", margin: "0 0 10px" }}>🃏 It's tied — you have to break it.</p>
          <MemoryWall candidates={tied.map((id) => ({ playerId: id, name: byId[id] }))} players={players} selectedId={state.tieBreakChoiceId} onSelect={breakTie} />
        </div>
      ) : state.tieBreakChoiceId ? (
        <p style={{ color: "#00ff9d", fontSize: 13, textAlign: "center", margin: 0 }}>✓ Tie broken — {byId[state.tieBreakChoiceId]}.</p>
      ) : myPick ? (
        <div style={{ textAlign: "center" }}>
          <Badge color="#ff2d95">Locked in: {byId[myPick] || "?"}</Badge>
          {state.votingOpen && (
            <p style={{ color: "#6b4f99", fontSize: 11, marginTop: 8, fontStyle: "italic" }}>You can still change your mind while voting's open.</p>
          )}
          {state.votingOpen && (
            <div style={{ marginTop: 12 }}>
              <MemoryWall candidates={candidates} players={players} selectedId={myPick} onSelect={pick} />
            </div>
          )}
        </div>
      ) : (
        <MemoryWall candidates={candidates} players={players} selectedId={myPick} onSelect={pick} />
      )}
    </Card>
  );
}
