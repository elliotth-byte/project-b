import { useState, useEffect } from "react";
import { Btn, Card, Badge, ChallengeSetupCard, PauseResumeControls } from "./traitorsUi";
import { storageSet, storageUpdate, storageDelete, subscribeGameState } from "../lib/gameStorage";
import { pauseChallenge, resumeChallenge } from "../lib/pauseResume";
import { STORAGE_KEY_ICEBREAKER } from "../lib/icebreakerData";
import { DEFAULT_PARTICIPATION, computeParticipants } from "../lib/challengeParticipants";
import ParticipantPicker from "./ParticipantPicker";
import ArchiveResultsButton from "./ArchiveResultsButton";

// ─── Icebreaker: Host Control ───
// The three phase-advance actions (openAnswers/startGuessing/revealQuestion)
// used a plain read-then-write in the original; here they go through
// storageUpdate instead, so the host clicking "advance phase" can't race
// against a player's own concurrent submission.
export default function IcebreakerHost({ gameId, alive, allPlayers = [], shieldedNames = [], returnedNames = [] }) {
  const [st, setSt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [participation, setParticipation] = useState(DEFAULT_PARTICIPATION);
  const [showSubmissions, setShowSubmissions] = useState(false);
  const [editingQ, setEditingQ] = useState(null); // player name currently being edited
  const [qDraft, setQDraft] = useState("");
  const [editingA, setEditingA] = useState(null); // `${owner}::${questionOwner}` currently being edited
  const [aDraft, setADraft] = useState("");

  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeGameState(gameId, STORAGE_KEY_ICEBREAKER, (value) => {
      setSt(value);
      setLoading(false);
    });
    return unsubscribe;
  }, [gameId]);

  const start = async () => {
    const { participants, spectators } = computeParticipants(participation, { alive, allPlayers, shieldedNames, returnedNames });
    const state = {
      active: true, createdAt: Date.now(), phase: "questions",
      players: participants.map((p) => ({ id: p.id, name: p.name })),
      participants: participants.map((p) => p.name), spectators: spectators.map((p) => p.name),
      questions: {}, answers: {}, anonymousSets: [], revealedQuestions: [],
      eliminated: [], guesses: {}, lastRevealAt: {}, winner: null,
    };
    await storageSet(gameId, STORAGE_KEY_ICEBREAKER, state);
    setSt(state);
  };

  const openAnswers = async () => {
    const res = await storageUpdate(gameId, STORAGE_KEY_ICEBREAKER, (fresh) => {
      if (!fresh) return null;
      fresh.phase = "answers";
      return fresh;
    });
    if (res.ok) setSt(res.value);
  };

  const startGuessing = async () => {
    const res = await storageUpdate(gameId, STORAGE_KEY_ICEBREAKER, (fresh) => {
      if (!fresh) return null;
      const answerers = fresh.players.filter((p) => fresh.answers[p.name]);
      fresh.anonymousSets = answerers
        .map((p, i) => ({ setId: `s${i}`, owner: p.name, answers: fresh.answers[p.name], fullyRevealed: false }))
        .sort(() => Math.random() - 0.5);
      fresh.phase = "guessing";
      return fresh;
    });
    if (res.ok) setSt(res.value);
  };

  const revealQuestion = async () => {
    const res = await storageUpdate(gameId, STORAGE_KEY_ICEBREAKER, (fresh) => {
      if (!fresh) return null;
      const qOwners = Object.keys(fresh.questions).filter((q) => !fresh.revealedQuestions.includes(q));
      if (!qOwners.length) return null;
      fresh.revealedQuestions.push(qOwners[Math.floor(Math.random() * qOwners.length)]);
      return fresh;
    });
    if (res.ok) setSt(res.value);
  };

  // Manual overrides — lets the host fix a typo, or fill in an answer a
  // player reported over Slack instead of through the app, while the round
  // is still live. Goes through storageUpdate so it can't clobber a
  // player's own concurrent submission.
  const saveQuestionEdit = async (name) => {
    const res = await storageUpdate(gameId, STORAGE_KEY_ICEBREAKER, (fresh) => {
      if (!fresh) return null;
      fresh.questions = { ...fresh.questions, [name]: qDraft.trim() };
      return fresh;
    });
    if (res.ok) setSt(res.value);
    setEditingQ(null);
  };

  const saveAnswerEdit = async (owner, questionOwner) => {
    const res = await storageUpdate(gameId, STORAGE_KEY_ICEBREAKER, (fresh) => {
      if (!fresh) return null;
      fresh.answers = { ...fresh.answers, [owner]: { ...(fresh.answers[owner] || {}), [questionOwner]: aDraft.trim() } };
      if (fresh.anonymousSets?.length) {
        fresh.anonymousSets = fresh.anonymousSets.map((s) =>
          s.owner === owner ? { ...s, answers: { ...s.answers, [questionOwner]: aDraft.trim() } } : s
        );
      }
      return fresh;
    });
    if (res.ok) setSt(res.value);
    setEditingA(null);
  };

  const clear = async () => { await storageDelete(gameId, STORAGE_KEY_ICEBREAKER); setSt(null); };
  const pause = async () => { const r = await pauseChallenge(gameId, STORAGE_KEY_ICEBREAKER); if (r.ok) setSt(r.value); };
  const resume = async () => { const r = await resumeChallenge(gameId, STORAGE_KEY_ICEBREAKER); if (r.ok) setSt(r.value); };

  if (loading) return <Card><p style={{ color: "#706050", fontStyle: "italic" }}>Loading...</p></Card>;

  if (!st) {
    return (
      <ChallengeSetupCard
        icon="❄️" title="Icebreaker" onStart={start} startLabel="Start Icebreaker"
        disabled={computeParticipants(participation, { alive, allPlayers, shieldedNames, returnedNames }).participants.length < 2}
        blurb="Players submit a favorite icebreaker question, then everyone answers all of them. Answer sets are anonymized; reveal one question's answers at a time. Guess who's who — last unidentified player wins."
      >
        <ParticipantPicker
          alive={alive} allPlayers={allPlayers} shieldedNames={shieldedNames} returnedNames={returnedNames}
          value={participation} onChange={setParticipation}
        />
      </ChallengeSetupCard>
    );
  }

  const remaining = st.players.filter((p) => !st.eliminated.includes(p.name));
  const questionOwners = Object.keys(st.questions);

  return (
    <Card style={{ borderColor: "rgba(74,122,196,0.3)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ color: "#f0e6d3", margin: 0, fontSize: 14, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>❄️ Icebreaker</h3>
        <Badge color="#4a7ac4">{st.phase}</Badge>
      </div>
      {st.winner && <p style={{ color: "#c9a84c", fontSize: 13 }}>🏆 {st.winner} wins!</p>}
      <p style={{ fontSize: 12, color: "#a09080", margin: "0 0 8px" }}>
        {st.phase === "questions" && `Questions in: ${Object.keys(st.questions).length}/${st.players.length}`}
        {st.phase === "answers" && `Answer sets in: ${Object.keys(st.answers).length}/${st.players.length}`}
        {st.phase === "guessing" && `Remaining: ${remaining.length} · Questions revealed: ${st.revealedQuestions.length}/${Object.keys(st.questions).length}`}
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        {st.phase === "questions" && <Btn small onClick={openAnswers}>Open Answer Phase →</Btn>}
        {st.phase === "answers" && <Btn small onClick={startGuessing}>Start Guessing Phase →</Btn>}
        {st.phase === "guessing" && <Btn small onClick={revealQuestion}>Reveal a Question</Btn>}
        <Btn small variant="ghost" onClick={() => setShowSubmissions((v) => !v)}>
          {showSubmissions ? "Hide Submissions" : "👁 View & Edit Submissions"}
        </Btn>
      </div>

      {(st.phase === "questions" || st.phase === "answers") && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: "#a09080", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Who's in</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {st.players.map((p) => {
              const done = st.phase === "questions" ? !!st.questions[p.name] : !!st.answers[p.name];
              return (
                <span key={p.id} style={{
                  fontSize: 11, padding: "3px 8px", borderRadius: 12,
                  background: done ? "rgba(122,154,92,0.15)" : "rgba(196,92,60,0.1)",
                  color: done ? "#7a9a5c" : "#c45c3c", border: `1px solid ${done ? "#7a9a5c55" : "#c45c3c55"}`,
                }}>
                  {done ? "✓" : "…"} {p.name}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Live Q&A viewer + manual edit — lets the host see exactly what's
          been submitted while the round is still ongoing, and fix a typo
          or fill in an answer reported outside the app. */}
      {showSubmissions && (
        <div style={{ background: "#0a1020", borderRadius: 8, padding: 10, marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: "#a09080", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Questions submitted</div>
          {st.players.map((p) => (
            <div key={p.id} style={{ display: "flex", gap: 6, alignItems: "flex-start", marginBottom: 4 }}>
              <span style={{ fontSize: 12, color: "#f0e6d3", minWidth: 90 }}>{p.name}:</span>
              {editingQ === p.name ? (
                <>
                  <input value={qDraft} onChange={(e) => setQDraft(e.target.value)} style={{ flex: 1, background: "#132038", border: "1px solid #253550", borderRadius: 6, padding: "4px 8px", color: "#f0e6d3", fontSize: 12 }} autoFocus />
                  <Btn small onClick={() => saveQuestionEdit(p.name)}>Save</Btn>
                  <Btn small variant="ghost" onClick={() => setEditingQ(null)}>Cancel</Btn>
                </>
              ) : (
                <>
                  <span style={{ fontSize: 12, color: st.questions[p.name] ? "#a09080" : "#706050", fontStyle: st.questions[p.name] ? "normal" : "italic", flex: 1 }}>
                    {st.questions[p.name] || "not submitted yet"}
                  </span>
                  <button onClick={() => { setEditingQ(p.name); setQDraft(st.questions[p.name] || ""); }} style={{ background: "none", border: "none", color: "#706050", fontSize: 11, cursor: "pointer" }}>✎</button>
                </>
              )}
            </div>
          ))}

          {questionOwners.length > 0 && (
            <>
              <div style={{ fontSize: 11, color: "#a09080", textTransform: "uppercase", letterSpacing: 0.5, margin: "10px 0 6px" }}>Answers submitted</div>
              {st.players.map((p) => (
                <div key={p.id} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 12, color: "#f0e6d3", fontWeight: 600, marginBottom: 2 }}>{p.name}</div>
                  {questionOwners.map((qo) => {
                    const key = `${p.name}::${qo}`;
                    const val = st.answers[p.name]?.[qo];
                    return (
                      <div key={qo} style={{ display: "flex", gap: 6, alignItems: "flex-start", marginBottom: 2, paddingLeft: 8 }}>
                        <span style={{ fontSize: 11, color: "#4a7ac4", minWidth: 100 }}>{st.questions[qo]}:</span>
                        {editingA === key ? (
                          <>
                            <input value={aDraft} onChange={(e) => setADraft(e.target.value)} style={{ flex: 1, background: "#132038", border: "1px solid #253550", borderRadius: 6, padding: "4px 8px", color: "#f0e6d3", fontSize: 12 }} autoFocus />
                            <Btn small onClick={() => saveAnswerEdit(p.name, qo)}>Save</Btn>
                            <Btn small variant="ghost" onClick={() => setEditingA(null)}>Cancel</Btn>
                          </>
                        ) : (
                          <>
                            <span style={{ fontSize: 12, color: val ? "#a09080" : "#706050", fontStyle: val ? "normal" : "italic", flex: 1 }}>{val || "not answered yet"}</span>
                            <button onClick={() => { setEditingA(key); setADraft(val || ""); }} style={{ background: "none", border: "none", color: "#706050", fontSize: 11, cursor: "pointer" }}>✎</button>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {st.phase === "guessing" && (
        <div style={{ fontSize: 11, color: "#706050", marginBottom: 8 }}>
          {st.anonymousSets.map((s) => <div key={s.setId}>{s.setId}{st.eliminated.includes(s.owner) ? ` → ${s.owner} (out)` : ""}</div>)}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Btn variant="ghost" small onClick={clear}>Clear</Btn>
        <PauseResumeControls paused={!!st.paused} onPause={pause} onResume={resume} />
        {st.winner && (
          <ArchiveResultsButton
            gameId={gameId} challengeId="icebreaker" challengeName="Icebreaker" round={null}
            participants={st.participants || st.players.map((p) => p.name)} spectators={st.spectators}
            winner={st.winner} resultSummary={`${st.winner} was the last player unidentified.`}
            finalState={st} startedAt={st.createdAt}
          />
        )}
      </div>
    </Card>
  );
}
