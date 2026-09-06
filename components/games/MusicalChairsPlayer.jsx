import { useState, useEffect, useRef } from "react";
import { Card, Badge } from "../ui";
import { reportScore } from "../../lib/challengeScores";
import {
  subscribeMusicalChairs,
  advanceMusicalChairsIfDue,
  claimChair,
  placementValue,
} from "../../lib/games/musicalChairsData";

export default function MusicalChairsPlayer({ gameId, round, challenge, player, players }) {
  const [state, setState] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [, forceTick] = useState(0);
  const reportedRef = useRef(false);

  useEffect(() => {
    const unsubscribe = subscribeMusicalChairs(gameId, round.round, (v) => { setState(v); setLoaded(true); });
    return unsubscribe;
  }, [gameId, round.round]);

  const byName = (id) => players?.find((p) => p.id === id)?.display_name || "?";

  // The actual phase-change clock — see musicalChairsData.js's own
  // comment on why this ALSO needs to run server-side (roundEngine.js),
  // not just here: this covers the common case (someone's actively
  // watching the screen), that covers the gap when nobody momentarily
  // is.
  //
  // The poll interval is adaptive, not a flat 400ms — that was fine
  // when the seat window was always ~5s, but this game's windows now
  // scale up to 30 real minutes for a long async challenge (see
  // computeSeatWindowMs), and hammering the database every 400ms for
  // 20+ minutes with nothing to actually check would be pure waste for
  // every player who has the screen open in the background. Instead,
  // this re-schedules itself each tick for roughly a tenth of however
  // long remains until the next relevant deadline (musicEndsAt or
  // seatsEndsAt) — snappy (down to a 400ms floor) as a deadline
  // actually approaches, coarse (up to a 30s ceiling) when it's still
  // far off — so a client that's just sitting on a long music phase
  // isn't doing anything until there's actually something worth
  // checking for soon.
  useEffect(() => {
    if (!state || state.gamePhase !== "playing") return;
    let timeoutId;

    const tick = () => {
      forceTick((t) => t + 1);
      advanceMusicalChairsIfDue(gameId, round.round);
      const deadline = state.roundPhase === "music" ? state.musicEndsAt : state.seatsEndsAt;
      const msRemaining = Math.max(0, (deadline || 0) - Date.now());
      const delay = Math.max(400, Math.min(30000, msRemaining / 10));
      timeoutId = window.setTimeout(tick, delay);
    };
    tick();

    return () => window.clearTimeout(timeoutId);
  }, [gameId, round.round, state?.gamePhase, state?.roundPhase, state?.musicEndsAt, state?.seatsEndsAt]); // eslint-disable-line react-hooks/exhaustive-deps

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
        <div style={{ fontSize: 28, marginBottom: 6 }}>🎵</div>
        <div style={{ fontSize: 12, letterSpacing: 4, textTransform: "uppercase", color: "#00ff9d" }}>Not Enough Players</div>
        <p style={{ color: "#6b4f99", fontSize: 12, marginTop: 10, fontStyle: "italic" }}>Musical Chairs needs at least 2 players.</p>
      </Card>
    );
  }

  // ─── Revealed ───
  if (state.gamePhase === "revealed") {
    const myResult = state.results?.[player.id];
    const ranking = [...state.participantIds].sort((a, b) => (state.results[b]?.points || 0) - (state.results[a]?.points || 0));
    return (
      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🎵 Musical Chairs — Results</h3>
          <Badge>{myResult?.placement ? `#${myResult.placement}` : "—"}</Badge>
        </div>
        {state.timedOut && (
          <p style={{ color: "#a68fd6", fontSize: 11, margin: "0 0 10px", fontStyle: "italic" }}>
            Time ran out before this got down to one winner — whoever was still standing ties for the best remaining placement.
          </p>
        )}
        {state.winnerId && (
          <p style={{ textAlign: "center", color: "#00ff9d", fontSize: 14, fontWeight: 700, margin: "0 0 14px" }}>
            🏆 {byName(state.winnerId)} never missed a chair!
          </p>
        )}
        <div style={{ display: "grid", gap: 6 }}>
          {ranking.map((id) => (
            <div key={id} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              background: id === player.id ? "rgba(255,45,149,0.12)" : "#0d0618",
              border: `1px solid ${id === player.id ? "#ff2d95" : "#3d1f5c"}`, borderRadius: 6, padding: "8px 12px",
            }}>
              <span style={{ fontSize: 13, color: "#f5f0ff" }}>#{state.results[id]?.placement} {byName(id)}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#a68fd6" }}>{state.results[id]?.points} pt{state.results[id]?.points === 1 ? "" : "s"}</span>
            </div>
          ))}
        </div>
      </Card>
    );
  }

  // ─── Already eliminated, game still going for others ───
  const amEliminated = !state.remainingPlayerIds.includes(player.id);
  if (amEliminated) {
    const eliminatedRound = state.eliminatedOrder.indexOf(player.id) + 1;
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <div style={{ fontSize: 28, marginBottom: 6 }}>💥</div>
        <h3 style={{ color: "#ff2d95", margin: "0 0 6px", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>Out in Round {eliminatedRound}</h3>
        <p style={{ color: "#a68fd6", fontSize: 13, margin: 0 }}>
          {state.remainingPlayerIds.length} player{state.remainingPlayerIds.length === 1 ? "" : "s"} still standing. Waiting for it to finish...
        </p>
      </Card>
    );
  }

  const chairsThisRound = state.remainingPlayerIds.length - 1;

  // ─── Music playing — deliberately no countdown shown ───
  if (state.roundPhase === "music") {
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <h3 style={{ color: "#ff2d95", margin: "0 0 8px", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🎵 Musical Chairs — Round {state.roundIndex + 1}/{state.totalRounds}</h3>
        <p style={{ color: "#f5f0ff", fontSize: 16, fontWeight: 700, margin: "10px 0" }}>The music is playing...</p>
        <p style={{ color: "#6b4f99", fontSize: 12, margin: 0, fontStyle: "italic" }}>
          {chairsThisRound} chair{chairsThisRound === 1 ? "" : "s"} this round, {state.remainingPlayerIds.length} player{state.remainingPlayerIds.length === 1 ? "" : "s"} left. Stay ready — nobody knows when it stops.
        </p>
      </Card>
    );
  }

  // ─── Seats open ───
  const myClaim = state.claims[player.id];
  // Formatted for both ends of the range this can now be: a live
  // challenge's few-second window (just show seconds) and an async
  // challenge's much longer one (see computeSeatWindowMs in
  // lib/games/musicalChairsData.js) — nobody needs single-second
  // precision on a 20-minute window, and "1183s" reads as a bug even
  // though it isn't one.
  const msLeft = Math.max(0, state.seatsEndsAt - Date.now());
  const secondsLeft = Math.ceil(msLeft / 1000);
  const timeLeftLabel = secondsLeft < 90
    ? `${secondsLeft}s`
    : secondsLeft < 3600
      ? `${Math.ceil(secondsLeft / 60)}m`
      : `${Math.floor(secondsLeft / 3600)}h ${Math.round((secondsLeft % 3600) / 60)}m`;
  const chairs = Array.from({ length: state.chairCount }, (_, i) => i);
  const claimedByChair = {}; // chairIndex -> playerId
  Object.entries(state.claims).forEach(([pid, c]) => { claimedByChair[c.chairIndex] = pid; });

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🎵 The Music Stopped!</h3>
        <Badge>{timeLeftLabel}</Badge>
      </div>
      {myClaim ? (
        <p style={{ color: "#00ff9d", fontSize: 14, fontWeight: 700, margin: "10px 0" }}>You got a chair!</p>
      ) : (
        <p style={{ color: "#ff3860", fontSize: 13, fontWeight: 700, margin: "10px 0" }}>Grab a chair — now!</p>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 8 }}>
        {chairs.map((i) => {
          const takenBy = claimedByChair[i];
          const isMine = takenBy === player.id;
          return (
            <button
              key={i}
              disabled={!!takenBy || !!myClaim}
              onClick={() => claimChair(gameId, round.round, player.id, i)}
              style={{
                padding: "16px 6px", borderRadius: 10, cursor: takenBy || myClaim ? "default" : "pointer",
                background: isMine ? "rgba(0,255,157,0.2)" : takenBy ? "#150a28" : "linear-gradient(160deg, #ff2d9533, #ff2d9511)",
                border: `2px solid ${isMine ? "#00ff9d" : takenBy ? "#3d1f5c" : "#ff2d95"}`,
                opacity: takenBy && !isMine ? 0.4 : 1,
              }}
            >
              <div style={{ fontSize: 26 }}>🪑</div>
              <div style={{ fontSize: 10, color: isMine ? "#00ff9d" : "#a68fd6", marginTop: 4 }}>
                {takenBy ? byName(takenBy) : "Open"}
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
