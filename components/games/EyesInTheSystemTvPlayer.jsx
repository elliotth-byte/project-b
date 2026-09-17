import { useState, useEffect, useRef } from "react";
import { Card, Badge, Btn } from "../ui";
import GameResultCard from "./GameResultCard";
import { reportScore } from "../../lib/challengeScores";
import { subscribeEyesTv, submitEyesTvAnswer, chooseNextMatch, resolveEyesTvMatch, placementValue } from "../../lib/games/eyesInTheSystemTvData";
import { EyesZone, EYE_COLORS } from "./EyesInTheSystemIcons";

// ─── Eyes in the System — Big Screen (phone side) ───
// Unlike every other Big Screen battle's phone component, the puzzle
// itself DOES render here — see lib/games/eyesInTheSystemTvData.js's
// own header comment for why: this is a genuine 1-on-1 speed contest
// between two specific people, and forcing them to look up at a
// shared TV instead of their own hands would just add an arbitrary,
// unfair reaction-time penalty that has nothing to do with the actual
// skill this game tests.
export default function EyesInTheSystemTvPlayer({ gameId, round, challenge, player, players }) {
  const [state, setState] = useState(null);
  const [pickA, setPickA] = useState(null);
  const [pickB, setPickB] = useState(null);
  const reportedRef = useRef(false);

  useEffect(() => subscribeEyesTv(gameId, round.round, setState), [gameId, round.round]);

  useEffect(() => {
    if (!state || state.winnerId || state.pendingChoice || !state.currentMatch) return;
    const id = setInterval(() => resolveEyesTvMatch(gameId, round.round), 800);
    return () => clearInterval(id);
  }, [state?.currentMatch, state?.winnerId, state?.pendingChoice, gameId, round.round]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!state) return;
    reportScore(gameId, round.round, player.id, player.name, placementValue(state, player.id), { final: false });
  }, [state?.matchNumber, state?.winnerId]); // eslint-disable-line react-hooks/exhaustive-deps

  const iAmEliminated = state && !state.remainingPlayerIds.includes(player.id) && state.winnerId !== player.id;
  useEffect(() => {
    const gameOver = !challenge?.active || !!state?.winnerId || iAmEliminated;
    if (gameOver && state && !reportedRef.current) {
      reportedRef.current = true;
      reportScore(gameId, round.round, player.id, player.name, placementValue(state, player.id), { final: true });
    }
  }, [challenge?.active, state, iAmEliminated]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!challenge?.active) {
    const myScore = state ? placementValue(state, player.id) : 0;
    return <GameResultCard icon="👁" title="Eyes in the System" valueLabel={`Score: ${myScore}`} />;
  }
  if (!state) return <Card style={{ marginBottom: 20, textAlign: "center" }}><p style={{ color: "#6b4f99", fontStyle: "italic" }}>Loading...</p></Card>;

  const byId = {};
  (players || []).forEach((p) => (byId[p.id] = p.display_name));

  if (state.winnerId === player.id) {
    return <GameResultCard icon="🏆" title="Last Eyes Standing!" valueLabel="You won" />;
  }
  if (state.winnerId) {
    return <GameResultCard icon="👁" title="Eyes in the System" valueLabel="Someone else won" />;
  }
  if (iAmEliminated) {
    const elimMatch = state.eliminatedInRound?.[player.id];
    return <GameResultCard icon="👁" title="Eyes in the System" valueLabel={elimMatch ? `Eliminated in match ${elimMatch}` : "Eliminated"} />;
  }

  if (state.pendingChoice?.winnerId === player.id) {
    return (
      <ChooseNextOpponents
        gameId={gameId} round={round} player={player} players={players}
        remainingPlayerIds={state.remainingPlayerIds}
        pickA={pickA} pickB={pickB} setPickA={setPickA} setPickB={setPickB}
      />
    );
  }

  if (state.pendingChoice) {
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>👁</div>
        <p style={{ color: "#a68fd6", fontSize: 13, margin: 0 }}>Waiting on the last winner to choose who faces off next...</p>
      </Card>
    );
  }

  const match = state.currentMatch;
  if (!match || (player.id !== match.playerAId && player.id !== match.playerBId)) {
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>👁</div>
        <p style={{ color: "#a68fd6", fontSize: 13, margin: 0 }}>Watch the big screen — you're up soon.</p>
      </Card>
    );
  }

  const myAnswer = match.answers[player.id];
  const answer = async (zoneKey) => {
    if (myAnswer) return;
    await submitEyesTvAnswer(gameId, round.round, player.id, zoneKey);
  };

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>👁 Eyes in the System</h3>
        <Badge>Match {state.matchNumber}</Badge>
      </div>
      <p style={{ color: "#a68fd6", fontSize: 13, margin: "0 0 14px" }}>
        Most <strong style={{ color: EYE_COLORS[match.round.targetColor] }}>{match.round.targetColor}</strong> eyes — first one right wins!
      </p>
      <div style={{ display: "grid", gap: 10, maxWidth: 280, margin: "0 auto" }}>
        {match.round.zones.map((zone) => (
          <EyesZone
            key={zone.zone} zone={zone} size={240}
            onClick={() => answer(zone.zone)}
            disabled={!!myAnswer}
            highlight={myAnswer?.zone === zone.zone && myAnswer.correct}
          />
        ))}
      </div>
      {myAnswer && (
        <p style={{ marginTop: 12, fontSize: 14, fontWeight: 700, color: myAnswer.correct ? "#00ff9d" : "#ff3860" }}>
          {myAnswer.correct ? "✅ You got it!" : "Locked in — waiting to see..."}
        </p>
      )}
    </Card>
  );
}

