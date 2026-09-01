import { useState, useEffect } from "react";
import { Btn, Card, ChallengeSetupCard, PauseResumeControls } from "./traitorsUi";
import { storageSet, storageUpdate, storageDelete, subscribeGameState } from "../lib/gameStorage";
import { pauseChallenge, resumeChallenge } from "../lib/pauseResume";
import { STORAGE_KEY_ATTACK_DEFEND } from "../lib/attackDefendData";
import { logChallengeResult } from "../lib/challengeHistory";
import { DEFAULT_PARTICIPATION, computeParticipants } from "../lib/challengeParticipants";
import ParticipantPicker from "./ParticipantPicker";
import ArchiveResultsButton from "./ArchiveResultsButton";

// ─── Attack / Defend: Host Control ───
export default function AttackDefendHost({ gameId, alive, allPlayers = [], shieldedNames = [], returnedNames = [] }) {
  const [st, setSt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [teamMode, setTeamMode] = useState("random"); // "random" | "manual"
  const [manualTeams, setManualTeams] = useState({});
  const [participation, setParticipation] = useState(DEFAULT_PARTICIPATION);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeGameState(gameId, STORAGE_KEY_ATTACK_DEFEND, (value) => {
      setSt(value);
      setLoading(false);
    });
    return unsubscribe;
  }, [gameId]);

  const assign = (name, team) => setManualTeams((prev) => ({ ...prev, [name]: prev[name] === team ? undefined : team }));
  const { participants, spectators } = computeParticipants(participation, { alive, allPlayers, shieldedNames, returnedNames });

  const start = async () => {
    let red, blue;
    if (teamMode === "manual") {
      red = participants.filter((p) => manualTeams[p.name] === "red").map((p) => p.name);
      blue = participants.filter((p) => manualTeams[p.name] === "blue").map((p) => p.name);
      if (red.length === 0 || blue.length === 0 || red.length + blue.length !== participants.length) {
        alert("Assign every participant to Red or Blue before starting.");
        return;
      }
    } else {
      const names = [...participants.map((p) => p.name)].sort(() => Math.random() - 0.5);
      const mid = Math.ceil(names.length / 2);
      red = names.slice(0, mid);
      blue = names.slice(mid);
    }
    const state = {
      active: true, createdAt: Date.now(), phase: "active",
      players: participants.map((p) => ({ id: p.id, name: p.name })),
      participants: participants.map((p) => p.name), spectators: spectators.map((p) => p.name),
      teams: { red, blue }, scores: { red: 0, blue: 0 },
      usedAttack: {}, usedDefend: {}, activeAttack: null, logs: [], winner: null,
    };
    await storageSet(gameId, STORAGE_KEY_ATTACK_DEFEND, state);
    setSt(state);
  };

  const end = async () => {
    const res = await storageUpdate(gameId, STORAGE_KEY_ATTACK_DEFEND, (fresh) => {
      if (!fresh) return null;
      fresh.active = false;
      fresh.phase = "ended";
      fresh.activeAttack = null;
      fresh.winner = fresh.scores.red === fresh.scores.blue ? "tie" : fresh.scores.red > fresh.scores.blue ? "red" : "blue";
      return fresh;
    });
    if (res.ok) {
      setSt(res.value);
      const winners = res.value.winner === "tie" ? [...res.value.teams.red, ...res.value.teams.blue] : res.value.teams[res.value.winner];
      logChallengeResult(gameId, { challenge: "Attack/Defend", winners, note: res.value.winner === "tie" ? "Tie" : `${res.value.winner} team (${res.value.scores[res.value.winner]} pts)` });
    }
  };

  const clear = async () => { await storageDelete(gameId, STORAGE_KEY_ATTACK_DEFEND); setSt(null); };
  const pause = async () => { const r = await pauseChallenge(gameId, STORAGE_KEY_ATTACK_DEFEND); if (r.ok) setSt(r.value); };
  const resume = async () => { const r = await resumeChallenge(gameId, STORAGE_KEY_ATTACK_DEFEND); if (r.ok) setSt(r.value); };

  if (loading) return <Card><p style={{ color: "#706050", fontStyle: "italic" }}>Loading...</p></Card>;

  if (!st) {
    return (
      <ChallengeSetupCard
        icon="⚔️" title="Attack / Defend" onStart={start} startLabel="Split Teams & Start"
        disabled={participants.length < 2}
        blurb="Two teams. Each player may ATTACK once (rack up clicks on a moving button) and DEFEND once (end an enemy's attack). Highest team score wins."
      >
        <ParticipantPicker
          alive={alive} allPlayers={allPlayers} shieldedNames={shieldedNames} returnedNames={returnedNames}
          value={participation} onChange={setParticipation}
        />
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          {["random", "manual"].map((m) => (
            <button key={m} onClick={() => setTeamMode(m)} style={{
              padding: "5px 12px", borderRadius: 6, fontSize: 12, cursor: "pointer",
              background: teamMode === m ? "rgba(201,168,76,0.15)" : "#0a1020",
              border: `1px solid ${teamMode === m ? "#c9a84c" : "#253550"}`, color: teamMode === m ? "#c9a84c" : "#a09080",
            }}>{m === "random" ? "🎲 Random Teams" : "✋ Choose Teams"}</button>
          ))}
        </div>
        {teamMode === "manual" && (
          <div style={{ display: "grid", gap: 4, marginBottom: 14, maxHeight: 220, overflowY: "auto" }}>
            {participants.map((p) => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#0a1020", borderRadius: 6, padding: "5px 8px" }}>
                <span style={{ fontSize: 12, color: "#f0e6d3" }}>{p.name}</span>
                <div style={{ display: "flex", gap: 4 }}>
                  <button onClick={() => assign(p.name, "red")} style={{
                    padding: "3px 10px", borderRadius: 5, fontSize: 11, cursor: "pointer",
                    background: manualTeams[p.name] === "red" ? "#c45c3c" : "#132038", border: "1px solid #c45c3c55",
                    color: manualTeams[p.name] === "red" ? "#fff" : "#c45c3c",
                  }}>Red</button>
                  <button onClick={() => assign(p.name, "blue")} style={{
                    padding: "3px 10px", borderRadius: 5, fontSize: 11, cursor: "pointer",
                    background: manualTeams[p.name] === "blue" ? "#4a7ac4" : "#132038", border: "1px solid #4a7ac455",
                    color: manualTeams[p.name] === "blue" ? "#fff" : "#7ab0f4",
                  }}>Blue</button>
                </div>
              </div>
            ))}
            <span style={{ fontSize: 11, color: "#706050" }}>
              Red: {participants.filter((p) => manualTeams[p.name] === "red").length} · Blue: {participants.filter((p) => manualTeams[p.name] === "blue").length} · Unassigned: {participants.filter((p) => !manualTeams[p.name]).length}
            </span>
          </div>
        )}
      </ChallengeSetupCard>
    );
  }

  return (
    <Card style={{ borderColor: "rgba(201,168,76,0.3)" }}>
      <h3 style={{ color: "#f0e6d3", margin: "0 0 8px", fontSize: 14, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>
        ⚔️ Attack / Defend {st.winner ? "— Over" : ""}
      </h3>
      <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
        {["red", "blue"].map((t) => (
          <div key={t} style={{ flex: 1, background: "#0a1020", borderRadius: 8, padding: 8, borderTop: `3px solid ${t === "red" ? "#c45c3c" : "#4a7ac4"}` }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: t === "red" ? "#c45c3c" : "#7ab0f4" }}>
              {t.toUpperCase()} — {st.scores[t]} pts{st.winner === t ? " 🏆" : ""}
            </div>
            <div style={{ fontSize: 11, color: "#a09080" }}>
              {st.teams[t].map((n) => `${n}${st.usedAttack[n] ? "⚔️" : ""}${st.usedDefend[n] ? "🛡️" : ""}`).join(", ")}
            </div>
          </div>
        ))}
      </div>
      {st.activeAttack && (
        <p style={{ fontSize: 12, color: "#c45c3c", marginBottom: 8 }}>
          🔴 {st.activeAttack.attacker} ({st.activeAttack.team}) is attacking! {st.activeAttack.points} clicks so far.
        </p>
      )}
      <div style={{ maxHeight: 80, overflowY: "auto", marginBottom: 8 }}>
        {(st.logs || []).slice(-6).reverse().map((l, i) => <div key={i} style={{ fontSize: 11, color: "#706050" }}>{l.text}</div>)}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {!st.winner && <Btn variant="danger" onClick={end}>End & Score</Btn>}
        <Btn variant="ghost" small onClick={clear}>Clear</Btn>
        {!st.winner && <PauseResumeControls paused={!!st.paused} onPause={pause} onResume={resume} />}
        {st.winner && (
          <ArchiveResultsButton
            gameId={gameId} challengeId="attack-defend" challengeName="Attack / Defend" round={null}
            participants={st.participants || st.players.map((p) => p.name)} spectators={st.spectators}
            winner={st.winner === "tie" ? [...st.teams.red, ...st.teams.blue] : st.teams[st.winner]}
            resultSummary={st.winner === "tie" ? "Tie." : `${st.winner} team won, ${st.scores[st.winner]} pts.`}
            finalState={st} startedAt={st.createdAt}
          />
        )}
      </div>
    </Card>
  );
}
