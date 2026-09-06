import { useState, useEffect, useRef } from "react";
import { Card, Badge } from "../ui";
import { reportScore } from "../../lib/challengeScores";
import { subscribePandorasBoxes, submitRound1Gift, submitRound2Gifts, placementValue } from "../../lib/games/pandorasBoxesData";

const PLACEMENT_LABEL = { first: "🥇 1st Place", second: "🥈 2nd Place", third: "🥉 3rd Place" };

export default function PandorasBoxesPlayer({ gameId, round, challenge, player, players }) {
  const [state, setState] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [round1Choice, setRound1Choice] = useState(null);
  // Round 2 draft: boxId -> recipientId. Cleared whenever the set of
  // boxes this player actually holds changes (i.e. once round1Holdings
  // first arrives) so a stale draft from some earlier render never
  // lingers into a submission.
  const [round2Draft, setRound2Draft] = useState({});
  const [pickingBoxId, setPickingBoxId] = useState(null);
  const reportedRef = useRef(false);

  useEffect(() => {
    const unsubscribe = subscribePandorasBoxes(gameId, round.round, (v) => { setState(v); setLoaded(true); });
    return unsubscribe;
  }, [gameId, round.round]);

  const byName = (id) => players?.find((p) => p.id === id)?.display_name || "?";

  useEffect(() => {
    if (!state || reportedRef.current) return;
    if (state.phase === "revealed") {
      reportedRef.current = true;
      reportScore(gameId, round.round, player.id, player.name, placementValue(state, player.id), { final: true });
    }
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!challenge?.active) return null;
  if (state === null && !loaded) {
    return <Card style={{ marginBottom: 20, textAlign: "center" }}><p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic" }}>Loading...</p></Card>;
  }
  if (state === null && loaded) {
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <div style={{ fontSize: 28, marginBottom: 6 }}>⚱️</div>
        <div style={{ fontSize: 12, letterSpacing: 4, textTransform: "uppercase", color: "#00ff9d" }}>Not Enough Players</div>
        <p style={{ color: "#6b4f99", fontSize: 12, marginTop: 10, fontStyle: "italic" }}>Pandora's Boxes needs at least 3 players — round 2's rule can't work with only 2.</p>
      </Card>
    );
  }

  // ─── Revealed ───
  if (state.phase === "revealed") {
    const myResult = state.results?.[player.id];
    return (
      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>⚱️ Pandora's Boxes — Opened</h3>
          <Badge>{myResult?.points || 0} pt{myResult?.points === 1 ? "" : "s"}</Badge>
        </div>
        <p style={{ textAlign: "center", color: myResult?.placement ? "#00ff9d" : "#a68fd6", fontSize: 14, fontWeight: 700, margin: "0 0 14px" }}>
          {myResult?.placement
            ? `You ended up holding the ${PLACEMENT_LABEL[myResult.placement]} box!`
            : myResult?.boxesHeld?.length
              ? "Your box(es) came up empty."
              : "You didn't end up holding any box."}
        </p>
        <div style={{ display: "grid", gap: 6 }}>
          {["first", "second", "third"].map((place) => {
            const boxId = state.prizeBoxIds[place];
            const holderId = state.finalHoldings[boxId];
            return (
              <div key={place} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 6, padding: "8px 12px" }}>
                <span style={{ fontSize: 13, color: "#f5f0ff" }}>{PLACEMENT_LABEL[place]}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#00ff9d" }}>{byName(holderId)}</span>
              </div>
            );
          })}
        </div>
      </Card>
    );
  }

  // ─── Round 1 ───
  if (state.phase === "round1") {
    const iHaveGifted = !!state.round1Gifts[player.id];
    if (iHaveGifted) {
      const stillWaitingOn = state.participantIds.filter((id) => !state.round1Gifts[id]).length;
      return (
        <Card style={{ marginBottom: 20, textAlign: "center" }}>
          <h3 style={{ color: "#ff2d95", margin: "0 0 8px", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>⚱️ Pandora's Boxes</h3>
          <p style={{ color: "#a68fd6", fontSize: 13, margin: 0 }}>
            Box given away. Waiting on {stillWaitingOn} more player{stillWaitingOn === 1 ? "" : "s"} before round 2 opens up.
          </p>
        </Card>
      );
    }

    const others = state.participantIds.filter((id) => id !== player.id);
    return (
      <Card style={{ marginBottom: 20 }}>
        <h3 style={{ color: "#ff2d95", margin: "0 0 4px", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif", textAlign: "center" }}>⚱️ Pandora's Boxes</h3>
        <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 12px", textAlign: "center" }}>
          You're holding a sealed box — nobody knows what's inside, not even you. Give it away to someone else; whatever comes back to you next round has to move on again.
        </p>
        {round1Choice ? (
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: 13, color: "#f5f0ff", margin: "0 0 10px" }}>Give your box to <strong>{byName(round1Choice)}</strong>?</p>
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <button
                onClick={() => submitRound1Gift(gameId, round.round, player.id, round1Choice)}
                style={{ padding: "10px 20px", borderRadius: 8, cursor: "pointer", background: "linear-gradient(135deg, #ff2d95, #b829ff)", border: "none", color: "#05010f", fontSize: 13, fontWeight: 700 }}
              >
                Confirm — Can't Undo
              </button>
              <button onClick={() => setRound1Choice(null)} style={{ background: "none", border: "1px solid #3d1f5c", borderRadius: 8, color: "#a68fd6", fontSize: 13, cursor: "pointer", padding: "10px 16px" }}>
                ← back
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6 }}>
            {others.map((id) => (
              <button key={id} onClick={() => setRound1Choice(id)} style={{
                padding: "10px 8px", borderRadius: 8, cursor: "pointer", background: "#0d0618",
                border: "2px solid #3d1f5c", color: "#f5f0ff", fontSize: 13, fontWeight: 700,
              }}>{byName(id)}</button>
            ))}
          </div>
        )}
      </Card>
    );
  }

  // ─── Round 2 ───
  const myBoxes = state.round1Holdings?.[player.id] || [];
  const iHaveLockedInRound2 = !!state.round2LockedInAt[player.id];

  if (myBoxes.length === 0) {
    const requiredHolders = state.participantIds.filter((id) => (state.round1Holdings[id] || []).length > 0);
    const stillWaitingOn = requiredHolders.filter((id) => !state.round2LockedInAt[id]).length;
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <h3 style={{ color: "#ff2d95", margin: "0 0 8px", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>⚱️ Pandora's Boxes</h3>
        <p style={{ color: "#a68fd6", fontSize: 13, margin: 0 }}>
          Nobody gave you a box this round — nothing for you to do. Waiting on {stillWaitingOn} more player{stillWaitingOn === 1 ? "" : "s"} before the reveal.
        </p>
      </Card>
    );
  }

  if (iHaveLockedInRound2) {
    const requiredHolders = state.participantIds.filter((id) => (state.round1Holdings[id] || []).length > 0);
    const stillWaitingOn = requiredHolders.filter((id) => !state.round2LockedInAt[id]).length;
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <h3 style={{ color: "#ff2d95", margin: "0 0 8px", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>⚱️ Pandora's Boxes</h3>
        <p style={{ color: "#a68fd6", fontSize: 13, margin: 0 }}>
          Box{myBoxes.length === 1 ? "" : "es"} given away again. Waiting on {stillWaitingOn} more player{stillWaitingOn === 1 ? "" : "s"} before every box opens.
        </p>
      </Card>
    );
  }

  const remainingBoxes = myBoxes.filter((boxId) => !round2Draft[boxId]);
  const allAssigned = remainingBoxes.length === 0;

  return (
    <Card style={{ marginBottom: 20 }}>
      <h3 style={{ color: "#ff2d95", margin: "0 0 4px", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif", textAlign: "center" }}>⚱️ Pandora's Boxes</h3>
      <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 12px", textAlign: "center" }}>
        You're holding {myBoxes.length} box{myBoxes.length === 1 ? "" : "es"} from round 1 — each has to move on to someone new, but never back to whoever gave it to you.
      </p>

      {Object.keys(round2Draft).length > 0 && (
        <div style={{ display: "grid", gap: 6, marginBottom: 14 }}>
          {myBoxes.filter((boxId) => round2Draft[boxId]).map((boxId) => (
            <div key={boxId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 6, padding: "6px 10px" }}>
              <span style={{ fontSize: 12, color: "#f5f0ff" }}>Box from {byName(boxId)} → {byName(round2Draft[boxId])}</span>
              <button onClick={() => setRound2Draft((d) => { const next = { ...d }; delete next[boxId]; return next; })} style={{ background: "none", border: "none", color: "#ff3860", fontSize: 12, cursor: "pointer" }}>✕</button>
            </div>
          ))}
        </div>
      )}

      {!allAssigned && (
        pickingBoxId ? (
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: 13, color: "#f5f0ff", margin: "0 0 10px" }}>Give the box from <strong>{byName(pickingBoxId)}</strong> to:</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6, marginBottom: 8 }}>
              {state.participantIds.filter((id) => id !== player.id && id !== pickingBoxId).map((id) => (
                <button key={id} onClick={() => { setRound2Draft((d) => ({ ...d, [pickingBoxId]: id })); setPickingBoxId(null); }} style={{
                  padding: "10px 8px", borderRadius: 8, cursor: "pointer", background: "#0d0618",
                  border: "2px solid #3d1f5c", color: "#f5f0ff", fontSize: 13, fontWeight: 700,
                }}>{byName(id)}</button>
              ))}
            </div>
            <button onClick={() => setPickingBoxId(null)} style={{ background: "none", border: "none", color: "#6b4f99", fontSize: 11, cursor: "pointer" }}>← back</button>
          </div>
        ) : (
          <div>
            <p style={{ fontSize: 12, color: "#a68fd6", margin: "0 0 8px" }}>Assign next box:</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6 }}>
              {remainingBoxes.map((boxId) => (
                <button key={boxId} onClick={() => setPickingBoxId(boxId)} style={{
                  padding: "10px 8px", borderRadius: 8, cursor: "pointer", background: "#0d0618",
                  border: "2px solid #3d1f5c", color: "#f5f0ff", fontSize: 13, fontWeight: 700,
                }}>Box from {byName(boxId)}</button>
              ))}
            </div>
          </div>
        )
      )}

      {allAssigned && (
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: 12, color: "#ff3860", margin: "0 0 10px", fontStyle: "italic" }}>
            Once you lock in, these can't be changed.
          </p>
          <button
            onClick={() => submitRound2Gifts(gameId, round.round, player.id, round2Draft)}
            style={{ padding: "12px 28px", borderRadius: 8, cursor: "pointer", background: "linear-gradient(135deg, #ff2d95, #b829ff)", border: "none", color: "#05010f", fontSize: 14, fontWeight: 700 }}
          >
            Lock In & Give Away
          </button>
        </div>
      )}
    </Card>
  );
}
