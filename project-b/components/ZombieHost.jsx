import { useState, useEffect, useRef } from "react";
import { Btn, Card, Badge, ChallengeSetupCard, PauseResumeControls } from "./traitorsUi";
import { storageSet, storageUpdate, storageDelete, subscribeGameState } from "../lib/gameStorage";
import { pauseChallenge, resumeChallenge } from "../lib/pauseResume";
import { zombieCounts, STORAGE_KEY_ZOMBIE } from "../lib/zombieData";
import { logChallengeResult } from "../lib/challengeHistory";
import { DEFAULT_PARTICIPATION, computeParticipants } from "../lib/challengeParticipants";
import ParticipantPicker from "./ParticipantPicker";
import ArchiveResultsButton from "./ArchiveResultsButton";

// ─── Zombie Game: Host Control ───
//
// Reworked against the real format's rules (The Genius: Rules of the
// Game, Ep. 4 — "Zombie Game"), after the earlier version drifted from
// them in two real ways:
// 1. Touches now require both players to agree (see ZombiePlayer.jsx) —
//    the host doesn't resolve anything directly; it's peer-to-peer.
// 2. Touch uniqueness is tracked for the WHOLE game, not reset each round
//    — two players can only ever touch each other once, period.
//
// The host still sees the full roster/status breakdown here, same as the
// original — this console is the "game master" view, not something a
// player ever sees. Players themselves (ZombiePlayer.jsx) never see
// anyone's status, including their own, unless they were an original
// zombie — see that file's notes for the full reasoning.
export default function ZombieHost({ gameId, alive, allPlayers = [], shieldedNames = [], returnedNames = [] }) {
  const [st, setSt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [participation, setParticipation] = useState(DEFAULT_PARTICIPATION);
  const loggedWinnerRef = useRef(false);

  useEffect(() => {
    if (st?.winner && !loggedWinnerRef.current) {
      loggedWinnerRef.current = true;
      logChallengeResult(gameId, { challenge: "Zombie Game", winners: st.winner.type === "zombies" ? st.winner.names : st.winner.names, note: st.winner.type === "zombies" ? "Zombies won — everyone turned" : `Score: ${st.winner.score}` });
    }
    if (!st?.winner) loggedWinnerRef.current = false;
  }, [gameId, st?.winner]);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeGameState(gameId, STORAGE_KEY_ZOMBIE, (value) => {
      setSt(value);
      setLoading(false);
    });
    return unsubscribe;
  }, [gameId]);

  const start = async () => {
    const { participants, spectators } = computeParticipants(participation, { alive, allPlayers, shieldedNames, returnedNames });
    const names = participants.map((p) => p.name);
    if (names.length < 3) { alert("Need at least 3 participants."); return; }
    const shuffled = [...names].sort(() => Math.random() - 0.5);
    const originalZombies = shuffled.slice(0, 2);
    const statuses = {}, scores = {}, antidoteUsed = {};
    names.forEach((n) => {
      statuses[n] = originalZombies.includes(n) ? "zombie" : "human";
      scores[n] = 0;
      antidoteUsed[n] = false;
    });
    const state = {
      active: true, createdAt: Date.now(), phase: "active",
      players: participants.map((p) => ({ id: p.id, name: p.name })),
      participants: names, spectators: spectators.map((p) => p.name),
      originalZombies, statuses, scores, antidoteUsed, infectionTimes: {},
      touches: [], pending: [], round: 1, maxRounds: 3, winner: null, roundSummaries: [],
    };
    await storageSet(gameId, STORAGE_KEY_ZOMBIE, state);
    setSt(state);
  };

  // Uses an atomic update since a player's touch could land at the same
  // moment the host advances the round.
  const advance = async () => {
    const res = await storageUpdate(gameId, STORAGE_KEY_ZOMBIE, (fresh) => {
      if (!fresh) return null;
      const touchedThisRound = new Set();
      (fresh.touches || []).forEach((t) => { if (t.round === fresh.round) { touchedThisRound.add(t.a); touchedThisRound.add(t.b); } });
      Object.keys(fresh.statuses).forEach((n) => {
        if (fresh.statuses[n] === "human" && !touchedThisRound.has(n)) {
          fresh.statuses[n] = "zombie";
          fresh.infectionTimes[n] = Date.now();
        }
      });
      const c = zombieCounts(fresh);
      fresh.roundSummaries = [...(fresh.roundSummaries || []), { round: fresh.round, ...c }];
      // Any requests still pending when the round ends go unresolved — they
      // simply never happened, same as two people in real life who never
      // got around to touching.
      fresh.pending = [];
      if (fresh.round >= fresh.maxRounds || c.humans === 0) {
        return applyEndGame(fresh);
      }
      fresh.round += 1;
      return fresh;
    });
    if (res.ok) setSt(res.value);
  };

  function applyEndGame(fresh) {
    const c = zombieCounts(fresh);
    let winner;
    if (c.humans === 0) {
      winner = { type: "zombies", names: fresh.originalZombies };
    } else {
      const humans = Object.keys(fresh.statuses).filter((n) => fresh.statuses[n] === "human");
      const max = Math.max(...humans.map((n) => fresh.scores[n]));
      winner = { type: "humans", names: humans.filter((n) => fresh.scores[n] === max), score: max };
    }
    fresh.winner = winner;
    fresh.phase = "ended";
    return fresh;
  }

  const endGame = async () => {
    const res = await storageUpdate(gameId, STORAGE_KEY_ZOMBIE, (fresh) => (fresh ? applyEndGame(fresh) : null));
    if (res.ok) setSt(res.value);
  };

  const clear = async () => { await storageDelete(gameId, STORAGE_KEY_ZOMBIE); setSt(null); };
  const pause = async () => { const r = await pauseChallenge(gameId, STORAGE_KEY_ZOMBIE); if (r.ok) setSt(r.value); };

  const resume = async () => {
    const r = await resumeChallenge(gameId, STORAGE_KEY_ZOMBIE, (fresh, pausedAt, now) => {
      const delta = now - pausedAt;
      const shifted = {};
      Object.entries(fresh.infectionTimes || {}).forEach(([k, v]) => { shifted[k] = v + delta; });
      fresh.infectionTimes = shifted;
    });
    if (r.ok) setSt(r.value);
  };

  if (loading) return <Card><p style={{ color: "#706050", fontStyle: "italic" }}>Loading...</p></Card>;

  if (!st) {
    return (
      <ChallengeSetupCard
        icon="🧟" title="Zombie Game" onStart={start} startLabel="Start (2 random zombies)"
        disabled={computeParticipants(participation, { alive, allPlayers, shieldedNames, returnedNames }).participants.length < 3}
        blurb="Two secret zombies spread infection over 3 rounds. Touching requires mutual consent — request a touch, the other player accepts. Two humans touching score a point each; a zombie touching a human infects them. Nobody but the two original zombies ever learns their own status."
      >
        <ParticipantPicker
          alive={alive} allPlayers={allPlayers} shieldedNames={shieldedNames} returnedNames={returnedNames}
          value={participation} onChange={setParticipation}
        />
      </ChallengeSetupCard>
    );
  }

  const c = zombieCounts(st);
  const pendingCount = (st.pending || []).length;

  return (
    <Card style={{ borderColor: "rgba(196,92,60,0.3)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h3 style={{ color: "#f0e6d3", margin: 0, fontSize: 14, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>🧟 Zombie Game</h3>
        <Badge color="#c45c3c">Round {st.round}/{st.maxRounds}</Badge>
      </div>
      {st.winner ? (
        <div style={{ background: "rgba(122,154,92,0.1)", border: "1px solid rgba(122,154,92,0.3)", borderRadius: 8, padding: 12, marginBottom: 10 }}>
          <strong style={{ color: "#7a9a5c" }}>
            {st.winner.type === "zombies" ? "🧟 Zombies win — everyone turned!" : `🏆 Human winner${st.winner.names.length > 1 ? "s" : ""}: ${st.winner.names.join(", ")} (${st.winner.score} pts)`}
          </strong>
        </div>
      ) : (
        <p style={{ fontSize: 13, color: "#a09080", margin: "0 0 10px" }}>
          Humans: <strong style={{ color: "#7a9a5c" }}>{c.humans}</strong> · Zombies: <strong style={{ color: "#c45c3c" }}>{c.zombies}</strong> · Touches this round: {(st.touches || []).filter((t) => t.round === st.round).length} · Pending requests: {pendingCount}
        </p>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginBottom: 10 }}>
        {st.players.map((p) => (
          <div key={p.id} style={{ fontSize: 12, display: "flex", justifyContent: "space-between", padding: "3px 8px", background: "#0a1020", borderRadius: 6 }}>
            <span style={{ color: st.statuses?.[p.name] === "zombie" ? "#c45c3c" : "#7a9a5c" }}>
              {st.statuses?.[p.name] === "zombie" ? "🧟" : "🙂"} {p.name}{st.originalZombies.includes(p.name) ? "*" : ""}
            </span>
            <span style={{ color: "#a09080" }}>{st.scores?.[p.name] ?? 0}p{st.antidoteUsed?.[p.name] ? " 💊" : ""}</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {!st.winner && <Btn onClick={advance}>{st.round >= st.maxRounds ? "End Final Round" : "Advance Round →"}</Btn>}
        {!st.winner && <Btn variant="danger" onClick={endGame}>End Now</Btn>}
        <Btn variant="ghost" small onClick={clear}>Clear</Btn>
        {!st.winner && <PauseResumeControls paused={!!st.paused} onPause={pause} onResume={resume} />}
        {st.winner && (
          <ArchiveResultsButton
            gameId={gameId} challengeId="zombie" challengeName="Zombie Game" round={st.round}
            participants={st.participants || st.players.map((p) => p.name)} spectators={st.spectators}
            winner={st.winner.names} resultSummary={st.winner.type === "zombies" ? "Zombies won — everyone turned." : `Human winner(s), ${st.winner.score} pts.`}
            finalState={st} startedAt={st.createdAt}
          />
        )}
      </div>
      <p style={{ fontSize: 10, color: "#706050", marginTop: 6 }}>
        * = original zombie (told upfront, can't be cured) — this breakdown is host-only; players never see anyone's status, including their own, unless they're one of the two starred above.
      </p>
    </Card>
  );
}
