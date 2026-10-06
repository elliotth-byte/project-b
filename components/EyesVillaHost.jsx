import { useState, useEffect } from "react";
import { Btn, Card, ChallengeSetupCard, PauseResumeControls } from "./traitorsUi";
import { storageSet, storageDelete, subscribeGameState } from "../lib/gameStorage";
import { pauseChallenge, resumeChallenge } from "../lib/pauseResume";
import { STORAGE_KEY_EYES_VILLA, EYES_VILLA_ROUNDS, buildEyesVillaRounds, compareEyesVillaResults } from "../lib/eyesVillaData";
import { DEFAULT_PARTICIPATION, computeParticipants } from "../lib/challengeParticipants";
import ParticipantPicker from "./ParticipantPicker";
import ArchiveResultsButton from "./ArchiveResultsButton";

// ─── Eyes of the Villa: Host Control ───
export default function EyesVillaHost({ gameId, alive, allPlayers = [], shieldedNames = [], returnedNames = [] }) {
  const [st, setSt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [participation, setParticipation] = useState(DEFAULT_PARTICIPATION);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeGameState(gameId, STORAGE_KEY_EYES_VILLA, (value) => {
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
      rounds: buildEyesVillaRounds(), results: {},
    };
    await storageSet(gameId, STORAGE_KEY_EYES_VILLA, state);
    setSt(state);
  };

  const clear = async () => { await storageDelete(gameId, STORAGE_KEY_EYES_VILLA); setSt(null); };
  const pause = async () => { const r = await pauseChallenge(gameId, STORAGE_KEY_EYES_VILLA); if (r.ok) setSt(r.value); };
  const resume = async () => { const r = await resumeChallenge(gameId, STORAGE_KEY_EYES_VILLA); if (r.ok) setSt(r.value); };

  if (loading) return <Card><p style={{ color: "#706050", fontStyle: "italic" }}>Loading...</p></Card>;

  if (!st) {
    return (
      <ChallengeSetupCard
        icon="👁️" title="Eyes of the Villa" onStart={start} startLabel="Start Eyes of the Villa"
        disabled={computeParticipants(participation, { alive, allPlayers, shieldedNames, returnedNames }).participants.length === 0}
        blurb="Eight rounds — three galleries scattered with colored masquerade masks. Spot which gallery has the most of the called color before anyone else. Most correct wins; fastest breaks a tie."
      >
        <ParticipantPicker
          alive={alive} allPlayers={allPlayers} shieldedNames={shieldedNames} returnedNames={returnedNames}
          value={participation} onChange={setParticipation}
        />
      </ChallengeSetupCard>
    );
  }

  const finishedCount = Object.values(st.results || {}).filter((r) => (r.answers?.length || 0) >= EYES_VILLA_ROUNDS).length;
  const leaderboard = Object.entries(st.results || {})
    .map(([name, r]) => ({ name, ...r }))
    .sort(compareEyesVillaResults);

  return (
    <Card style={{ borderColor: "rgba(201,168,76,0.3)" }}>
      <h3 style={{ color: "#f0e6d3", margin: "0 0 8px", fontSize: 14, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>👁️ Eyes of the Villa</h3>
      <p style={{ fontSize: 12, color: "#a09080", margin: "0 0 10px" }}>Finished: {finishedCount}/{st.players.length}</p>
      {leaderboard.length === 0 ? (
        <p style={{ color: "#706050", fontSize: 12, fontStyle: "italic", marginBottom: 10 }}>No answers submitted yet.</p>
      ) : (
        <div style={{ display: "grid", gap: 3, marginBottom: 10 }}>
          {leaderboard.map((r, i) => (
            <div key={r.name} style={{ fontSize: 12, color: i === 0 ? "#c9a84c" : "#a09080", padding: "3px 0", display: "flex", justifyContent: "space-between" }}>
              <span>{i === 0 ? "🏆" : `${i + 1}.`} {r.name}</span>
              <span>{r.correctCount}/{EYES_VILLA_ROUNDS} · {(r.totalTimeMs / 1000).toFixed(1)}s</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Btn variant="ghost" small onClick={clear}>Clear</Btn>
        <PauseResumeControls paused={!!st.paused} onPause={pause} onResume={resume} />
        {leaderboard.length > 0 && (
          <ArchiveResultsButton
            gameId={gameId} challengeId="eyes-villa" challengeName="Eyes of the Villa" round={null}
            participants={st.participants || st.players.map((p) => p.name)} spectators={st.spectators}
            winner={leaderboard[0]?.name}
            resultSummary={`Leaderboard snapshot — ${finishedCount} finished. Leading: ${leaderboard[0] ? `${leaderboard[0].name} (${leaderboard[0].correctCount}/${EYES_VILLA_ROUNDS}, ${(leaderboard[0].totalTimeMs / 1000).toFixed(1)}s)` : "—"}.`}
            finalState={st} startedAt={st.createdAt}
          />
        )}
      </div>
    </Card>
  );
}
