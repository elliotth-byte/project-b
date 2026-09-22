import { useState, useEffect, useRef } from "react";
import { Card, Badge, Btn } from "../ui";
import GameResultCard from "./GameResultCard";
import TriggerHappyGridInput from "./TriggerHappyGridInput";
import { reportScore } from "../../lib/challengeScores";
import {
  GRID_COLS_TV, TOTAL_CELLS_TV,
  subscribeTriggerHappyTv, submitLeverPull, submitDuelAnswer, submitNextPair, tickTriggerHappyTv, placementValue,
} from "../../lib/games/triggerHappyTvData";

// ─── Trigger Happy — Big Screen (phone side) ───
// Branches three ways: an active duelist (lever button during
// memorize, the replication grid during blank_replicating, a waiting
// card during revealed), the current duel's winner during
// picking_next (the next-matchup picker), or a spectator the rest of
// the time — a simple "watch the big screen" card, same shape as
// components/games/EyesInTheSystemTvPlayer.jsx's own non-participant
// states.
export default function TriggerHappyTvPlayer({ gameId, round, challenge, player, players, settings }) {
  const [state, setState] = useState(null);
  const [placed, setPlaced] = useState(() => Array(TOTAL_CELLS_TV).fill(null));
  const lastPhaseRef = useRef(null);

  useEffect(() => subscribeTriggerHappyTv(gameId, round.round, setState), [gameId, round.round]);

  // Same belt-and-suspenders poll as every other shared timed battle
  // here (see lib/games/triggerHappyTvData.js's own header comment on
  // tickTriggerHappyTv) — keeps duels resolving/advancing even if
  // nobody's TV or the other duelist's phone happens to be open.
  useEffect(() => {
    const id = setInterval(() => tickTriggerHappyTv(gameId, round.round, settings), 1000);
    return () => clearInterval(id);
  }, [gameId, round.round, settings]);

  // Reset this phone's own in-progress replication grid the moment a
  // fresh duel starts (a new "memorize" phase) — otherwise a player's
  // leftover placements from a previous duel they were in would still
  // be sitting there next time they're picked.
  useEffect(() => {
    if (state?.phase === "memorize" && lastPhaseRef.current !== "memorize") {
      setPlaced(Array(TOTAL_CELLS_TV).fill(null));
    }
    lastPhaseRef.current = state?.phase;
  }, [state?.phase]);

  useEffect(() => {
    if (!state) return;
    reportScore(gameId, round.round, player.id, player.name, placementValue(state, player.id), { final: false });
  }, [state?.wins]); // eslint-disable-line react-hooks/exhaustive-deps

  const reportedRef = useRef(false);
  useEffect(() => {
    if (!challenge?.active && state && !reportedRef.current) {
      reportedRef.current = true;
      reportScore(gameId, round.round, player.id, player.name, placementValue(state, player.id), { final: true });
    }
  }, [challenge?.active, state]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!challenge?.active) {
    const myWins = state ? placementValue(state, player.id) : 0;
    return <GameResultCard icon="🎚️" title="Trigger Happy" valueLabel={`${myWins} duel win${myWins === 1 ? "" : "s"}`} />;
  }
  if (!state) return <Card style={{ marginBottom: 20, textAlign: "center" }}><p style={{ color: "#6b4f99", fontStyle: "italic" }}>Loading...</p></Card>;

  const byId = {};
  (players || []).forEach((p) => (byId[p.id] = p.display_name));
  const myWins = placementValue(state, player.id);
  const [aId, bId] = state.currentPair;
  const otherName = player.id === aId ? byId[bId] : byId[aId];
  const iAmDuelist = state.currentPair.includes(player.id);
  const iAmPicker = state.phase === "picking_next" && state.pendingPickerId === player.id;

  const header = (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
      <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🎚️ Trigger Happy</h3>
      <Badge>{myWins} win{myWins === 1 ? "" : "s"}</Badge>
    </div>
  );

  if (iAmPicker) {
    return (
      <NextPairPicker
        gameId={gameId} round={round} player={player} players={players}
        participantIds={state.participantIds} header={header}
      />
    );
  }

  if (!iAmDuelist) {
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        {header}
        {state.phase === "picking_next" ? (
          <p style={{ color: "#a68fd6", fontSize: 14 }}>
            ⚔️ {byId[state.pendingPickerId] || "?"} is picking the next matchup — watch the big screen.
          </p>
        ) : (
          <p style={{ color: "#a68fd6", fontSize: 14 }}>
            ⚔️ {byId[aId] || "?"} vs {byId[bId] || "?"} are dueling — watch the big screen!
          </p>
        )}
      </Card>
    );
  }

  if (state.phase === "memorize") {
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        {header}
        <p style={{ color: "#a68fd6", fontSize: 13, margin: "0 0 16px" }}>
          You're up against {otherName || "?"} — study the shared grid on the big screen, then pull the lever whenever you're ready.
        </p>
        <Btn onClick={() => submitLeverPull(gameId, round.round, player.id)}>Pull the Lever 🎚️</Btn>
      </Card>
    );
  }

  if (state.phase === "blank_replicating") {
    const alreadySubmitted = !!state.submissions[player.id];
    if (alreadySubmitted) {
      return (
        <Card style={{ marginBottom: 20, textAlign: "center" }}>
          {header}
          <p style={{ color: "#6b4f99", fontSize: 14, fontStyle: "italic" }}>Locked in — waiting on {otherName || "the other duelist"}...</p>
        </Card>
      );
    }
    const filledCount = placed.filter((c) => c != null).length;
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        {header}
        <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 10px" }}>Grid's blank — place every relic back where it was, fast.</p>
        <TriggerHappyGridInput grid={placed} onChange={setPlaced} cols={GRID_COLS_TV} />
        <div style={{ marginTop: 12 }}>
          <Btn onClick={() => submitDuelAnswer(gameId, round.round, player.id, placed)} disabled={filledCount === 0}>
            Lock In My Grid
          </Btn>
        </div>
      </Card>
    );
  }

  // "revealed" — both duelists just wait here; the full comparison
  // lives on the TV (components/bigscreen/TriggerHappyTvDisplay.jsx).
  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      {header}
      <p style={{ color: "#a68fd6", fontSize: 14 }}>Check the big screen for the result!</p>
    </Card>
  );
}

