import { useState, useEffect, useRef } from "react";
import { Card, Badge, Btn } from "../ui";
import GameResultCard from "./GameResultCard";
import { reportScore } from "../../lib/challengeScores";
import { subscribeCrowns, proposeTrade, respondToTrade, cancelTrade, tickCrowns, placementValue } from "../../lib/games/crownsData";

// ─── Crowns (and Crowns — Big Screen) ───
// Mechanically identical for both game types — same shared crown deal,
// same open trade floor, same win conditions (see lib/games/
// crownsData.js for the full mechanic and reasoning) — so this one
// component is reused for both "crowns" and "crownstv" (same "one
// underlying mechanic, one phone component for both game types"
// convention as components/games/LifesTapestryPlayer.jsx). The ONLY
// difference the Big Screen variant adds is a shared TV view of the
// same live state (components/bigscreen/CrownsTvDisplay.jsx) — nothing
// here needs to branch on challenge.gameType at all, since holdings are
// already always fully visible to every player on their own phone
// either way.
export default function CrownsPlayer({ gameId, round, challenge, player, players }) {
  const [state, setState] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const reportedFinalRef = useRef(false);
  const [targetId, setTargetId] = useState("");
  const [offeredCrownId, setOfferedCrownId] = useState("");
  const [requestedCrownId, setRequestedCrownId] = useState(""); // "" = gift (no crown requested back)
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    const unsubscribe = subscribeCrowns(gameId, round.round, (v) => { setState(v); setLoaded(true); });
    return unsubscribe;
  }, [gameId, round.round]);

  const byName = (id) => players?.find((p) => p.id === id)?.display_name || "?";
  const crownById = (id) => state?.crownDefs?.find((c) => c.id === id);

  // Belt-and-suspenders tick, same reasoning as every other shared timed
  // battle here (see e.g. goldenFleeceData.js's own header on
  // tickGoldenFleece) — trades themselves are entirely player-driven and
  // resolve instantly on accept, this only ever matters for catching the
  // outer timer running out while nobody's phone happens to be open.
  useEffect(() => {
    if (!state || state.gameEnded || !challenge?.endsAt) return;
    const id = setInterval(() => tickCrowns(gameId, round.round, challenge.endsAt), 1000);
    return () => clearInterval(id);
  }, [gameId, round.round, state?.gameEnded, challenge?.endsAt]); // eslint-disable-line react-hooks/exhaustive-deps

  // Interim reports while play is live (so a straggler timing out
  // doesn't flatten anyone's progress — see lib/roundEngine.js's own
  // comment on why chains/pandorasboxes needed this) plus the final,
  // locked report the moment the battle actually ends.
  useEffect(() => {
    if (!state || state.degenerate) return;
    reportScore(gameId, round.round, player.id, player.name, placementValue(state, player.id), { final: false });
  }, [state?.holdings, state?.winnerId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!state || !state.gameEnded || reportedFinalRef.current) return;
    reportedFinalRef.current = true;
    reportScore(gameId, round.round, player.id, player.name, placementValue(state, player.id), { final: true });
  }, [state?.gameEnded]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!challenge?.active) return null;
  if (state === null && !loaded) {
    return <Card style={{ marginBottom: 20, textAlign: "center" }}><p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic" }}>Loading...</p></Card>;
  }
  if (state === null && loaded) {
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <div style={{ fontSize: 28, marginBottom: 6 }}>👑</div>
        <div style={{ fontSize: 12, letterSpacing: 4, textTransform: "uppercase", color: "#00ff9d" }}>Not Enough Players</div>
        <p style={{ color: "#6b4f99", fontSize: 12, marginTop: 10, fontStyle: "italic" }}>Crowns needs at least 2 players.</p>
      </Card>
    );
  }

  const myCount = state.holdings?.[player.id]?.length || 0;
  const myEverHeld = state.everHeld?.[player.id] || [];

  if (state.degenerate) {
    return <GameResultCard icon="👑" title="No One To Trade With" valueLabel={`${myEverHeld.length} crown${myEverHeld.length === 1 ? "" : "s"}`} />;
  }

  if (state.gameEnded) {
    const ranking = [...state.participantIds].sort((a, b) => placementValue(state, b) - placementValue(state, a));
    const title = state.endReason === "fullset"
      ? (state.winnerId === player.id ? "You Completed Your Checklist!" : `${byName(state.winnerId)} Completed Their Checklist!`)
      : "Time's Up — Most Crowns Ever Collected Wins";
    return (
      <Card style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 28, textAlign: "center", marginBottom: 6 }}>👑</div>
        <div style={{ fontSize: 12, letterSpacing: 4, textTransform: "uppercase", color: "#00ff9d", textAlign: "center", marginBottom: 6 }}>{title}</div>
        <p style={{ color: "#ff2d95", fontSize: 20, fontWeight: 700, textAlign: "center", fontFamily: "'Courier New', Courier, monospace", margin: "0 0 16px" }}>
          You collected {myEverHeld.length} of {state.totalCrowns}
        </p>
        <div style={{ display: "grid", gap: 6 }}>
          {ranking.map((id, i) => (
            <div key={id} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              background: id === player.id ? "rgba(255,45,149,0.12)" : "#0d0618",
              border: `1px solid ${id === player.id ? "#ff2d95" : "#3d1f5c"}`, borderRadius: 6, padding: "8px 12px",
            }}>
              <span style={{ fontSize: 13, color: "#f5f0ff" }}>{i === 0 ? "👑 " : ""}{byName(id)}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#00ff9d" }}>{state.everHeld?.[id]?.length || 0}/{state.totalCrowns} collected</span>
            </div>
          ))}
        </div>
      </Card>
    );
  }

  const others = state.participantIds.filter((id) => id !== player.id);
  const myCrowns = state.holdings[player.id] || [];
  const targetCrowns = targetId ? (state.holdings[targetId] || []) : [];
  const incoming = state.proposals.filter((p) => p.toPlayerId === player.id && p.status === "pending");
  const outgoing = state.proposals.filter((p) => p.fromPlayerId === player.id && p.status === "pending");
  const recentTrades = state.tradeLog.slice(-8).reverse();

  const canSend = targetId && offeredCrownId && myCrowns.includes(offeredCrownId);

  const send = async () => {
    if (!canSend) return;
    await proposeTrade(gameId, round.round, player.id, targetId, offeredCrownId, requestedCrownId || null);
    setFeedback(`Proposal sent to ${byName(targetId)}.`);
    setOfferedCrownId("");
    setRequestedCrownId("");
    window.setTimeout(() => setFeedback(""), 2500);
  };

  const crownChip = (crownId, key) => {
    const c = crownById(crownId);
    if (!c) return null;
    return (
      <span key={key} style={{
        display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, padding: "3px 8px 3px 4px", borderRadius: 8,
        background: `${c.color}22`, border: `1px solid ${c.color}`, color: "#f5f0ff", margin: "2px 3px 2px 0",
      }}>
        <img src={c.dataUri} alt="" width={16} height={16} style={{ display: "block" }} />
        {c.name}
      </span>
    );
  };

  // Inline "icon + name" for a crown reference inside a sentence
  // (proposals, activity feed) — replaces the old bare emoji.
  const crownInline = (crownId) => {
    const c = crownById(crownId);
    if (!c) return null;
    return <><img src={c.dataUri} alt="" width={13} height={13} style={{ verticalAlign: "-2px" }} /> {c.name}</>;
  };

  // A small collected/not-yet grid of EVERY crown in the set, against
  // this player's own everHeld checklist — the win-relevant view, kept
  // visually distinct from the plain current-holdings chips above.
  const checklistGrid = (everHeldIds) => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {(state.crownDefs || []).map((c) => {
        const got = everHeldIds.includes(c.id);
        return (
          <div key={c.id} title={c.name} style={{
            position: "relative", width: 30, height: 30, borderRadius: 6,
            background: got ? `${c.color}33` : "#0d0618",
            border: `1px solid ${got ? c.color : "#3d1f5c"}`,
            opacity: got ? 1 : 0.35,
          }}>
            <img src={c.dataUri} alt={c.name} width={28} height={28} style={{ display: "block" }} />
            {got && (
              <span style={{
                position: "absolute", top: -4, right: -4, fontSize: 10, lineHeight: 1,
                background: "#00ff9d", color: "#0d0618", borderRadius: "50%", width: 13, height: 13,
                display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900,
              }}>✓</span>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <Card style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>👑 Crowns</h3>
        <Badge>{myEverHeld.length}/{state.totalCrowns} collected</Badge>
      </div>
      <p style={{ color: "#6b4f99", fontSize: 11, margin: "0 0 12px", fontStyle: "italic" }}>
        Everyone's holdings are always visible. Propose a direct 1-for-1 swap to anyone, or gift a crown outright. Winning is a CHECKLIST — you only need to have held a crown at some point, not still be holding it — so any trade that brings you a crown you've never touched checks it off for good, even if you trade it onward later.
      </p>

      {/* ─── Your checklist: what actually wins the game ─── */}
      <div style={{ marginBottom: 12 }}>
        <p style={{ color: "#a68fd6", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, margin: "0 0 4px" }}>
          Your checklist — {myEverHeld.length} of {state.totalCrowns} ever collected
          {myEverHeld.length < state.totalCrowns && (
            <span style={{ color: "#6b4f99", textTransform: "none", letterSpacing: 0 }}>
              {" "}({state.totalCrowns - myEverHeld.length} still needed)
            </span>
          )}
        </p>
        {checklistGrid(myEverHeld)}
      </div>

      <div style={{ marginBottom: 10 }}>
        <p style={{ color: "#a68fd6", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, margin: "0 0 4px" }}>Your crowns right now (tradeable)</p>
        <div>{myCrowns.length === 0 ? <span style={{ color: "#6b4f99", fontSize: 12, fontStyle: "italic" }}>None right now.</span> : myCrowns.map((id) => crownChip(id, id))}</div>
      </div>

      {/* ─── Roster: every player's current holdings AND checklist progress, fully transparent ─── */}
      <div style={{ marginBottom: 14 }}>
        <p style={{ color: "#a68fd6", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, margin: "0 0 6px" }}>Everyone's holdings &amp; checklist progress</p>
        <div style={{ display: "grid", gap: 6 }}>
          {state.participantIds.map((id) => (
            <div key={id} style={{ background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 6, padding: "6px 10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: id === player.id ? "#ff2d95" : "#f5f0ff", marginBottom: 3 }}>
                <span>{id === player.id ? "You" : byName(id)}</span>
                <span style={{ color: "#00ff9d", fontWeight: 700 }}>{state.everHeld?.[id]?.length || 0}/{state.totalCrowns} collected</span>
              </div>
              <div style={{ fontSize: 10, color: "#6b4f99", marginBottom: 3 }}>Holding now: {state.holdings[id]?.length || 0}</div>
              <div>{(state.holdings[id] || []).map((cid) => crownChip(cid, `${id}-${cid}`))}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Propose a trade ─── */}
      <div style={{ background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 8, padding: 12, marginBottom: 14 }}>
        <p style={{ color: "#a68fd6", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, margin: "0 0 8px" }}>Propose a trade</p>

        <label style={{ display: "block", color: "#6b4f99", fontSize: 11, marginBottom: 3 }}>Trade with</label>
        <select value={targetId} onChange={(e) => { setTargetId(e.target.value); setRequestedCrownId(""); }} style={selectStyle}>
          <option value="">Choose a player...</option>
          {others.map((id) => <option key={id} value={id}>{byName(id)}</option>)}
        </select>

        <label style={{ display: "block", color: "#6b4f99", fontSize: 11, margin: "8px 0 3px" }}>Your crown to offer</label>
        <select value={offeredCrownId} onChange={(e) => setOfferedCrownId(e.target.value)} style={selectStyle} disabled={myCrowns.length === 0}>
          <option value="">Choose a crown...</option>
          {myCrowns.map((id) => <option key={id} value={id}>{crownById(id)?.name}</option>)}
        </select>

        <label style={{ display: "block", color: "#6b4f99", fontSize: 11, margin: "8px 0 3px" }}>In return</label>
        <select value={requestedCrownId} onChange={(e) => setRequestedCrownId(e.target.value)} style={selectStyle} disabled={!targetId}>
          <option value="">🎁 Nothing — gift it outright</option>
          {targetCrowns.map((id) => <option key={id} value={id}>{crownById(id)?.name}</option>)}
        </select>

        <div style={{ marginTop: 10, textAlign: "center" }}>
          <Btn onClick={send} disabled={!canSend}>Propose Trade</Btn>
        </div>
        {feedback && <p style={{ color: "#00ff9d", fontSize: 11, textAlign: "center", margin: "8px 0 0" }}>{feedback}</p>}
      </div>

      {/* ─── Incoming proposals ─── */}
      {incoming.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <p style={{ color: "#a68fd6", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, margin: "0 0 6px" }}>Offers to you ({incoming.length})</p>
          <div style={{ display: "grid", gap: 6 }}>
            {incoming.map((p) => {
              const gift = p.requestedCrownId == null;
              return (
                <div key={p.id} style={{ background: "rgba(255,179,71,0.08)", border: "1px solid #ffb347", borderRadius: 6, padding: "8px 10px" }}>
                  <p style={{ fontSize: 12, color: "#f5f0ff", margin: "0 0 6px" }}>
                    {byName(p.fromPlayerId)} offers {crownInline(p.offeredCrownId)}
                    {gift ? " — a gift, nothing requested back." : <> for your {crownInline(p.requestedCrownId)}</>}
                  </p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Btn small onClick={() => respondToTrade(gameId, round.round, p.id, player.id, true)}>✅ Accept</Btn>
                    <Btn small variant="ghost" onClick={() => respondToTrade(gameId, round.round, p.id, player.id, false)}>❌ Decline</Btn>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Outgoing proposals ─── */}
      {outgoing.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <p style={{ color: "#a68fd6", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, margin: "0 0 6px" }}>Your pending offers ({outgoing.length})</p>
          <div style={{ display: "grid", gap: 6 }}>
            {outgoing.map((p) => (
              <div key={p.id} style={{ background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 6, padding: "8px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "#a68fd6" }}>
                  To {byName(p.toPlayerId)}: your {crownInline(p.offeredCrownId)}
                  {p.requestedCrownId == null ? " (gift)" : <> for their {crownInline(p.requestedCrownId)}</>}
                </span>
                <Btn small variant="ghost" onClick={() => cancelTrade(gameId, round.round, p.id, player.id)}>Withdraw</Btn>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Activity feed ─── */}
      <div>
        <p style={{ color: "#a68fd6", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, margin: "0 0 6px" }}>Recent trades</p>
        {recentTrades.length === 0 ? (
          <p style={{ color: "#6b4f99", fontSize: 12, fontStyle: "italic" }}>No trades yet — propose one above.</p>
        ) : (
          <div style={{ display: "grid", gap: 4 }}>
            {recentTrades.map((t, i) => (
              <p key={i} style={{ fontSize: 11, color: "#6b4f99", margin: 0 }}>
                {t.gift
                  ? <>🎁 {byName(t.fromId)} gifted {crownInline(t.offeredCrownId)} to {byName(t.toId)}</>
                  : <>🔁 {byName(t.fromId)} ⇄ {byName(t.toId)}: {crownInline(t.offeredCrownId)} for {crownInline(t.requestedCrownId)}</>}
              </p>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

const selectStyle = {
  width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #3d1f5c",
  background: "#1c1030", color: "#f5f0ff", fontSize: 12,
};
