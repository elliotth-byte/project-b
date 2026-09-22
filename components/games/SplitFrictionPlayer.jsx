import { useState, useEffect, useRef } from "react";
import { Card, Badge, Btn } from "../ui";
import { reportScore } from "../../lib/challengeScores";
import {
  subscribeSplitFriction, submitOffer, lockOffers, submitDecision, lockDecisions,
  tickSplitFriction, placementValue,
} from "../../lib/games/splitFrictionData";

// ─── Split Friction ───
// See lib/games/splitFrictionData.js for the full rules and the
// reasoning behind every design choice here — this file is purely
// presentation: an offer slider per other player for phase 1, an
// accept/reject list per received offer for phase 2, and a full
// personal recap at the end.
export default function SplitFrictionPlayer({ gameId, round, challenge, player, players }) {
  const [state, setState] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [draftAmounts, setDraftAmounts] = useState({}); // recipientId -> selfAmount, local slider positions before each is submitted
  const reportedRef = useRef(false);

  useEffect(() => {
    const unsubscribe = subscribeSplitFriction(gameId, round.round, (v) => { setState(v); setLoaded(true); });
    return unsubscribe;
  }, [gameId, round.round]);

  const byName = (id) => players?.find((p) => p.id === id)?.display_name || "?";

  // Same adaptive-poll reasoning as components/games/ArtAuctionPlayer.jsx
  // — this app's challenges range from live minutes to async hours, so a
  // flat fast interval would either feel sluggish or hammer the database
  // for no reason depending on which end you're on. No TV for this game
  // (see this file's own header), so this is the phone-poll half of the
  // two-way tick redundancy; lib/roundEngine.js's housekeeping pass is
  // the other half, covering the gap when nobody's phone is open.
  useEffect(() => {
    if (!state || (state.phase !== "offering" && state.phase !== "deciding")) return;
    let timeoutId;
    const tick = () => {
      tickSplitFriction(gameId, round.round);
      const deadline = state.phase === "offering" ? state.offeringEndsAt : state.decidingEndsAt;
      const msRemaining = Math.max(0, (deadline || 0) - Date.now());
      timeoutId = window.setTimeout(tick, Math.max(500, Math.min(15000, msRemaining / 8)));
    };
    tick();
    return () => window.clearTimeout(timeoutId);
  }, [gameId, round.round, state?.phase, state?.offeringEndsAt, state?.decidingEndsAt]); // eslint-disable-line react-hooks/exhaustive-deps

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
        <div style={{ fontSize: 28, marginBottom: 6 }}>⚔️</div>
        <div style={{ fontSize: 12, letterSpacing: 4, textTransform: "uppercase", color: "#00ff9d" }}>Not Enough Players</div>
        <p style={{ color: "#6b4f99", fontSize: 12, marginTop: 10, fontStyle: "italic" }}>Split Friction needs at least 2 players.</p>
      </Card>
    );
  }

  // ─── Revealed ───
  if (state.phase === "revealed") {
    const myResult = state.results?.[player.id] || { total: 0, sent: [], received: [] };
    const ranking = [...state.participantIds].sort((a, b) => placementValue(state, b) - placementValue(state, a));

    if (state.degenerate) {
      return (
        <Card style={{ marginBottom: 20, textAlign: "center" }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>⚔️</div>
          <div style={{ fontSize: 12, letterSpacing: 4, textTransform: "uppercase", color: "#00ff9d", marginBottom: 6 }}>Split Friction</div>
          <p style={{ color: "#a68fd6", fontSize: 13, margin: 0 }}>No other player left alive to negotiate with — nothing to split.</p>
        </Card>
      );
    }

    return (
      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>⚔️ Split Friction — Settled</h3>
          <Badge>{myResult.total} pt{myResult.total === 1 ? "" : "s"}</Badge>
        </div>
        {state.timedOut && (
          <p style={{ color: "#a68fd6", fontSize: 11, margin: "0 0 10px", fontStyle: "italic" }}>Time ran out — every remaining offer/decision settled with its default.</p>
        )}

        <div style={{ display: "grid", gap: 6, marginBottom: 16 }}>
          {ranking.map((id) => (
            <div key={id} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              background: id === player.id ? "rgba(255,45,149,0.12)" : "#0d0618",
              border: `1px solid ${id === player.id ? "#ff2d95" : "#3d1f5c"}`, borderRadius: 6, padding: "8px 12px",
            }}>
              <span style={{ fontSize: 13, color: "#f5f0ff" }}>{byName(id)}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#00ff9d" }}>{placementValue(state, id)} pts</span>
            </div>
          ))}
        </div>

        <h4 style={{ color: "#a68fd6", fontSize: 11, letterSpacing: 2, textTransform: "uppercase", margin: "0 0 8px" }}>Offers You Sent</h4>
        <div style={{ display: "grid", gap: 6, marginBottom: 14 }}>
          {myResult.sent.map((o) => (
            <div key={o.to} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 6, padding: "6px 10px" }}>
              <span style={{ fontSize: 12, color: "#f5f0ff" }}>{byName(o.to)}: you keep {o.kept}, offer {o.offered}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: o.accepted ? "#00ff9d" : "#ff3860" }}>{o.accepted ? `Accepted (+${o.kept})` : "Rejected"}</span>
            </div>
          ))}
        </div>

        <h4 style={{ color: "#a68fd6", fontSize: 11, letterSpacing: 2, textTransform: "uppercase", margin: "0 0 8px" }}>Offers You Received</h4>
        <div style={{ display: "grid", gap: 6 }}>
          {myResult.received.map((o) => (
            <div key={o.from} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 6, padding: "6px 10px" }}>
              <span style={{ fontSize: 12, color: "#f5f0ff" }}>{byName(o.from)} offered you {o.offered} (kept {o.kept})</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: o.accepted ? "#00ff9d" : "#ff3860" }}>{o.accepted ? `You accepted (+${o.offered})` : "You rejected"}</span>
            </div>
          ))}
        </div>
      </Card>
    );
  }

  // ─── Offering ───
  if (state.phase === "offering") {
    const iHaveLocked = !!state.offersLockedAt[player.id];
    if (iHaveLocked) {
      const stillWaitingOn = state.participantIds.filter((id) => !state.offersLockedAt[id]).length;
      return (
        <Card style={{ marginBottom: 20, textAlign: "center" }}>
          <h3 style={{ color: "#ff2d95", margin: "0 0 8px", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>⚔️ Split Friction</h3>
          <p style={{ color: "#a68fd6", fontSize: 13, margin: 0 }}>
            All your offers are locked in. Waiting on {stillWaitingOn} more player{stillWaitingOn === 1 ? "" : "s"} (or the timer) before decisions open.
          </p>
        </Card>
      );
    }

    const others = state.participantIds.filter((id) => id !== player.id);
    const myOffers = state.offers[player.id] || {};
    const allSet = others.every((id) => Number.isInteger(myOffers[id]));

    return (
      <Card style={{ marginBottom: 20 }}>
        <h3 style={{ color: "#ff2d95", margin: "0 0 4px", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif", textAlign: "center" }}>⚔️ Split Friction</h3>
        <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 14px", textAlign: "center" }}>
          Propose a split of 100 points to every other player — how much you keep, and how much they're offered. Each split is completely independent, and nobody sees any of this until every last decision is in.
        </p>
        <div style={{ display: "grid", gap: 14 }}>
          {others.map((id) => {
            const submitted = myOffers[id];
            const draft = draftAmounts[id] ?? submitted ?? 50;
            const isLocked = Number.isInteger(submitted);
            return (
              <div key={id} style={{ background: "#0d0618", border: `1px solid ${isLocked ? "#00ff9d" : "#3d1f5c"}`, borderRadius: 8, padding: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#f5f0ff" }}>{byName(id)}</span>
                  {isLocked && <span style={{ fontSize: 10, color: "#00ff9d", textTransform: "uppercase", letterSpacing: 1 }}>Set</span>}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#a68fd6", marginBottom: 4 }}>
                  <span>You keep: <strong style={{ color: "#ff2d95" }}>{draft}</strong></span>
                  <span>They get: <strong style={{ color: "#00d9ff" }}>{100 - draft}</strong></span>
                </div>
                <input
                  type="range" min={0} max={100} step={1} value={draft}
                  onChange={(e) => setDraftAmounts((d) => ({ ...d, [id]: parseInt(e.target.value, 10) }))}
                  style={{ width: "100%" }}
                />
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
                  <Btn small variant={isLocked && submitted === draft ? "ghost" : "primary"} onClick={() => submitOffer(gameId, round.round, player.id, id, draft)} disabled={isLocked && submitted === draft}>
                    {isLocked ? "Update Offer" : "Set Offer"}
                  </Btn>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ textAlign: "center", marginTop: 16 }}>
          {!allSet && <p style={{ color: "#6b4f99", fontSize: 11, margin: "0 0 8px", fontStyle: "italic" }}>Set an offer for everyone above before locking in.</p>}
          {allSet && <p style={{ color: "#ff3860", fontSize: 12, margin: "0 0 10px", fontStyle: "italic" }}>Once you lock in, none of these can be changed.</p>}
          <Btn onClick={() => lockOffers(gameId, round.round, player.id)} disabled={!allSet}>Lock In All My Offers</Btn>
        </div>
      </Card>
    );
  }

  // ─── Deciding ───
  const iHaveLockedDecisions = !!state.decisionsLockedAt[player.id];
  const others = state.participantIds.filter((id) => id !== player.id);
  const myDecisions = state.decisions[player.id] || {};

  if (iHaveLockedDecisions) {
    const stillWaitingOn = state.participantIds.filter((id) => !state.decisionsLockedAt[id]).length;
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <h3 style={{ color: "#ff2d95", margin: "0 0 8px", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>⚔️ Split Friction</h3>
        <p style={{ color: "#a68fd6", fontSize: 13, margin: 0 }}>
          All your decisions are locked in. Waiting on {stillWaitingOn} more player{stillWaitingOn === 1 ? "" : "s"} (or the timer) before everything settles.
        </p>
      </Card>
    );
  }

  const allDecided = others.every((id) => myDecisions[id] === "accept" || myDecisions[id] === "reject");

  return (
    <Card style={{ marginBottom: 20 }}>
      <h3 style={{ color: "#ff2d95", margin: "0 0 4px", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif", textAlign: "center" }}>⚔️ Split Friction</h3>
      <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 14px", textAlign: "center" }}>
        Here's what each other player offered you. Decide each one on its own — accepting or rejecting one has no effect on any of the others.
      </p>
      <div style={{ display: "grid", gap: 10 }}>
        {others.map((id) => {
          const kept = state.offers[id]?.[player.id] ?? 50;
          const offered = 100 - kept;
          const decision = myDecisions[id];
          return (
            <div key={id} style={{ background: "#0d0618", border: `1px solid ${decision ? "#00ff9d" : "#3d1f5c"}`, borderRadius: 8, padding: 10 }}>
              <p style={{ margin: "0 0 8px", fontSize: 13, color: "#f5f0ff" }}>
                <strong>{byName(id)}</strong> keeps {kept}, offers you <strong style={{ color: "#00d9ff" }}>{offered}</strong>.
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <Btn small variant={decision === "accept" ? "success" : "ghost"} onClick={() => submitDecision(gameId, round.round, player.id, id, "accept")} style={{ flex: 1 }}>
                  Accept
                </Btn>
                <Btn small variant={decision === "reject" ? "danger" : "ghost"} onClick={() => submitDecision(gameId, round.round, player.id, id, "reject")} style={{ flex: 1 }}>
                  Reject
                </Btn>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ textAlign: "center", marginTop: 16 }}>
        {!allDecided && <p style={{ color: "#6b4f99", fontSize: 11, margin: "0 0 8px", fontStyle: "italic" }}>Decide every offer above before locking in.</p>}
        {allDecided && <p style={{ color: "#ff3860", fontSize: 12, margin: "0 0 10px", fontStyle: "italic" }}>Once you lock in, none of these can be changed. Nobody — including whoever sent these — will see your decisions until everyone's locked in.</p>}
        <Btn onClick={() => lockDecisions(gameId, round.round, player.id)} disabled={!allDecided}>Lock In All My Decisions</Btn>
      </div>
    </Card>
  );
}