function NextPairPicker({ gameId, round, player, players, participantIds, header }) {
  const [pickA, setPickA] = useState(null);
  const [pickB, setPickB] = useState(null);
  const [saving, setSaving] = useState(false);

  const byId = {};
  (players || []).forEach((p) => (byId[p.id] = p.display_name));
  // Same fallback as lib/games/triggerHappyTvData.js's own pickPair:
  // exclude the winner themselves UNLESS fewer than 2 other
  // participants exist at all (a 2-player battle can only ever re-run
  // the same matchup), in which case they're offered as a choice too.
  const others = participantIds.filter((id) => id !== player.id);
  const choices = others.length >= 2 ? others : participantIds;

  const toggle = (id) => {
    if (pickA === id) { setPickA(null); return; }
    if (pickB === id) { setPickB(null); return; }
    if (!pickA) { setPickA(id); return; }
    if (!pickB) { setPickB(id); return; }
  };

  const confirm = async () => {
    if (!pickA || !pickB) return;
    setSaving(true);
    await submitNextPair(gameId, round.round, player.id, [pickA, pickB]);
    setSaving(false);
  };

  return (
    <Card style={{ marginBottom: 20, textAlign: "center", borderColor: "#00ff9d" }}>
      {header}
      <div style={{ fontSize: 28, marginBottom: 8 }}>🏆</div>
      <h3 style={{ color: "#f5f0ff", margin: "0 0 4px", fontSize: 15 }}>You won! Pick the next duel.</h3>
      <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 14px" }}>Choose two players to face off next.</p>
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
      <Btn onClick={confirm} disabled={!pickA || !pickB || saving}>{saving ? "Starting..." : "Start This Duel"}</Btn>
    </Card>
  );
}
