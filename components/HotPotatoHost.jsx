import { useState, useEffect, useRef } from "react";
import { Btn, Card, ChallengeSetupCard, PauseResumeControls } from "./traitorsUi";
import { storageSet, storageDelete, subscribeGameState } from "../lib/gameStorage";
import { pauseChallenge, resumeChallenge } from "../lib/pauseResume";
import { fmtTime, tickHotPotato, STORAGE_KEY_HOT_POTATO } from "../lib/hotPotatoData";
import { logChallengeResult } from "../lib/challengeHistory";
import { DEFAULT_PARTICIPATION, computeParticipants } from "../lib/challengeParticipants";
import ParticipantPicker from "./ParticipantPicker";
import ArchiveResultsButton from "./ArchiveResultsButton";

// ─── Hot Potato: Host Control ───
export default function HotPotatoHost({ gameId, alive, allPlayers = [], shieldedNames = [], returnedNames = [] }) {
  const [st, setSt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [, forceTick] = useState(0);
  const [numWinners, setNumWinners] = useState(1);
  const [participation, setParticipation] = useState(DEFAULT_PARTICIPATION);
  const loggedWinnerRef = useRef(false);

  // Log to the shared challenge history exactly once, the first time this
  // host tab observes a winner appear (whether from its own tick or from
  // the round having ended while this tab wasn't the one ticking).
  useEffect(() => {
    if (st?.winner && !loggedWinnerRef.current) {
      loggedWinnerRef.current = true;
      logChallengeResult(gameId, { challenge: "Hot Potato", winners: st.winner, eliminated: st.eliminated });
    }
    if (!st?.winner) loggedWinnerRef.current = false;
  }, [gameId, st?.winner]);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeGameState(gameId, STORAGE_KEY_HOT_POTATO, (value) => {
      setSt(value);
      setLoading(false);
    });
    return unsubscribe;
  }, [gameId]);

  // Every second: (1) re-render so the visible countdowns tick down, and
  // (2) check whether any potato's timer ran out — see lib/hotPotatoData.js
  // for why this uses an atomic update instead of a plain read/write.
  useEffect(() => {
    if (!st?.active || st.paused) return;
    const interval = window.setInterval(async () => {
      forceTick((x) => x + 1);
      const res = await tickHotPotato(gameId);
      if (res.ok) setSt(res.value);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [gameId, st?.active, st?.paused]);

  const start = async () => {
    const { participants, spectators } = computeParticipants(participation, { alive, allPlayers, shieldedNames, returnedNames });
    const names = participants.map((p) => p.name);
    if (names.length < 3) { alert("Need at least 3 participants."); return; }
    if (numWinners >= names.length) { alert("Winner count must be less than the number of participants."); return; }
    const shuffled = [...names].sort(() => Math.random() - 0.5);
    const mk = (id, holder) => {
      const dur = (15 + Math.floor(Math.random() * 46)) * 60 * 1000;
      const now = Date.now();
      return { id, holder, startedAt: now, durationMs: dur, expiresAt: now + dur, exploded: false, timesReassigned: 0 };
    };
    const state = {
      active: true, createdAt: Date.now(), phase: "active",
      players: participants.map((p) => ({ id: p.id, name: p.name })),
      participants: names, spectators: spectators.map((p) => p.name),
      potatoes: [mk("A", shuffled[0]), mk("B", shuffled[1] || shuffled[0])],
      eliminated: [], winner: null, numWinners,
    };
    await storageSet(gameId, STORAGE_KEY_HOT_POTATO, state);
    setSt(state);
  };

  const end = async () => {
    if (st) {
      await storageSet(gameId, STORAGE_KEY_HOT_POTATO, { ...st, active: false, phase: "ended" });
      setSt(null);
    }
  };

  const clear = async () => { await storageDelete(gameId, STORAGE_KEY_HOT_POTATO); setSt(null); };

  // Recommended pattern: on pause, snapshot each un-exploded potato's
  // remaining time so the countdown truly freezes instead of drifting.
  // On resume, recompute expiresAt from that snapshot.
  const pause = async () => {
    const r = await pauseChallenge(gameId, STORAGE_KEY_HOT_POTATO, (fresh, now) => {
      const remainingMsByTimerId = {};
      fresh.potatoes.forEach((pot) => { remainingMsByTimerId[pot.id] = pot.exploded ? 0 : Math.max(0, pot.expiresAt - now); });
      fresh.remainingMsByTimerId = remainingMsByTimerId;
    });
    if (r.ok) setSt(r.value);
  };

  const resume = async () => {
    const r = await resumeChallenge(gameId, STORAGE_KEY_HOT_POTATO, (fresh, pausedAt, now) => {
      fresh.potatoes.forEach((pot) => {
        if (!pot.exploded) pot.expiresAt = now + (fresh.remainingMsByTimerId?.[pot.id] ?? Math.max(0, pot.expiresAt - pausedAt));
      });
      fresh.remainingMsByTimerId = null;
    });
    if (r.ok) setSt(r.value);
  };

  if (loading) return <Card><p style={{ color: "#706050", fontStyle: "italic" }}>Loading...</p></Card>;

  if (!st) {
    return (
      <ChallengeSetupCard
        icon="🥔" title="Hot Potato" onStart={start} startLabel="Start (2 potatoes)"
        disabled={computeParticipants(participation, { alive, allPlayers, shieldedNames, returnedNames }).participants.length < 3}
        blurb="Two potatoes with secret 15–60 min timers pass between players. When a timer expires, the holder is eliminated and the potato is reassigned to a random survivor — it keeps going until only your target number of winners remain."
      >
        <ParticipantPicker
          alive={alive} allPlayers={allPlayers} shieldedNames={shieldedNames} returnedNames={returnedNames}
          value={participation} onChange={setParticipation}
        />
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14 }}>
          <span style={{ fontSize: 12, color: "#a09080" }}>Winners:</span>
          <button onClick={() => setNumWinners(Math.max(1, numWinners - 1))} style={{ width: 26, height: 26, borderRadius: 6, border: "1px solid #253550", background: "#0a1020", color: "#a09080", cursor: "pointer" }}>−</button>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#c9a84c", minWidth: 18, textAlign: "center" }}>{numWinners}</span>
          <button onClick={() => setNumWinners(numWinners + 1)} style={{ width: 26, height: 26, borderRadius: 6, border: "1px solid #253550", background: "#0a1020", color: "#a09080", cursor: "pointer" }}>+</button>
        </div>
      </ChallengeSetupCard>
    );
  }

  return (
    <Card style={{ borderColor: "rgba(196,92,60,0.3)" }}>
      <h3 style={{ color: "#f0e6d3", margin: "0 0 8px", fontSize: 14, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>🥔 Hot Potato</h3>
      {st.winner && <p style={{ color: "#c9a84c", fontSize: 13, marginBottom: 8 }}>🏆 {(Array.isArray(st.winner) ? st.winner : [st.winner]).join(", ")} survive{(Array.isArray(st.winner) ? st.winner.length : 1) === 1 ? "s" : ""}!</p>}
      {st.paused && <p style={{ color: "#c9a84c", fontSize: 12, marginBottom: 8, fontStyle: "italic" }}>⏸ Timers frozen — mission paused.</p>}
      {st.potatoes.map((pot) => {
        const msLeft = pot.exploded ? 0 : st.paused ? (st.remainingMsByTimerId?.[pot.id] ?? 0) : pot.expiresAt - Date.now();
        return (
          <div key={pot.id} style={{ display: "flex", justifyContent: "space-between", padding: "5px 8px", background: "#0a1020", borderRadius: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 13, color: "#f0e6d3" }}>
              🥔 Potato {pot.id}: {pot.exploded ? "💥 exploded" : pot.holder || "—"}
              {pot.timesReassigned > 0 && <span style={{ color: "#706050" }}> (reassigned {pot.timesReassigned}x)</span>}
            </span>
            <span style={{ fontSize: 13, color: msLeft < 60000 ? "#c45c3c" : "#a09080", fontFamily: "'Courier New', monospace" }}>{pot.exploded ? "—" : fmtTime(msLeft)}</span>
          </div>
        );
      })}
      {st.eliminated.length > 0 && <p style={{ fontSize: 12, color: "#706050", margin: "8px 0" }}>Eliminated: {st.eliminated.join(", ")} · Target winners: {st.numWinners || 1}</p>}
      <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
        <Btn variant="danger" onClick={end}>End</Btn>
        <Btn variant="ghost" small onClick={clear}>Clear</Btn>
        {!st.winner && <PauseResumeControls paused={!!st.paused} onPause={pause} onResume={resume} />}
        {st.winner && (
          <ArchiveResultsButton
            gameId={gameId} challengeId="hot-potato" challengeName="Hot Potato" round={null}
            participants={st.participants || st.players.map((p) => p.name)} spectators={st.spectators}
            winner={st.winner} resultSummary={`${(Array.isArray(st.winner) ? st.winner : [st.winner]).join(", ")} survived.`}
            finalState={st} startedAt={st.createdAt}
          />
        )}
      </div>
    </Card>
  );
}
