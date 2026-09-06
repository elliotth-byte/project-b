import { useState, useEffect, useRef } from "react";
import { Card, Badge } from "../ui";
import { reportScore } from "../../lib/challengeScores";
import {
  subscribeFloor,
  chooseFloorOpponent,
  beginFloorDuelIfNeeded,
  submitFloorDuelAnswer,
  autoChooseFloorOpponentIfDue,
  autoResolveFloorDuelIfDue,
  placementValue,
} from "../../lib/games/floorData";

export default function FloorPlayer({ gameId, round, challenge, player, players }) {
  const [state, setState] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [, forceTick] = useState(0);
  const reportedRef = useRef(false);
  const beganRef = useRef(false);

  useEffect(() => {
    const unsubscribe = subscribeFloor(gameId, round.round, (v) => { setState(v); setLoaded(true); });
    return unsubscribe;
  }, [gameId, round.round]);

  const byName = (id) => players?.find((p) => p.id === id)?.display_name || "?";

  // The moment THIS player's own screen actually shows the duel, mark
  // their own personal clock as started (see
  // lib/games/floorData.js's beginFloorDuelIfNeeded) — deliberately
  // NOT tied to when the duel itself was created, since the whole
  // point of this design is that the other duelist might not show up
  // for hours; this player's own fairness clock only ever measures
  // their own engagement. beganRef guards against re-firing on every
  // subsequent state update for the same duel (the call itself is
  // already a no-op past the first time, but there's no reason to hit
  // the database repeatedly for something that only matters once).
  useEffect(() => {
    beganRef.current = false;
  }, [state?.duelistIds?.[0], state?.duelistIds?.[1]]);

  useEffect(() => {
    if (!state || state.gamePhase !== "dueling" || beganRef.current) return;
    if (!state.duelistIds.includes(player.id)) return;
    if (state.duelProgress[player.id]?.startedAt) { beganRef.current = true; return; }
    beganRef.current = true;
    beginFloorDuelIfNeeded(gameId, round.round, player.id);
  }, [gameId, round.round, player.id, state?.gamePhase, state?.duelistIds, state?.duelProgress]); // eslint-disable-line react-hooks/exhaustive-deps

  // Same adaptive-poll reasoning as components/games/MusicalChairsPlayer.jsx
  // — this app's challenges range from live minutes to async hours, so a
  // flat fast interval would either feel sluggish or hammer the database
  // for no reason depending on which end you're on.
  useEffect(() => {
    if (!state || (state.gamePhase !== "choosing" && state.gamePhase !== "dueling")) return;
    let timeoutId;
    const tick = () => {
      forceTick((t) => t + 1);
      if (state.gamePhase === "choosing") autoChooseFloorOpponentIfDue(gameId, round.round);
      else autoResolveFloorDuelIfDue(gameId, round.round);
      const deadline = state.gamePhase === "choosing" ? state.choosingStartedAt : state.duelStartedAt;
      const msRemaining = Math.max(0, (deadline || 0) + state.actionTimeoutMs - Date.now());
      timeoutId = window.setTimeout(tick, Math.max(400, Math.min(30000, msRemaining / 10)));
    };
    tick();
    return () => window.clearTimeout(timeoutId);
  }, [gameId, round.round, state?.gamePhase, state?.choosingStartedAt, state?.duelStartedAt, state?.actionTimeoutMs]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!state || reportedRef.current) return;
    if (state.gamePhase === "revealed") {
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
        <div style={{ fontSize: 28, marginBottom: 6 }}>🏛️</div>
        <div style={{ fontSize: 12, letterSpacing: 4, textTransform: "uppercase", color: "#00ff9d" }}>Not Enough Players</div>
        <p style={{ color: "#6b4f99", fontSize: 12, marginTop: 10, fontStyle: "italic" }}>The Floor needs at least 2 players.</p>
      </Card>
    );
  }

  // A small live grid of who owns what — same shape every screen shows,
  // just with the current viewer's own square (if any) highlighted.
  const Grid = () => (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${state.gridCols}, 1fr)`, gap: 4, marginTop: 10, marginBottom: 10 }}>
      {state.cellOwnerOf.map((ownerId, i) => (
        <div key={i} style={{
          aspectRatio: "1", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 9, fontWeight: 700, textAlign: "center", padding: 2, overflow: "hidden",
          background: !ownerId ? "transparent" : ownerId === player.id ? "rgba(0,255,157,0.2)" : "#150a28",
          border: !ownerId ? "none" : `1px solid ${ownerId === player.id ? "#00ff9d" : "#3d1f5c"}`,
          color: ownerId === player.id ? "#00ff9d" : "#a68fd6",
        }}>
          {ownerId ? byName(ownerId).slice(0, 8) : ""}
        </div>
      ))}
    </div>
  );

  // ─── Revealed ───
  if (state.gamePhase === "revealed") {
    const myResult = state.results?.[player.id];
    const ranking = [...state.participantIds].sort((a, b) => (state.results[b]?.points || 0) - (state.results[a]?.points || 0));
    return (
      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🏛️ The Floor — Results</h3>
          <Badge>{myResult?.placement ? `#${myResult.placement}` : "—"}</Badge>
        </div>
        {state.timedOut && (
          <p style={{ color: "#a68fd6", fontSize: 11, margin: "0 0 10px", fontStyle: "italic" }}>
            Time ran out before one player controlled the whole floor — whoever was still standing ties for the best remaining placement.
          </p>
        )}
        {state.winnerId && (
          <p style={{ textAlign: "center", color: "#00ff9d", fontSize: 14, fontWeight: 700, margin: "0 0 10px" }}>
            🏆 {byName(state.winnerId)} claimed the entire floor!
          </p>
        )}
        <Grid />
        <div style={{ display: "grid", gap: 6 }}>
          {ranking.map((id) => (
            <div key={id} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              background: id === player.id ? "rgba(255,45,149,0.12)" : "#0d0618",
              border: `1px solid ${id === player.id ? "#ff2d95" : "#3d1f5c"}`, borderRadius: 6, padding: "8px 12px",
            }}>
              <span style={{ fontSize: 13, color: "#f5f0ff" }}>#{state.results[id]?.placement} {byName(id)} <span style={{ color: "#6b4f99", fontSize: 11 }}>({state.specialties[id]})</span></span>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#a68fd6" }}>{state.results[id]?.points} pt{state.results[id]?.points === 1 ? "" : "s"}</span>
            </div>
          ))}
        </div>
      </Card>
    );
  }

  const amEliminated = state.eliminatedOrder.includes(player.id);

  // ─── Already eliminated, game still going for others ───
  if (amEliminated) {
    const eliminatedRound = state.eliminatedOrder.indexOf(player.id) + 1;
    const remaining = state.participantIds.length - state.eliminatedOrder.length;
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <div style={{ fontSize: 28, marginBottom: 6 }}>💥</div>
        <h3 style={{ color: "#ff2d95", margin: "0 0 6px", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>Out in Duel {eliminatedRound}</h3>
        <p style={{ color: "#a68fd6", fontSize: 13, margin: "0 0 10px" }}>{remaining} player{remaining === 1 ? "" : "s"} still holding ground. Waiting for it to finish...</p>
        <Grid />
      </Card>
    );
  }

  // ─── Choosing phase ───
  if (state.gamePhase === "choosing") {
    const isChampion = state.championId === player.id;
    if (isChampion) {
      return (
        <Card style={{ marginBottom: 20, textAlign: "center" }}>
          <h3 style={{ color: "#ff2d95", margin: "0 0 6px", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🏛️ You Hold the Floor</h3>
          <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 10px" }}>Pick your next challenge — anyone touching your territory:</p>
          <Grid />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6 }}>
            {state.eligibleOpponentIds.map((id) => (
              <button key={id} onClick={() => chooseFloorOpponent(gameId, round.round, player.id, id)} style={{
                padding: "10px 8px", borderRadius: 8, cursor: "pointer", background: "#0d0618",
                border: "2px solid #ff2d95", color: "#f5f0ff", fontSize: 13, fontWeight: 700,
              }}>
                {byName(id)}<div style={{ fontSize: 10, color: "#a68fd6", fontWeight: 400 }}>{state.specialties[id]}</div>
              </button>
            ))}
          </div>
        </Card>
      );
    }
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <h3 style={{ color: "#ff2d95", margin: "0 0 6px", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🏛️ The Floor</h3>
        <p style={{ color: "#a68fd6", fontSize: 13, margin: "0 0 10px" }}>
          {byName(state.championId)} just took over — {state.eligibleOpponentIds.includes(player.id) ? "you might be next." : "picking their next challenge."}
        </p>
        <Grid />
      </Card>
    );
  }

  // ─── Dueling ───
  const isDuelist = state.duelistIds.includes(player.id);
  const categoryName = state.specialties[state.duelCategoryPlayerId];

  if (!isDuelist) {
    const [pA, pB] = state.duelistIds;
    const progressLabel = (id) => {
      const p = state.duelProgress[id];
      if (p.finishedAt) return `done (${p.correctCount}/3)`;
      if (p.startedAt) return `${p.answers.length}/3 so far`;
      return "hasn't started";
    };
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <h3 style={{ color: "#ff2d95", margin: "0 0 6px", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🏛️ The Floor</h3>
        <p style={{ color: "#a68fd6", fontSize: 13, margin: "0 0 4px" }}>
          {byName(pA)} vs {byName(pB)} — category: <strong style={{ color: "#f5f0ff" }}>{categoryName}</strong>
        </p>
        <p style={{ color: "#6b4f99", fontSize: 11, margin: "0 0 10px" }}>
          {byName(pA)}: {progressLabel(pA)} · {byName(pB)}: {progressLabel(pB)}
        </p>
        <Grid />
      </Card>
    );
  }

  const opponentId = state.duelistIds.find((id) => id !== player.id);
  const myProgress = state.duelProgress[player.id];
  const opponentProgress = state.duelProgress[opponentId];
  const myQuestionIndex = myProgress.answers.length;
  const iAmDone = !!myProgress.finishedAt;

  if (iAmDone) {
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <h3 style={{ color: "#ff2d95", margin: "0 0 6px", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🏛️ vs {byName(opponentId)}</h3>
        <p style={{ color: "#00ff9d", fontSize: 14, fontWeight: 700, margin: "10px 0" }}>You got {myProgress.correctCount}/3 — nicely done.</p>
        <p style={{ color: "#a68fd6", fontSize: 12, margin: 0 }}>
          {opponentProgress.finishedAt
            ? `${byName(opponentId)} also finished — resolving...`
            : opponentProgress.startedAt
              ? `${byName(opponentId)} is at ${opponentProgress.answers.length}/3 — you don't need to wait, check back anytime.`
              : `Waiting on ${byName(opponentId)} to start their own 3 — you don't need to wait around for this, check back anytime.`}
        </p>
        <Grid />
      </Card>
    );
  }

  const question = state.duelQuestions[myQuestionIndex];

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🏛️ vs {byName(opponentId)}</h3>
        <Badge>{categoryName} · {myQuestionIndex + 1}/3</Badge>
      </div>
      <p style={{ color: "#6b4f99", fontSize: 11, margin: "0 0 10px", fontStyle: "italic" }}>
        Answer on your own time — {byName(opponentId)} doesn't need to be here right now. Most correct out of 3 wins the duel; a tie goes to whoever took less time overall.
      </p>
      <p style={{ color: "#f5f0ff", fontSize: 15, fontWeight: 700, margin: "10px 0" }}>{question.q}</p>
      <div style={{ display: "grid", gap: 8 }}>
        {question.options.map((opt, i) => (
          <button
            key={i}
            onClick={() => submitFloorDuelAnswer(gameId, round.round, player.id, i)}
            style={{
              padding: "12px 14px", borderRadius: 8, cursor: "pointer",
              background: "#0d0618", border: "2px solid #3d1f5c",
              color: "#f5f0ff", fontSize: 13, fontWeight: 700, textAlign: "left",
            }}
          >
            {opt}
          </button>
        ))}
      </div>
    </Card>
  );
}
