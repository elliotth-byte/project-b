import { useState, useEffect, useRef } from "react";
import { Card, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { reportScore } from "../../lib/challengeScores";
import { subscribeMajorityRulesTv, submitChoice, tickMajorityRulesTv, placementValue } from "../../lib/games/majorityRulesTvData";

// ─── Majority Rules — Big Screen (phone side) ───
// Pure controller — the actual question text, the live vote split, and
// the running leaderboard only ever show on the TV (see
// components/bigscreen/MajorityRulesTvDisplay.jsx). Your own phone only
// ever needs the two big buttons while a question's open, and a simple
// "look up" prompt once you've answered.
export default function MajorityRulesTvPlayer({ gameId, round, player, players, settings }) {
  const [state, setState] = useState(null);
  const reportedRef = useRef(false);

  useEffect(() => subscribeMajorityRulesTv(gameId, round.round, setState), [gameId, round.round]);

  // Same belt-and-suspenders redundancy as every other shared timed
  // battle here (see e.g. lib/games/goldenFleeceData.js's own header
  // comment) — the TV drives this too, this just keeps a solo phone
  // from stalling the room if the TV isn't open.
  useEffect(() => {
    const id = setInterval(() => tickMajorityRulesTv(gameId, round.round, settings), 1000);
    return () => clearInterval(id);
  }, [gameId, round.round, settings]);

  useEffect(() => {
    if (!state) return;
    reportScore(gameId, round.round, player.id, player.name, placementValue(state, player.id), { final: false });
  }, [state?.scores, state?.tiebreakScores]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (state?.gameEnded && !reportedRef.current) {
      reportedRef.current = true;
      reportScore(gameId, round.round, player.id, player.name, placementValue(state, player.id), { final: true });
    }
  }, [state?.gameEnded]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!state) {
    return <Card style={{ marginBottom: 20, textAlign: "center" }}><p style={{ color: "#6b4f99", fontStyle: "italic" }}>Loading...</p></Card>;
  }

  const myScore = state.scores?.[player.id] || 0;

  if (state.gameEnded) {
    const won = (state.winnerIds || []).includes(player.id);
    return won
      ? <GameResultCard icon="🗳️" title="You Won Majority Rules!" valueLabel={`${myScore} pt${myScore === 1 ? "" : "s"}`} />
      : <GameResultCard icon="🗳️" title="Majority Rules Complete!" valueLabel={`${myScore} pt${myScore === 1 ? "" : "s"}`} />;
  }

  const byId = {};
  (players || []).forEach((p) => (byId[p.id] = p));
  const q = state.question;
  const a = byId[q?.playerAId];
  const b = byId[q?.playerBId];
  const iAmVoting = state.participantIds.includes(player.id);
  const myAnswer = state.answers?.[player.id];

  const answer = (side) => submitChoice(gameId, round.round, player.id, side);

  const optionButton = (side, p) => {
    const chosen = myAnswer === side;
    return (
      <button
        key={side}
        onClick={() => answer(side)}
        disabled={!!myAnswer}
        style={{
          flex: 1, padding: "18px 10px", borderRadius: 10, cursor: myAnswer ? "default" : "pointer",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
          border: `2px solid ${chosen ? "#ff2d95" : "#3d1f5c"}`,
          background: chosen ? "rgba(255,45,149,0.15)" : "#150a28",
          color: chosen ? "#ff2d95" : "#a68fd6", fontSize: 13, fontWeight: 700,
          opacity: myAnswer && !chosen ? 0.45 : 1,
        }}
      >
        {p?.effectiveAvatarUrl ? (
          <img src={p.effectiveAvatarUrl} alt="" style={{ width: 46, height: 46, borderRadius: "50%", objectFit: "cover" }} />
        ) : (
          <div style={{ width: 46, height: 46, borderRadius: "50%", background: "#1c1030", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, color: "#6b4f99" }}>
            {(p?.display_name || "?").charAt(0).toUpperCase()}
          </div>
        )}
        <span>{p?.display_name || "?"}</span>
      </button>
    );
  };

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🗳️ Majority Rules</h3>
        <Badge>{myScore} pt{myScore === 1 ? "" : "s"}</Badge>
      </div>

      {state.suddenDeath && (
        <p style={{ color: "#ffb347", fontSize: 11, margin: "0 0 10px", fontStyle: "italic" }}>⚡ Tiebreaker round</p>
      )}

      {!iAmVoting ? (
        <p style={{ color: "#a68fd6", fontSize: 14, fontStyle: "italic" }}>Watching from the sidelines — check the big screen.</p>
      ) : state.phase === "answering" ? (
        myAnswer ? (
          <p style={{ color: "#6b4f99", fontSize: 14, fontStyle: "italic" }}>Locked in — waiting on everyone else...</p>
        ) : (
          <>
            <p style={{ color: "#f5f0ff", fontSize: 14, fontWeight: 600, margin: "0 0 12px" }}>{q?.text}</p>
            <div style={{ display: "flex", gap: 10 }}>
              {optionButton("A", a)}
              {optionButton("B", b)}
            </div>
          </>
        )
      ) : (
        <p style={{ color: "#a68fd6", fontSize: 14, fontStyle: "italic" }}>👀 See the big screen!</p>
      )}
    </Card>
  );
}
