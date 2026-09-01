import { useState, useEffect } from "react";
import { Btn, Card, ChallengeSetupCard, PauseResumeControls } from "./traitorsUi";
import { storageSet, storageDelete, subscribeGameState } from "../lib/gameStorage";
import { pauseChallenge, resumeChallenge } from "../lib/pauseResume";
import { DOLL_LABELS, buildLimbMap, STORAGE_KEY_VOODOO } from "../lib/voodooData";
import { DEFAULT_PARTICIPATION, computeParticipants } from "../lib/challengeParticipants";
import ParticipantPicker from "./ParticipantPicker";
import ArchiveResultsButton from "./ArchiveResultsButton";

// ─── Voodoo Doll: Host Control ───
export default function VoodooHost({ gameId, alive, allPlayers = [], shieldedNames = [], returnedNames = [] }) {
  const [st, setSt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [eulogies, setEulogies] = useState({});
  const [reveal, setReveal] = useState(false);
  const [numWinners, setNumWinners] = useState(1);
  const [participation, setParticipation] = useState(DEFAULT_PARTICIPATION);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeGameState(gameId, STORAGE_KEY_VOODOO, (value) => {
      setSt(value);
      setLoading(false);
    });
    return unsubscribe;
  }, [gameId]);

  const { participants: pool, spectators: pickerSpectators } = computeParticipants(participation, { alive, allPlayers, shieldedNames, returnedNames });

  useEffect(() => {
    const init = {};
    pool.forEach((p) => init[p.name] = eulogies[p.name] || "");
    setEulogies((e) => ({ ...init, ...e }));
  }, [pool.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async () => {
    const filled = pool.filter((p) => (eulogies[p.name] || "").trim().length > 0);
    if (filled.length < 2) { alert("Enter eulogies for at least 2 participants."); return; }
    if (numWinners >= filled.length) { alert("Winner count must be less than the number of dolls."); return; }
    const shuffled = [...filled].sort(() => Math.random() - 0.5);
    const dolls = shuffled.map((p, i) => {
      const eulogy = eulogies[p.name].trim();
      return {
        dollId: DOLL_LABELS[i], owner: p.name, eulogy,
        limbMap: buildLimbMap(eulogy), prickedLimbs: [], revealedIndices: [], fullyRevealed: false,
      };
    });
    const noEulogy = pool.filter((p) => !filled.some((f) => f.name === p.name));
    const spectators = [...pickerSpectators, ...noEulogy].map((p) => p.name);
    const state = {
      active: true, createdAt: Date.now(), phase: "active",
      players: filled.map((p) => ({ id: p.id, name: p.name })),
      participants: filled.map((p) => p.name), spectators,
      dolls, eliminated: [], guesses: {}, guessCooldownUntil: {}, lastRevealAt: {},
      winner: null, numWinners,
    };
    await storageSet(gameId, STORAGE_KEY_VOODOO, state);
    setSt(state);
  };

  const clear = async () => { await storageDelete(gameId, STORAGE_KEY_VOODOO); setSt(null); };
  const pause = async () => { const r = await pauseChallenge(gameId, STORAGE_KEY_VOODOO); if (r.ok) setSt(r.value); };

  // Shift each player's last-reveal and guess-cooldown timestamps forward
  // by the pause duration so both freeze instead of ticking away unseen.
  const resume = async () => {
    const r = await resumeChallenge(gameId, STORAGE_KEY_VOODOO, (fresh, pausedAt, now) => {
      const delta = now - pausedAt;
      const shift = (obj) => {
        const out = {};
        Object.entries(obj || {}).forEach(([k, v]) => { out[k] = v + delta; });
        return out;
      };
      fresh.lastRevealAt = shift(fresh.lastRevealAt);
      fresh.guessCooldownUntil = shift(fresh.guessCooldownUntil);
    });
    if (r.ok) setSt(r.value);
  };

  if (loading) return <Card><p style={{ color: "#706050", fontStyle: "italic" }}>Loading...</p></Card>;

  if (!st) {
    return (
      <ChallengeSetupCard
        icon="🪆" title="Voodoo Doll" onStart={start} startLabel="Start Voodoo Challenge"
        blurb="Anonymous voodoo dolls hold each player's eulogy. Once an hour, prick one of a doll's 5 limbs to reveal its letters — once any player pricks a limb, it's used up for everyone. One guess at a doll's owner; guess right and you get an immediate follow-up guess. Last standing wins."
      >
        <ParticipantPicker
          alive={alive} allPlayers={allPlayers} shieldedNames={shieldedNames} returnedNames={returnedNames}
          value={participation} onChange={setParticipation}
        />
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: "#a09080" }}>Winners:</span>
          <button onClick={() => setNumWinners(Math.max(1, numWinners - 1))} style={{ width: 26, height: 26, borderRadius: 6, border: "1px solid #253550", background: "#0a1020", color: "#a09080", cursor: "pointer" }}>−</button>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#c9a84c", minWidth: 18, textAlign: "center" }}>{numWinners}</span>
          <button onClick={() => setNumWinners(numWinners + 1)} style={{ width: 26, height: 26, borderRadius: 6, border: "1px solid #253550", background: "#0a1020", color: "#a09080", cursor: "pointer" }}>+</button>
        </div>
        <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
          {pool.map((p) => (
            <div key={p.id}>
              <div style={{ fontSize: 11, color: "#a09080", marginBottom: 2 }}>{p.name}'s eulogy</div>
              <textarea
                rows={2} value={eulogies[p.name] || ""}
                onChange={(e) => setEulogies({ ...eulogies, [p.name]: e.target.value })}
                placeholder="Write their eulogy..."
                style={{ width: "100%", background: "#0a1020", border: "1px solid #253550", borderRadius: 6, padding: "6px 8px", color: "#f0e6d3", fontSize: 12, resize: "vertical", boxSizing: "border-box" }}
              />
            </div>
          ))}
        </div>
      </ChallengeSetupCard>
    );
  }

  const remaining = st.players.filter((p) => !st.eliminated.includes(p.name));

  return (
    <Card style={{ borderColor: "rgba(124,58,237,0.3)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ color: "#f0e6d3", margin: 0, fontSize: 14, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>🪆 Voodoo Doll</h3>
        <Btn small variant="ghost" onClick={() => setReveal(!reveal)}>{reveal ? "Hide" : "Show"} Owners</Btn>
      </div>
      {st.winner ? (
        <p style={{ color: "#c9a84c", fontSize: 13, marginBottom: 8 }}>🏆 {(Array.isArray(st.winner) ? st.winner : [st.winner]).join(", ")} — last standing!</p>
      ) : (
        <p style={{ fontSize: 13, color: "#a09080", margin: "0 0 8px" }}>Remaining: {remaining.length} (target winners: {st.numWinners || 1}) · Eliminated: {st.eliminated.length}</p>
      )}
      <div style={{ display: "grid", gap: 4, marginBottom: 10 }}>
        {st.dolls.map((d) => (
          <div key={d.dollId} style={{ fontSize: 12, display: "flex", justifyContent: "space-between", padding: "3px 8px", background: "#0a1020", borderRadius: 6 }}>
            <span style={{ color: st.eliminated.includes(d.owner) ? "#706050" : "#f0e6d3", textDecoration: st.eliminated.includes(d.owner) ? "line-through" : "none" }}>
              Doll {d.dollId}{(reveal || st.eliminated.includes(d.owner)) ? ` → ${d.owner}` : ""}
            </span>
            <span style={{ color: "#a09080" }}>{(d.prickedLimbs || []).length}/5 limbs pricked</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Btn variant="ghost" small onClick={clear}>Clear</Btn>
        {!st.winner && <PauseResumeControls paused={!!st.paused} onPause={pause} onResume={resume} />}
        {st.winner && (
          <ArchiveResultsButton
            gameId={gameId} challengeId="voodoo" challengeName="Voodoo Doll" round={null}
            participants={st.participants || st.players.map((p) => p.name)} spectators={st.spectators}
            winner={st.winner} resultSummary={`${(Array.isArray(st.winner) ? st.winner : [st.winner]).join(", ")} — last standing.`}
            finalState={st} startedAt={st.createdAt}
          />
        )}
      </div>
    </Card>
  );
}
