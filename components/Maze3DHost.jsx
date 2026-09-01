import { useState, useEffect } from "react";
import { Btn, Card, Badge, ChallengeSetupCard, PauseResumeControls } from "./traitorsUi";
import { storageSet, storageDelete, subscribeGameState } from "../lib/gameStorage";
import { pauseChallenge, resumeChallenge } from "../lib/pauseResume";
import { STORAGE_KEY_MAZE3D } from "../lib/mazeData";
import { DEFAULT_PARTICIPATION, computeParticipants } from "../lib/challengeParticipants";
import ParticipantPicker from "./ParticipantPicker";
import ArchiveResultsButton from "./ArchiveResultsButton";

// ─── 3D Maze: Host Control ───
export default function Maze3DHost({ gameId, alive, allPlayers = [], shieldedNames = [], returnedNames = [] }) {
  const [st, setSt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [size, setSize] = useState(8);
  const [copied, setCopied] = useState(false);
  const [participation, setParticipation] = useState(DEFAULT_PARTICIPATION);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeGameState(gameId, STORAGE_KEY_MAZE3D, (value) => {
      setSt(value);
      setLoading(false);
    });
    return unsubscribe;
  }, [gameId]);

  const start = async () => {
    const { participants, spectators } = computeParticipants(participation, { alive, allPlayers, shieldedNames, returnedNames });
    const state = {
      active: true, createdAt: Date.now(), phase: "active",
      seed: Math.floor(Math.random() * 100000), rows: size, cols: size,
      players: participants.map((p) => ({ id: p.id, name: p.name })),
      participants: participants.map((p) => p.name), spectators: spectators.map((p) => p.name),
      times: {}, winner: null,
    };
    await storageSet(gameId, STORAGE_KEY_MAZE3D, state);
    setSt(state);
  };

  const end = async () => {
    if (st) { await storageSet(gameId, STORAGE_KEY_MAZE3D, { ...st, active: false, phase: "ended" }); setSt(null); }
  };
  const clear = async () => { await storageDelete(gameId, STORAGE_KEY_MAZE3D); setSt(null); };
  const pause = async () => { const r = await pauseChallenge(gameId, STORAGE_KEY_MAZE3D); if (r.ok) setSt(r.value); };
  const resume = async () => { const r = await resumeChallenge(gameId, STORAGE_KEY_MAZE3D); if (r.ok) setSt(r.value); };

  if (loading) return <Card><p style={{ color: "#706050", fontStyle: "italic" }}>Loading...</p></Card>;

  if (!st || !st.active) {
    return (
      <ChallengeSetupCard
        icon="🧭" title="3D Maze" onStart={start} startLabel="Start 3D Maze"
        disabled={computeParticipants(participation, { alive, allPlayers, shieldedNames, returnedNames }).participants.length === 0}
        blurb="Players navigate a first-person maze. Everyone gets the same maze; fastest escape wins."
      >
        <ParticipantPicker
          alive={alive} allPlayers={allPlayers} shieldedNames={shieldedNames} returnedNames={returnedNames}
          value={participation} onChange={setParticipation}
        />
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14 }}>
          <span style={{ color: "#a09080", fontSize: 12 }}>Difficulty:</span>
          {[6, 8, 10, 12].map((s) => (
            <button key={s} onClick={() => setSize(s)} style={{
              padding: "4px 12px", borderRadius: 6, fontSize: 12, cursor: "pointer",
              background: size === s ? "rgba(201,168,76,0.15)" : "#0a1020",
              border: `1px solid ${size === s ? "#c9a84c" : "#253550"}`, color: size === s ? "#c9a84c" : "#a09080",
            }}>{s}×{s}</button>
          ))}
        </div>
      </ChallengeSetupCard>
    );
  }

  const sorted = Object.entries(st.times || {}).sort((a, b) => a[1] - b[1]);

  return (
    <Card style={{ borderColor: "rgba(201,168,76,0.3)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ color: "#f0e6d3", margin: 0, fontSize: 14, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>🧭 3D Maze — Live</h3>
        <Badge color="#c9a84c">{st.rows}×{st.cols}</Badge>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: "#c9a84c", fontWeight: 600 }}>Leaderboard ({sorted.length}/{(st.players || []).length} finished)</span>
        {sorted.length > 0 && (
          <Btn small variant="ghost" onClick={() => {
            const t = "🧭 3D Maze Leaderboard\n" + sorted.map(([n, ms], i) => `${i === 0 ? "🏆" : `${i + 1}.`} ${n} — ${(ms / 1000).toFixed(2)}s`).join("\n");
            navigator.clipboard.writeText(t);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}>{copied ? "Copied!" : "📋 Copy"}</Btn>
        )}
      </div>
      {sorted.length === 0 ? (
        <p style={{ color: "#706050", fontSize: 12, fontStyle: "italic" }}>Waiting for players to escape...</p>
      ) : (
        <div style={{ marginBottom: 14 }}>
          {sorted.map(([n, ms], i) => (
            <div key={n} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #1a2845" }}>
              <span style={{ fontSize: 13, color: i === 0 ? "#c9a84c" : "#f0e6d3", fontWeight: i === 0 ? 700 : 400 }}>{i === 0 ? "🏆 " : `${i + 1}. `}{n}</span>
              <span style={{ fontSize: 13, color: "#a09080", fontFamily: "'Courier New', monospace" }}>{(ms / 1000).toFixed(2)}s</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <Btn variant="danger" onClick={end}>End</Btn>
        <Btn variant="ghost" small onClick={clear}>Clear</Btn>
        <PauseResumeControls paused={!!st.paused} onPause={pause} onResume={resume} />
        {sorted.length > 0 && (
          <ArchiveResultsButton
            gameId={gameId} challengeId="maze3d" challengeName="3D Maze" round={null}
            participants={st.participants || st.players.map((p) => p.name)} spectators={st.spectators}
            winner={sorted[0]?.[0]} resultSummary={`Leaderboard snapshot — ${sorted.length} finished. Fastest: ${sorted[0] ? `${sorted[0][0]} (${(sorted[0][1] / 1000).toFixed(2)}s)` : "—"}.`}
            finalState={st} startedAt={st.createdAt}
          />
        )}
      </div>
    </Card>
  );
}
