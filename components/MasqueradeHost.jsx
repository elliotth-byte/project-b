import { useState, useEffect } from "react";
import { Btn, Card, ChallengeSetupCard, PauseResumeControls } from "./traitorsUi";
import { storageSet, storageDelete, subscribeGameState } from "../lib/gameStorage";
import { pauseChallenge, resumeChallenge } from "../lib/pauseResume";
import { HOUSE_NAMES, STORAGE_KEY_MASQUERADE } from "../lib/masqueradeData";
import { DEFAULT_PARTICIPATION, computeParticipants } from "../lib/challengeParticipants";
import ParticipantPicker from "./ParticipantPicker";
import ArchiveResultsButton from "./ArchiveResultsButton";

// ─── Masquerade Houses: Host Control ───
export default function MasqueradeHost({ gameId, alive, allPlayers = [], shieldedNames = [], returnedNames = [] }) {
  const [st, setSt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [houseSize, setHouseSize] = useState(5);
  const [numHousesOverride, setNumHousesOverride] = useState(null);
  const [participation, setParticipation] = useState(DEFAULT_PARTICIPATION);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeGameState(gameId, STORAGE_KEY_MASQUERADE, (value) => {
      setSt(value);
      setLoading(false);
    });
    return unsubscribe;
  }, [gameId]);

  const { participants: pool, spectators: pickerSpectators } = computeParticipants(participation, { alive, allPlayers, shieldedNames, returnedNames });
  const maxHouses = Math.max(0, Math.floor(pool.length / houseSize));
  const numHouses = numHousesOverride ? Math.max(2, Math.min(numHousesOverride, maxHouses)) : maxHouses;

  const start = async () => {
    const names = [...pool.map((p) => p.name)].sort(() => Math.random() - 0.5);
    if (numHouses < 2) { alert(`Need at least ${houseSize * 2} participants for house size ${houseSize}.`); return; }
    const houses = [];
    for (let i = 0; i < numHouses; i++) {
      houses.push({
        id: `h${i}`, name: HOUSE_NAMES[i % HOUSE_NAMES.length],
        members: names.slice(i * houseSize, i * houseSize + houseSize),
        status: "active", resolvedAt: null,
      });
    }
    const assigned = new Set(houses.flatMap((h) => h.members));
    const spectators = [...names.filter((n) => !assigned.has(n)), ...pickerSpectators.map((p) => p.name)];
    const state = {
      active: true, createdAt: Date.now(), phase: "active",
      players: pool.map((p) => ({ id: p.id, name: p.name })),
      participants: [...assigned], spectators,
      houseSize, houses, guesses: {}, resolvedOrder: [], maxResolved: 3,
    };
    await storageSet(gameId, STORAGE_KEY_MASQUERADE, state);
    setSt(state);
  };

  const clear = async () => { await storageDelete(gameId, STORAGE_KEY_MASQUERADE); setSt(null); };
  const pause = async () => { const r = await pauseChallenge(gameId, STORAGE_KEY_MASQUERADE); if (r.ok) setSt(r.value); };
  const resume = async () => { const r = await resumeChallenge(gameId, STORAGE_KEY_MASQUERADE); if (r.ok) setSt(r.value); };

  if (loading) return <Card><p style={{ color: "#706050", fontStyle: "italic" }}>Loading...</p></Card>;

  if (!st) {
    return (
      <ChallengeSetupCard
        icon="🎭" title="Masquerade Houses" onStart={start} startLabel="Split Houses & Start"
        disabled={numHouses < 2}
        blurb="Players are split into secret Italian houses for the masquerade. Each gets one SHIELD guess (name your own house) and one KILLER guess (name a rival house). First three houses resolved — shielded or eliminated — end the mission."
      >
        <ParticipantPicker
          alive={alive} allPlayers={allPlayers} shieldedNames={shieldedNames} returnedNames={returnedNames}
          value={participation} onChange={setParticipation}
        />
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "#a09080" }}>House size:</span>
          {[3, 4, 5].map((s) => (
            <button key={s} onClick={() => { setHouseSize(s); setNumHousesOverride(null); }} style={{
              padding: "4px 12px", borderRadius: 6, fontSize: 12, cursor: "pointer",
              background: houseSize === s ? "rgba(201,168,76,0.15)" : "#0a1020",
              border: `1px solid ${houseSize === s ? "#c9a84c" : "#253550"}`, color: houseSize === s ? "#c9a84c" : "#a09080",
            }}>{s}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "#a09080" }}>Number of houses:</span>
          <button onClick={() => setNumHousesOverride(Math.max(2, (numHousesOverride ?? maxHouses) - 1))} disabled={numHouses <= 2} style={{ width: 26, height: 26, borderRadius: 6, border: "1px solid #253550", background: "#0a1020", color: "#a09080", cursor: "pointer" }}>−</button>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#c9a84c", minWidth: 18, textAlign: "center" }}>{numHouses}</span>
          <button onClick={() => setNumHousesOverride(Math.min(maxHouses, (numHousesOverride ?? maxHouses) + 1))} disabled={numHouses >= maxHouses} style={{ width: 26, height: 26, borderRadius: 6, border: "1px solid #253550", background: "#0a1020", color: "#a09080", cursor: "pointer" }}>+</button>
          {numHousesOverride !== null && <Btn variant="ghost" small onClick={() => setNumHousesOverride(null)}>Auto (max {maxHouses})</Btn>}
          <span style={{ fontSize: 11, color: "#706050" }}>{HOUSE_NAMES.slice(0, numHouses).join(", ")}</span>
        </div>
      </ChallengeSetupCard>
    );
  }

  const done = st.resolvedOrder.length >= st.maxResolved;

  return (
    <Card style={{ borderColor: "rgba(124,58,237,0.3)" }}>
      <h3 style={{ color: "#f0e6d3", margin: "0 0 8px", fontSize: 14, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>
        🎭 Masquerade Houses {done ? "— Mission Over" : ""}
      </h3>
      {st.houses.map((h) => (
        <div key={h.id} style={{ padding: "5px 8px", background: "#0a1020", borderRadius: 6, marginBottom: 4 }}>
          <div style={{ fontSize: 13, color: h.status === "shielded" ? "#7a9a5c" : h.status === "eliminated" ? "#c45c3c" : "#f0e6d3" }}>
            {h.status === "shielded" ? "🛡️ " : h.status === "eliminated" ? "💀 " : ""}House {h.name} — {h.status}
          </div>
          <div style={{ fontSize: 11, color: "#a09080" }}>{h.members.join(", ")}</div>
        </div>
      ))}
      <p style={{ fontSize: 12, color: "#a09080", margin: "8px 0" }}>
        Guesses submitted: {Object.keys(st.guesses).length}/{st.players.length} · Resolved: {st.resolvedOrder.length}/{st.maxResolved}
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Btn variant="ghost" small onClick={clear}>Clear</Btn>
        {!done && <PauseResumeControls paused={!!st.paused} onPause={pause} onResume={resume} />}
        {done && (
          <ArchiveResultsButton
            gameId={gameId} challengeId="masquerade" challengeName="Masquerade Houses" round={null}
            participants={st.participants || st.players.map((p) => p.name)} spectators={st.spectators}
            winner={st.houses.filter((h) => h.status === "shielded").flatMap((h) => h.members)}
            resultSummary={st.houses.map((h) => `House ${h.name}: ${h.status}`).join("; ")}
            finalState={st} startedAt={st.createdAt}
          />
        )}
      </div>
    </Card>
  );
}
