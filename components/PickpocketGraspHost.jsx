import { useState, useEffect } from "react";
import { Btn, Card, PauseResumeControls } from "./traitorsUi";
import { storageSet, storageUpdate, storageDelete, subscribeGameState } from "../lib/gameStorage";
import { pauseChallenge, resumeChallenge } from "../lib/pauseResume";
import { STORAGE_KEY_PICKPOCKET, PICKPOCKET_ROUND_COUNT, generateDeck } from "../lib/pickpocketGraspData";
import { DEFAULT_PARTICIPATION, computeParticipants } from "../lib/challengeParticipants";
import ParticipantPicker from "./ParticipantPicker";
import ArchiveResultsButton from "./ArchiveResultsButton";

// ─── The Pickpocket's Grasp: Host Control ───
// Same "generate once, store the shared deck, race against your own
// start time" shape as WordHost.jsx's Word Scramble — the deck itself
// (not each player's progress through it) is the one thing that has to
// be identical for everyone, so it's generated here, once, at start.
export default function PickpocketGraspHost({ gameId, alive, allPlayers = [], shieldedNames = [], returnedNames = [] }) {
  const [st, setSt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [participation, setParticipation] = useState(DEFAULT_PARTICIPATION);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeGameState(gameId, STORAGE_KEY_PICKPOCKET, (value) => {
      setSt(value);
      setLoading(false);
    });
    return unsubscribe;
  }, [gameId]);

  const start = async () => {
    const { participants, spectators } = computeParticipants(participation, { alive, allPlayers, shieldedNames, returnedNames });
    const state = {
      active: true, createdAt: Date.now(),
      deck: generateDeck(PICKPOCKET_ROUND_COUNT), times: {}, attempts: {},
      players: participants.map((p) => ({ id: p.id, name: p.name })),
      participants: participants.map((p) => p.name), spectators: spectators.map((p) => p.name),
    };
    await storageSet(gameId, STORAGE_KEY_PICKPOCKET, state);
    setSt(state);
  };

  const endChallenge = async () => {
    if (st) await storageSet(gameId, STORAGE_KEY_PICKPOCKET, { ...st, active: false });
    setSt(null);
  };
  const clear = async () => { await storageDelete(gameId, STORAGE_KEY_PICKPOCKET); setSt(null); };
  const pause = async () => { const r = await pauseChallenge(gameId, STORAGE_KEY_PICKPOCKET); if (r.ok) setSt(r.value); };
  const resume = async () => { const r = await resumeChallenge(gameId, STORAGE_KEY_PICKPOCKET); if (r.ok) setSt(r.value); };

  // Wipes ONE player's recorded time and bumps their `attempt` number.
  // The player view scopes its rules gate, local run state and durable
  // clock to createdAt:attempt, so that player gets the rules screen
  // again and a brand-new clock on "Go" — nobody else is touched. Any
  // submit still in flight from the old attempt is rejected player-side.
  const resetScore = async (name) => {
    if (typeof window !== "undefined" && !window.confirm(`Reset ${name}'s time? They'll get to play again from the start.`)) return;
    const res = await storageUpdate(gameId, STORAGE_KEY_PICKPOCKET, (fresh) => {
      if (!fresh) return null;
      const times = { ...(fresh.times || {}) };
      delete times[name];
      const attempts = { ...(fresh.attempts || {}) };
      attempts[name] = (attempts[name] || 0) + 1;
      return { ...fresh, times, attempts };
    });
    if (res?.value) setSt(res.value);
  };

  if (loading) return <Card><p style={{ color: "#706050", fontStyle: "italic" }}>Loading...</p></Card>;

  if (!st || !st.active) {
    return (
      <Card style={{ borderColor: "rgba(201,168,76,0.3)" }}>
        <h3 style={{ color: "#c9a84c", margin: "0 0 10px", fontSize: 15, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>
          🤌 The Pickpocket's Grasp — Setup
        </h3>
        <p style={{ color: "#a09080", fontSize: 12, margin: "0 0 12px" }}>
          8 cards, same deck for everyone: two of five stolen trinkets shown, each in some color. If one's shown in its own true color, grab it. If neither is, grab the trinket whose object AND true color are both missing. Fastest through all 8 wins; a wrong grab costs 2 seconds.
        </p>
        <ParticipantPicker
          alive={alive} allPlayers={allPlayers} shieldedNames={shieldedNames} returnedNames={returnedNames}
          value={participation} onChange={setParticipation}
        />
        <Btn onClick={start} disabled={computeParticipants(participation, { alive, allPlayers, shieldedNames, returnedNames }).participants.length === 0}>Start The Pickpocket's Grasp</Btn>
      </Card>
    );
  }

  const sortedTimes = Object.entries(st.times || {}).sort((a, b) => a[1] - b[1]);
  return (
    <Card style={{ borderColor: "rgba(201,168,76,0.3)" }}>
      <h3 style={{ color: "#c9a84c", margin: "0 0 10px", fontSize: 15, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>
        🤌 The Pickpocket's Grasp — Live
      </h3>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#a09080", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
        Leaderboard ({sortedTimes.length}/{st.players.length} finished)
      </div>
      {sortedTimes.length === 0 ? (
        <p style={{ color: "#706050", fontSize: 12, fontStyle: "italic" }}>No completions yet.</p>
      ) : (
        <div style={{ display: "grid", gap: 3 }}>
          {sortedTimes.map(([name, time], i) => (
            <div key={name} style={{ fontSize: 12, color: i === 0 ? "#c9a84c" : "#a09080", padding: "3px 0", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <span>{i === 0 ? "🏆" : `${i + 1}.`} {name} — {(time / 1000).toFixed(2)}s</span>
              <Btn variant="ghost" small onClick={() => resetScore(name)}>Reset</Btn>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
        <Btn variant="danger" onClick={endChallenge}>End Challenge</Btn>
        <Btn variant="ghost" onClick={clear} small>Clear</Btn>
        <PauseResumeControls paused={!!st.paused} onPause={pause} onResume={resume} />
        {sortedTimes.length > 0 && (
          <ArchiveResultsButton
            gameId={gameId} challengeId="pickpocket-grasp" challengeName="The Pickpocket's Grasp" round={null}
            participants={st.participants || st.players.map((p) => p.name)} spectators={st.spectators}
            winner={sortedTimes[0]?.[0]} resultSummary={`Leaderboard snapshot — ${sortedTimes.length} finished. Fastest: ${sortedTimes[0] ? `${sortedTimes[0][0]} (${(sortedTimes[0][1] / 1000).toFixed(2)}s)` : "—"}.`}
            finalState={st} startedAt={st.createdAt}
          />
        )}
      </div>
    </Card>
  );
}
