import { useState, useEffect } from "react";
import { Btn, Card, ChallengeSetupCard, PauseResumeControls } from "./traitorsUi";
import { storageSet, storageUpdate, storageDelete, subscribeGameState } from "../lib/gameStorage";
import { pauseChallenge, resumeChallenge } from "../lib/pauseResume";
import { STORAGE_KEY_PIGGY } from "../lib/piggyData";
import { logChallengeResult } from "../lib/challengeHistory";
import { DEFAULT_PARTICIPATION, computeParticipants } from "../lib/challengeParticipants";
import ParticipantPicker from "./ParticipantPicker";
import ArchiveResultsButton from "./ArchiveResultsButton";

// ─── Piggy Bank: Host Control ───
export default function PiggyHost({ gameId, alive, allPlayers = [], shieldedNames = [], returnedNames = [] }) {
  const [st, setSt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [numWinners, setNumWinners] = useState(1);
  const [participation, setParticipation] = useState(DEFAULT_PARTICIPATION);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeGameState(gameId, STORAGE_KEY_PIGGY, (value) => {
      setSt(value);
      setLoading(false);
    });
    return unsubscribe;
  }, [gameId]);

  const start = async () => {
    const { participants, spectators } = computeParticipants(participation, { alive, allPlayers, shieldedNames, returnedNames });
    const state = {
      active: true, createdAt: Date.now(), phase: "active",
      players: participants.map((p) => ({ id: p.id, name: p.name })),
      participants: participants.map((p) => p.name), spectators: spectators.map((p) => p.name),
      allocations: {}, submitted: [], revealed: false, totals: {}, overfed: [], winners: [], numWinners,
    };
    await storageSet(gameId, STORAGE_KEY_PIGGY, state);
    setSt(state);
  };

  // Atomic — reveal reads the freshest allocations rather than trusting
  // whatever the host's own local `st` happened to hold at click time.
  const reveal = async () => {
    const res = await storageUpdate(gameId, STORAGE_KEY_PIGGY, (fresh) => {
      if (!fresh) return null;
      const totals = {};
      const contributors = {}; // receiver -> [{from, amount}]
      fresh.players.forEach((p) => { totals[p.name] = 0; contributors[p.name] = []; });
      Object.entries(fresh.allocations).forEach(([giver, alloc]) => {
        Object.entries(alloc).forEach(([target, n]) => {
          totals[target] = (totals[target] || 0) + n;
          contributors[target] = contributors[target] || [];
          contributors[target].push({ from: giver, amount: n });
        });
      });
      const overfed = Object.keys(totals).filter((n) => totals[n] > 20);
      const eligible = Object.keys(totals).filter((n) => totals[n] <= 20);
      // Top-N with ties: if the Nth-highest value is tied, everyone tied at
      // that value counts as a winner too, rather than an arbitrary cutoff.
      let winners = [];
      if (eligible.length) {
        const n = Math.max(1, fresh.numWinners || 1);
        const sorted = [...eligible].sort((a, b) => totals[b] - totals[a]);
        const threshold = totals[sorted[Math.min(n, sorted.length) - 1]];
        winners = eligible.filter((name) => totals[name] >= threshold);
      }
      fresh.totals = totals;
      fresh.contributors = contributors;
      fresh.overfed = overfed;
      fresh.winners = winners;
      fresh.revealed = true;
      fresh.phase = "ended";
      return fresh;
    });
    if (res.ok) {
      setSt(res.value);
      if (res.value.winners.length > 0) logChallengeResult(gameId, { challenge: "Piggy Bank", winners: res.value.winners });
    }
  };

  const clear = async () => { await storageDelete(gameId, STORAGE_KEY_PIGGY); setSt(null); };
  const pause = async () => { const r = await pauseChallenge(gameId, STORAGE_KEY_PIGGY); if (r.ok) setSt(r.value); };
  const resume = async () => { const r = await resumeChallenge(gameId, STORAGE_KEY_PIGGY); if (r.ok) setSt(r.value); };

  if (loading) return <Card><p style={{ color: "#706050", fontStyle: "italic" }}>Loading...</p></Card>;

  if (!st) {
    return (
      <ChallengeSetupCard
        icon="🐷" title="Piggy Bank" onStart={start} startLabel="Start Piggy Bank"
        disabled={computeParticipants(participation, { alive, allPlayers, shieldedNames, returnedNames }).participants.length < 3}
        blurb="Each player secretly spreads 13 coins across at least two banks (their own counts too). Closest to 20 without going over wins — overfed banks (>20) are disqualified."
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
    <Card style={{ borderColor: "rgba(201,168,76,0.3)" }}>
      <h3 style={{ color: "#f0e6d3", margin: "0 0 8px", fontSize: 14, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>🐷 Piggy Bank</h3>
      <p style={{ fontSize: 13, color: "#a09080", margin: "0 0 10px" }}>Submitted: {st.submitted.length}/{st.players.length}</p>
      {st.revealed ? (
        <div style={{ marginBottom: 10 }}>
          {Object.entries(st.totals).sort((a, b) => b[1] - a[1]).map(([n, t]) => {
            const over = st.overfed.includes(n), win = st.winners.includes(n);
            const givers = st.contributors?.[n] || [];
            return (
              <div key={n} style={{ padding: "6px 0", borderBottom: "1px solid #1a2845" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13, color: win ? "#c9a84c" : over ? "#c45c3c" : "#f0e6d3" }}>{win ? "🏆 " : over ? "💥 " : ""}{n}</span>
                  <span style={{ fontSize: 13, color: "#a09080" }}>{t} coins {over ? "(overfed)" : ""}</span>
                </div>
                {givers.length > 0 && (
                  <div style={{ fontSize: 11, color: "#706050", marginTop: 2 }}>
                    {givers.map((g, i) => `${g.from} → ${g.amount}${g.from === n ? " (self)" : ""}`).join(", ")}
                  </div>
                )}
              </div>
            );
          })}
          {st.winners.length > 0 && <p style={{ color: "#c9a84c", fontSize: 13, marginTop: 8 }}>Winner{st.winners.length > 1 ? "s" : ""}: {st.winners.join(", ")}</p>}
        </div>
      ) : (
        <p style={{ fontSize: 12, color: "#706050", fontStyle: "italic", marginBottom: 10 }}>Allocations hidden until reveal.</p>
      )}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {!st.revealed && <Btn onClick={reveal}>Reveal Totals</Btn>}
        <Btn variant="ghost" small onClick={clear}>Clear</Btn>
        {!st.revealed && <PauseResumeControls paused={!!st.paused} onPause={pause} onResume={resume} />}
        {st.revealed && (
          <ArchiveResultsButton
            gameId={gameId} challengeId="piggy" challengeName="Piggy Bank" round={null}
            participants={st.participants || st.players.map((p) => p.name)} spectators={st.spectators}
            winner={st.winners} resultSummary={st.winners.length ? `Winner(s): ${st.winners.join(", ")}.` : "No eligible winner."}
            finalState={st} startedAt={st.createdAt}
          />
        )}
      </div>
    </Card>
  );
}