function ChooseNextOpponents({ gameId, round, player, players, remainingPlayerIds, pickA, pickB, setPickA, setPickB }) {
  const [saving, setSaving] = useState(false);
  const choices = remainingPlayerIds.filter((id) => id !== player.id);
  const byId = {};
  (players || []).forEach((p) => (byId[p.id] = p.display_name));

  const toggle = (id) => {
    if (pickA === id) { setPickA(null); return; }
    if (pickB === id) { setPickB(null); return; }
    if (!pickA) { setPickA(id); return; }
    if (!pickB) { setPickB(id); return; }
  };

  const confirm = async () => {
    if (!pickA || !pickB) return;
    setSaving(true);
    await chooseNextMatch(gameId, round.round, player.id, pickA, pickB);
    setSaving(false);
  };

  return (
    <Card style={{ marginBottom: 20, textAlign: "center", borderColor: "#00ff9d" }}>
      <div style={{ fontSize: 28, marginBottom: 8 }}>🏆</div>
      <h3 style={{ color: "#f5f0ff", margin: "0 0 4px", fontSize: 15 }}>You won! Pick the next face-off.</h3>
      <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 14px" }}>Choose two players to face off next — you sit this one out.</p>
      <div style={{ display: "grid", gap: 6, marginBottom: 14, maxHeight: 260, overflowY: "auto" }}>
        {choices.map((id) => {
          const selected = pickA === id || pickB === id;
          return (
            <button
              key={id} onClick={() => toggle(id)}
              style={{
                textAlign: "left", padding: "8px 12px", borderRadius: 8, cursor: "pointer",
                background: selected ? "rgba(0,255,157,0.15)" : "#0d0618",
                border: `1px solid ${selected ? "#00ff9d" : "#3d1f5c"}`,
                color: selected ? "#00ff9d" : "#f5f0ff", fontSize: 13, fontWeight: 600,
              }}
            >
              {byId[id] || "?"}
            </button>
          );
        })}
      </div>
      <Btn onClick={confirm} disabled={!pickA || !pickB || saving}>{saving ? "Starting..." : "Start This Face-Off"}</Btn>
    </Card>
  );
}
