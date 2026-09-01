import { useState, useEffect } from "react";
import { Btn, Card, ChallengeSetupCard, PauseResumeControls } from "./traitorsUi";
import { storageSet, storageUpdate, storageDelete, subscribeGameState } from "../lib/gameStorage";
import { pauseChallenge, resumeChallenge } from "../lib/pauseResume";
import { STORAGE_KEY_CASINO } from "../lib/casinoData";
import { DEFAULT_PARTICIPATION, computeParticipants } from "../lib/challengeParticipants";
import ParticipantPicker from "./ParticipantPicker";
import ArchiveResultsButton from "./ArchiveResultsButton";

// ─── Casino: Host Control ───
export default function CasinoHost({ gameId, alive, allPlayers = [], shieldedNames = [], returnedNames = [] }) {
  const [st, setSt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [participation, setParticipation] = useState(DEFAULT_PARTICIPATION);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeGameState(gameId, STORAGE_KEY_CASINO, (value) => {
      setSt(value);
      setLoading(false);
    });
    return unsubscribe;
  }, [gameId]);

  const start = async () => {
    const { participants, spectators } = computeParticipants(participation, { alive, allPlayers, shieldedNames, returnedNames });
    const balances = {};
    participants.forEach((p) => balances[p.name] = 100);
    const state = {
      active: true, createdAt: Date.now(), phase: "active",
      players: participants.map((p) => ({ id: p.id, name: p.name })),
      participants: participants.map((p) => p.name), spectators: spectators.map((p) => p.name),
      balances, logs: [],
    };
    await storageSet(gameId, STORAGE_KEY_CASINO, state);
    setSt(state);
  };

  const reset = async () => {
    const res = await storageUpdate(gameId, STORAGE_KEY_CASINO, (fresh) => {
      if (!fresh) return null;
      Object.keys(fresh.balances).forEach((n) => (fresh.balances[n] = 100));
      fresh.logs = [];
      return fresh;
    });
    if (res.ok) setSt(res.value);
  };

  const end = async () => {
    const res = await storageUpdate(gameId, STORAGE_KEY_CASINO, (fresh) => {
      if (!fresh) return null;
      fresh.active = false;
      fresh.phase = "ended";
      return fresh;
    });
    if (res.ok) setSt(null);
  };

  const clear = async () => { await storageDelete(gameId, STORAGE_KEY_CASINO); setSt(null); };
  const pause = async () => { const r = await pauseChallenge(gameId, STORAGE_KEY_CASINO); if (r.ok) setSt(r.value); };
  const resume = async () => { const r = await resumeChallenge(gameId, STORAGE_KEY_CASINO); if (r.ok) setSt(r.value); };

  if (loading) return <Card><p style={{ color: "#706050", fontStyle: "italic" }}>Loading...</p></Card>;

  if (!st) {
    return (
      <ChallengeSetupCard
        icon="🎰" title="Casino" onStart={start} startLabel="Open the Casino"
        disabled={computeParticipants(participation, { alive, allPlayers, shieldedNames, returnedNames }).participants.length === 0}
        blurb="Every player starts with 100 tokens and gambles freely — Blackjack, Texas Hold 'Em, Roulette. Highest balance when the casino closes wins."
      >
        <ParticipantPicker
          alive={alive} allPlayers={allPlayers} shieldedNames={shieldedNames} returnedNames={returnedNames}
          value={participation} onChange={setParticipation}
        />
      </ChallengeSetupCard>
    );
  }

  const sorted = Object.entries(st.balances).sort((a, b) => b[1] - a[1]);

  return (
    <Card style={{ borderColor: "rgba(201,168,76,0.3)" }}>
      <h3 style={{ color: "#f0e6d3", margin: "0 0 10px", fontSize: 14, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>
        🎰 Casino — Open
      </h3>
      <div style={{ marginBottom: 10 }}>
        {sorted.map(([n, b], i) => (
          <div key={n} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: "1px solid #1a2845" }}>
            <span style={{ fontSize: 13, color: i === 0 ? "#c9a84c" : "#f0e6d3" }}>{i === 0 ? "🏆 " : `${i + 1}. `}{n}</span>
            <span style={{ fontSize: 13, color: b >= 100 ? "#7a9a5c" : "#c45c3c", fontFamily: "'Courier New', monospace" }}>{b} 🪙</span>
          </div>
        ))}
      </div>
      <div style={{ maxHeight: 120, overflowY: "auto", background: "#0a1020", borderRadius: 6, padding: 8, marginBottom: 10 }}>
        {(st.logs || []).slice(-12).reverse().map((l, i) => (
          <div key={i} style={{ fontSize: 11, color: "#a09080" }}>
            {l.player} · {l.game} · bet {l.bet} · <span style={{ color: l.delta >= 0 ? "#7a9a5c" : "#c45c3c" }}>{l.delta >= 0 ? "+" : ""}{l.delta}</span>
          </div>
        ))}
        {(!st.logs || st.logs.length === 0) && <span style={{ fontSize: 11, color: "#706050", fontStyle: "italic" }}>No plays yet.</span>}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <Btn variant="danger" onClick={end}>Close Casino</Btn>
        <Btn variant="ghost" small onClick={reset}>Reset Balances</Btn>
        <Btn variant="ghost" small onClick={clear}>Clear</Btn>
        <PauseResumeControls paused={!!st.paused} onPause={pause} onResume={resume} />
        {sorted.length > 0 && (
          <ArchiveResultsButton
            gameId={gameId} challengeId="casino" challengeName="Casino" round={null}
            participants={st.participants || st.players.map((p) => p.name)} spectators={st.spectators}
            winner={sorted[0]?.[0]} resultSummary={`Balance snapshot — top: ${sorted[0] ? `${sorted[0][0]} (${sorted[0][1]} tokens)` : "—"}.`}
            finalState={st} startedAt={st.createdAt}
          />
        )}
      </div>
    </Card>
  );
}
