import { useState, useEffect } from "react";
import { Btn, Card, ChallengeSetupCard, PauseResumeControls } from "./traitorsUi";
import { storageSet, storageDelete, subscribeGameState } from "../lib/gameStorage";
import { pauseChallenge, resumeChallenge } from "../lib/pauseResume";
import { COFFIN_LAYOUTS, STORAGE_KEY_COFFIN } from "../lib/coffinData";
import { DEFAULT_PARTICIPATION, computeParticipants } from "../lib/challengeParticipants";
import ParticipantPicker from "./ParticipantPicker";
import ArchiveResultsButton from "./ArchiveResultsButton";

// ─── Coffin Slide (Escape from the Crypt): Host Control ───
export default function CoffinHost({ gameId, alive, allPlayers = [], shieldedNames = [], returnedNames = [] }) {
  const [st, setSt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [difficulty, setDifficulty] = useState("medium");
  const [participation, setParticipation] = useState(DEFAULT_PARTICIPATION);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeGameState(gameId, STORAGE_KEY_COFFIN, (value) => {
      setSt(value);
      setLoading(false);
    });
    return unsubscribe;
  }, [gameId]);

  const startRound = async () => {
    const { participants, spectators } = computeParticipants(participation, { alive, allPlayers, shieldedNames, returnedNames });
    const state = {
      active: true, createdAt: Date.now(), times: {}, difficulty,
      players: participants.map((p) => ({ id: p.id, name: p.name })),
      participants: participants.map((p) => p.name), spectators: spectators.map((p) => p.name),
    };
    await storageSet(gameId, STORAGE_KEY_COFFIN, state);
    setSt(state);
  };

  const endRound = async () => { if (st) await storageSet(gameId, STORAGE_KEY_COFFIN, { ...st, active: false }); setSt(null); };
  const clearRound = async () => { await storageDelete(gameId, STORAGE_KEY_COFFIN); setSt(null); };
  const pause = async () => { const r = await pauseChallenge(gameId, STORAGE_KEY_COFFIN); if (r.ok) setSt(r.value); };
  const resume = async () => { const r = await resumeChallenge(gameId, STORAGE_KEY_COFFIN); if (r.ok) setSt(r.value); };

  if (loading) return <Card><p style={{ color: "#706050", fontStyle: "italic" }}>Loading...</p></Card>;

  if (!st || !st.active) {
    return (
      <ChallengeSetupCard
        icon="⚰️" title="Escape from the Crypt (Coffin Slide)" onStart={startRound} startLabel="Start Coffin Slide"
        disabled={computeParticipants(participation, { alive, allPlayers, shieldedNames, returnedNames }).participants.length === 0}
        blurb="A Rush Hour–style sliding puzzle, reskinned as coffins blocking the family crypt. Every player faces the identical layout — slide the rival coffins aside to clear a path and free the golden coffin. Fastest escape wins."
      >
        <ParticipantPicker
          alive={alive} allPlayers={allPlayers} shieldedNames={shieldedNames} returnedNames={returnedNames}
          value={participation} onChange={setParticipation}
        />
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          {Object.entries(COFFIN_LAYOUTS).map(([key, l]) => (
            <button key={key} onClick={() => setDifficulty(key)} style={{
              padding: "5px 12px", borderRadius: 6, fontSize: 12, cursor: "pointer",
              background: difficulty === key ? "rgba(201,168,76,0.15)" : "#0a1020",
              border: `1px solid ${difficulty === key ? "#c9a84c" : "#253550"}`, color: difficulty === key ? "#c9a84c" : "#a09080",
            }}>{l.label}</button>
          ))}
        </div>
      </ChallengeSetupCard>
    );
  }

  const sortedTimes = Object.entries(st.times || {}).sort((a, b) => a[1] - b[1]);

  return (
    <Card style={{ borderColor: "rgba(201,168,76,0.3)" }}>
      <h3 style={{ color: "#c9a84c", margin: "0 0 10px", fontSize: 15, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>
        ⚰️ Escape from the Crypt — Live ({COFFIN_LAYOUTS[st.difficulty || "medium"].label})
      </h3>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#a09080", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
        Leaderboard ({sortedTimes.length}/{(st.players || []).length} finished)
      </div>
      {sortedTimes.length === 0 ? (
        <p style={{ color: "#706050", fontSize: 12, fontStyle: "italic" }}>No escapes yet.</p>
      ) : (
        <div style={{ display: "grid", gap: 3 }}>
          {sortedTimes.map(([name, time], i) => (
            <div key={name} style={{ fontSize: 12, color: i === 0 ? "#c9a84c" : "#a09080", padding: "3px 0" }}>
              {i === 0 ? "🏆" : `${i + 1}.`} {name} — {(time / 1000).toFixed(2)}s
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
        <Btn variant="danger" onClick={endRound}>End Challenge</Btn>
        <Btn variant="ghost" onClick={clearRound} small>Clear</Btn>
        <PauseResumeControls paused={!!st.paused} onPause={pause} onResume={resume} />
        {sortedTimes.length > 0 && (
          <ArchiveResultsButton
            gameId={gameId} challengeId="coffin" challengeName="Escape from the Crypt (Coffin Slide)" round={null}
            participants={st.participants || st.players.map((p) => p.name)} spectators={st.spectators}
            winner={sortedTimes[0]?.[0]} resultSummary={`Leaderboard snapshot (${COFFIN_LAYOUTS[st.difficulty || "medium"].label}) — ${sortedTimes.length} finished. Fastest: ${sortedTimes[0] ? `${sortedTimes[0][0]} (${(sortedTimes[0][1] / 1000).toFixed(2)}s)` : "—"}.`}
            finalState={st} startedAt={st.createdAt}
          />
        )}
      </div>
    </Card>
  );
}
