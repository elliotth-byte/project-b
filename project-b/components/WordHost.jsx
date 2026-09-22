import { useState, useEffect } from "react";
import { Btn, Card, PauseResumeControls } from "./traitorsUi";
import { storageSet, storageDelete, subscribeGameState } from "../lib/gameStorage";
import { pauseChallenge, resumeChallenge } from "../lib/pauseResume";
import { STORAGE_KEY_WORDS } from "../lib/wordGameData";
import { DEFAULT_PARTICIPATION, computeParticipants } from "../lib/challengeParticipants";
import ParticipantPicker from "./ParticipantPicker";
import ArchiveResultsButton from "./ArchiveResultsButton";

// Was: startWordScrambleRound(alivePlayers) writing to window.storage.
// Now: same shape, just needs a gameId to know which game's row to write.
// `spectators` is optional so any other caller passing just (gameId, players)
// keeps working exactly as before.
export async function startWordScrambleRound(gameId, participantPlayers, spectatorPlayers = []) {
  const state = {
    active: true,
    createdAt: Date.now(),
    seed: Date.now(),
    times: {},
    players: participantPlayers.map((p) => ({ id: p.id, name: p.name })),
    participants: participantPlayers.map((p) => p.name),
    spectators: spectatorPlayers.map((p) => p.name),
  };
  await storageSet(gameId, STORAGE_KEY_WORDS, state);
  return state;
}

// ─── Word Scramble: Host Control ───
// Only real changes from the original: gameId threaded through, and the
// setInterval polling loop replaced with subscribeGameState (realtime).
export default function WordHost({ gameId, alive, allPlayers = [], shieldedNames = [], returnedNames = [] }) {
  const [wordState, setWordState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [participation, setParticipation] = useState(DEFAULT_PARTICIPATION);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeGameState(gameId, STORAGE_KEY_WORDS, (value) => {
      setWordState(value);
      setLoading(false);
    });
    return unsubscribe;
  }, [gameId]);

  const startRound = async () => {
    const { participants, spectators } = computeParticipants(participation, { alive, allPlayers, shieldedNames, returnedNames });
    const state = await startWordScrambleRound(gameId, participants, spectators);
    setWordState(state);
  };

  const endRound = async () => {
    if (wordState) await storageSet(gameId, STORAGE_KEY_WORDS, { ...wordState, active: false });
    setWordState(null);
  };
  const clearRound = async () => { await storageDelete(gameId, STORAGE_KEY_WORDS); setWordState(null); };
  const pause = async () => { const r = await pauseChallenge(gameId, STORAGE_KEY_WORDS); if (r.ok) setWordState(r.value); };
  const resume = async () => { const r = await resumeChallenge(gameId, STORAGE_KEY_WORDS); if (r.ok) setWordState(r.value); };

  if (loading) return <Card><p style={{ color: "#706050", fontStyle: "italic" }}>Loading...</p></Card>;

  if (!wordState || !wordState.active) {
    return (
      <Card style={{ borderColor: "rgba(201,168,76,0.3)" }}>
        <h3 style={{ color: "#c9a84c", margin: "0 0 10px", fontSize: 15, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>
          🔤 Word Scramble — Setup
        </h3>
        <p style={{ color: "#a09080", fontSize: 12, margin: "0 0 12px" }}>
          Each player gets a different set of 7 color-coded words, each in its own font, with letters floating on screen. Unscramble all 7 to win. Answers can't be shared between players.
        </p>
        <ParticipantPicker
          alive={alive} allPlayers={allPlayers} shieldedNames={shieldedNames} returnedNames={returnedNames}
          value={participation} onChange={setParticipation}
        />
        <Btn onClick={startRound} disabled={computeParticipants(participation, { alive, allPlayers, shieldedNames, returnedNames }).participants.length === 0}>Start Word Scramble</Btn>
        {(!alive || alive.length === 0) && (
          <p style={{ color: "#c45c3c", fontSize: 11, marginTop: 8 }}>No players in this game yet.</p>
        )}
      </Card>
    );
  }

  const sortedTimes = Object.entries(wordState.times || {}).sort((a, b) => a[1] - b[1]);
  return (
    <Card style={{ borderColor: "rgba(201,168,76,0.3)" }}>
      <h3 style={{ color: "#c9a84c", margin: "0 0 10px", fontSize: 15, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>
        🔤 Word Scramble — Live
      </h3>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#a09080", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
        Leaderboard ({sortedTimes.length}/{(wordState.players || []).length} finished)
      </div>
      {sortedTimes.length === 0 ? (
        <p style={{ color: "#706050", fontSize: 12, fontStyle: "italic" }}>No completions yet.</p>
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
        <PauseResumeControls paused={!!wordState.paused} onPause={pause} onResume={resume} />
        {sortedTimes.length > 0 && (
          <ArchiveResultsButton
            gameId={gameId} challengeId="word-scramble" challengeName="Word Scramble" round={null}
            participants={wordState.participants || wordState.players.map((p) => p.name)} spectators={wordState.spectators}
            winner={sortedTimes[0]?.[0]} resultSummary={`Leaderboard snapshot — ${sortedTimes.length} finished. Fastest: ${sortedTimes[0] ? `${sortedTimes[0][0]} (${(sortedTimes[0][1] / 1000).toFixed(2)}s)` : "—"}.`}
            finalState={wordState} startedAt={wordState.createdAt}
          />
        )}
      </div>
    </Card>
  );
}
