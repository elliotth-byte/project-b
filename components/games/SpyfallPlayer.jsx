import { useState, useEffect, useRef } from "react";
import { Card, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { reportScore } from "../../lib/challengeScores";
import {
  subscribeSpyfall, submitAccusation, submitAccusationVote, submitSpyGuess, tickSpyfall, placementValue,
  SPYFALL_LOCATIONS, SPYFALL_ROUND_TIMER_SEC,
} from "../../lib/games/spyfallData";

// ─── Spyfall (played live, in person) ───
// https://boardgamegeek.com/boardgame/166384/spyfall — the actual
// conversation happens out loud in the room; this screen only shows
// each player their own secret (their location, or that they're the
// spy), the live countdown, and the accuse/vote/guess controls. See
// lib/games/spyfallData.js's own header comment for the full rule set
// and the deliberate simplifications from the tabletop original.
export default function SpyfallPlayer({ gameId, round, challenge, player, players }) {
  const [state, setState] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [accuseTarget, setAccuseTarget] = useState(null);
  const [guessing, setGuessing] = useState(false);
  const reportedRef = useRef(false);

  useEffect(() => subscribeSpyfall(gameId, round.round, setState), [gameId, round.round]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Same belt-and-suspenders poll as every other timed shared state in
  // this app — resolves a stalled accusation vote (see
  // lib/games/spyfallData.js's own spyfallTransition) even if the
  // server-side housekeeping mirror in lib/roundEngine.js hasn't run
  // yet.
  useEffect(() => {
    const id = setInterval(() => tickSpyfall(gameId, round.round), 1000);
    return () => clearInterval(id);
  }, [gameId, round.round]);

  useEffect(() => {
    if (!state) return;
    reportScore(gameId, round.round, player.id, player.name, placementValue(state, player.id), { final: false });
  }, [state?.eliminatedOrder?.length, state?.ended]); // eslint-disable-line react-hooks/exhaustive-deps

  const iAmIn = state?.remainingPool?.includes(player.id);
  useEffect(() => {
    const gameOver = !challenge?.active || (state && !iAmIn);
    if (gameOver && state && !reportedRef.current) {
      reportedRef.current = true;
      reportScore(gameId, round.round, player.id, player.name, placementValue(state, player.id), { final: true });
    }
  }, [challenge?.active, state, iAmIn]); // eslint-disable-line react-hooks/exhaustive-deps

  const byId = {};
  (players || []).forEach((p) => (byId[p.id] = p.display_name));

  if (!challenge?.active) {
    const myValue = state ? placementValue(state, player.id) : 0;
    return <GameResultCard icon="🕵️" title="Spyfall" valueLabel={myValue >= 100000 ? "One of the last 3 standing!" : "Eliminated"} />;
  }
  if (!state) return <Card style={{ marginBottom: 20, textAlign: "center" }}><p style={{ color: "#6b4f99", fontStyle: "italic" }}>Loading...</p></Card>;

  if (state.ended) {
    const won = state.winnerIds.includes(player.id);
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <div style={{ fontSize: 28, marginBottom: 6 }}>🕵️</div>
        <div style={{ fontSize: 12, letterSpacing: 4, textTransform: "uppercase", color: "#00ff9d", marginBottom: 10 }}>Spyfall — Game Over</div>
        <p style={{ color: won ? "#00ff9d" : "#6b4f99", fontSize: 15, fontWeight: 700 }}>
          {won ? "You're one of the last three standing!" : "You were eliminated earlier."}
        </p>
        <div style={{ marginTop: 14, display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          {state.winnerIds.map((id) => (
            <div key={id} style={{ fontSize: 13, padding: "6px 14px", borderRadius: 8, background: "#0d0618", border: "1px solid #c9a84c", color: "#c9a84c" }}>
              👑 {byId[id] || "?"}
            </div>
          ))}
        </div>
      </Card>
    );
  }

  if (!iAmIn) {
    const remaining = state.remainingPool.map((id) => byId[id] || "?").join(", ");
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <div style={{ fontSize: 28, marginBottom: 6 }}>🕵️</div>
        <div style={{ fontSize: 12, letterSpacing: 4, textTransform: "uppercase", color: "#6b4f99", marginBottom: 10 }}>You're Out</div>
        <p style={{ color: "#a68fd6", fontSize: 13 }}>Still playing: {remaining}</p>
      </Card>
    );
  }

  const iAmSpy = state.spyId === player.id;
  const elapsedSec = Math.max(0, Math.floor((now - state.subRoundStartedAt) / 1000));
  const overtime = elapsedSec > SPYFALL_ROUND_TIMER_SEC;
  const timerLabel = overtime ? `+${elapsedSec - SPYFALL_ROUND_TIMER_SEC}s overtime` : `${SPYFALL_ROUND_TIMER_SEC - elapsedSec}s`;

  const accuse = (targetId) => { submitAccusation(gameId, round.round, player.id, targetId); setAccuseTarget(null); };
  const vote = (v) => submitAccusationVote(gameId, round.round, player.id, v);
  const guess = (location) => { submitSpyGuess(gameId, round.round, player.id, location); setGuessing(false); };

  const pending = state.pendingAccusation;
  const others = state.remainingPool.filter((id) => id !== player.id);

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🕵️ Spyfall</h3>
        <Badge color={overtime ? "#c9a84c" : "#00ff9d"}>{timerLabel}</Badge>
      </div>
      <p style={{ color: "#6b4f99", fontSize: 11, margin: "0 0 14px" }}>Round {state.subRound} — {state.remainingPool.length} still playing</p>

      {iAmSpy ? (
        <div style={{ background: "rgba(255,56,96,0.1)", border: "2px solid #ff3860", borderRadius: 10, padding: "16px 12px", marginBottom: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#ff3860", fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>YOU ARE THE SPY</div>
          <p style={{ color: "#a68fd6", fontSize: 12, marginTop: 6 }}>Blend in, ask vague questions, and figure out the location before someone figures out you.</p>
        </div>
      ) : (
        <div style={{ background: "rgba(0,255,157,0.08)", border: "2px solid #00ff9d", borderRadius: 10, padding: "16px 12px", marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Location</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: "#00ff9d", fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>{state.location}</div>
        </div>
      )}

      {pending ? (
        <PendingAccusationView pending={pending} player={player} byId={byId} onVote={vote} />
      ) : (
        <>
          {accuseTarget === null ? (
            <button onClick={() => setAccuseTarget("choosing")} style={btnStyle("#ff3860")}>🚨 Accuse Someone</button>
          ) : (
            <div style={{ display: "grid", gap: 8, marginBottom: 10 }}>
              <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 4px" }}>Who do you think is the spy?</p>
              {others.map((id) => (
                <button key={id} onClick={() => accuse(id)} style={btnStyle("#ff3860", true)}>{byId[id] || "?"}</button>
              ))}
              <button onClick={() => setAccuseTarget(null)} style={btnStyle("#6b4f99", true)}>Cancel</button>
            </div>
          )}

          {iAmSpy && (
            guessing ? (
              <div style={{ display: "grid", gap: 6, marginTop: 10, maxHeight: 260, overflowY: "auto" }}>
                <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 4px" }}>Guess the location:</p>
                {SPYFALL_LOCATIONS.map((loc) => (
                  <button key={loc} onClick={() => guess(loc)} style={btnStyle("#ffd700", true)}>{loc}</button>
                ))}
                <button onClick={() => setGuessing(false)} style={btnStyle("#6b4f99", true)}>Cancel</button>
              </div>
            ) : (
              <button onClick={() => setGuessing(true)} style={{ ...btnStyle("#ffd700"), marginTop: 10 }}>🎯 I'm the Spy — Guess the Location</button>
            )
          )}
        </>
      )}

      <div style={{ marginTop: 16, borderTop: "1px solid #3d1f5c", paddingTop: 12 }}>
        <div style={{ fontSize: 11, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Still in the game</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
          {state.remainingPool.map((id) => (
            <div key={id} style={{ fontSize: 12, padding: "3px 10px", borderRadius: 8, background: "#0d0618", border: `1px solid ${id === player.id ? "#ff2d95" : "#3d1f5c"}`, color: "#f5f0ff" }}>
              {byId[id] || "?"}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function btnStyle(color, ghost) {
  return {
    width: "100%", padding: ghost ? "10px 14px" : "14px 16px", borderRadius: 10, cursor: "pointer",
    background: ghost ? "#0d0618" : `${color}22`, border: `2px solid ${color}`, color,
    fontSize: ghost ? 13 : 15, fontWeight: 700, fontFamily: "'Orbitron', 'Segoe UI', sans-serif",
  };
}

function PendingAccusationView({ pending, player, byId, onVote }) {
  const isAccuser = pending.accuserId === player.id;
  const isAccused = pending.accusedId === player.id;
  const alreadyVoted = !!pending.votes[player.id];
  const voteCount = Object.keys(pending.votes).length;

  if (isAccused) {
    return (
      <div style={{ background: "rgba(255,56,96,0.12)", border: "2px solid #ff3860", borderRadius: 10, padding: "14px 12px" }}>
        <p style={{ color: "#ff3860", fontWeight: 700, fontSize: 14, margin: 0 }}>
          {byId[pending.accuserId] || "?"} has accused YOU of being the spy!
        </p>
        <p style={{ color: "#6b4f99", fontSize: 12, marginTop: 6 }}>Waiting on everyone else's verdict...</p>
      </div>
    );
  }
  if (isAccuser) {
    return (
      <div style={{ background: "#0d0618", border: "2px solid #ff3860", borderRadius: 10, padding: "14px 12px" }}>
        <p style={{ color: "#f5f0ff", fontSize: 14, margin: 0 }}>You accused <strong>{byId[pending.accusedId] || "?"}</strong>.</p>
        <p style={{ color: "#6b4f99", fontSize: 12, marginTop: 6 }}>{voteCount} vote{voteCount === 1 ? "" : "s"} in so far — waiting for consensus.</p>
      </div>
    );
  }
  if (alreadyVoted) {
    return (
      <div style={{ background: "#0d0618", border: "2px solid #3d1f5c", borderRadius: 10, padding: "14px 12px" }}>
        <p style={{ color: "#6b4f99", fontSize: 13, margin: 0 }}>Vote submitted — waiting on everyone else.</p>
      </div>
    );
  }
  return (
    <div style={{ background: "rgba(255,215,0,0.08)", border: "2px solid #ffd700", borderRadius: 10, padding: "14px 12px" }}>
      <p style={{ color: "#f5f0ff", fontSize: 14, margin: "0 0 10px" }}>
        {byId[pending.accuserId] || "?"} accuses <strong>{byId[pending.accusedId] || "?"}</strong> of being the spy. Agree?
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <button onClick={() => onVote("confirm")} style={btnStyle("#00ff9d", true)}>Confirm</button>
        <button onClick={() => onVote("reject")} style={btnStyle("#ff3860", true)}>Reject</button>
      </div>
    </div>
  );
}
