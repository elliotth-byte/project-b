import { useState, useEffect } from "react";
import { Btn, Card, Badge, ChallengeSetupCard, PauseResumeControls } from "./traitorsUi";
import { storageSet, storageUpdate, storageDelete, subscribeGameState } from "../lib/gameStorage";
import { pauseChallenge, resumeChallenge } from "../lib/pauseResume";
import {
  STORAGE_KEY_ICEBREAKER, subscribeIcebreakerPresubmit, setIcebreakerPresubmitOpen,
} from "../lib/icebreakerData";
import { REVEAL_INTERVAL_MS, useIcebreakerAutoReveal, useNowWhile, formatCountdown } from "../lib/icebreakerAutoReveal";
import { guessLockInfo } from "../lib/icebreakerGuessLock";
import { DEFAULT_PARTICIPATION, computeParticipants } from "../lib/challengeParticipants";
import { logChallengeResult } from "../lib/challengeHistory";
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
  const [presubmit, setPresubmit] = useState(null);
  const [removeName, setRemoveName] = useState("");

  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeGameState(gameId, STORAGE_KEY_ICEBREAKER, (value) => {
      setSt(value);
      setLoading(false);
    });
    return unsubscribe;
  }, [gameId]);

  useEffect(() => {
    const unsubscribe = subscribeIcebreakerPresubmit(gameId, setPresubmit);
    return unsubscribe;
  }, [gameId]);

  // Timed reveals: once a schedule is set (nextRevealAt in the game state),
  // any open view — this one or a player's — applies each reveal as it
  // comes due. See lib/icebreakerAutoReveal.js.
  useIcebreakerAutoReveal(gameId, st);
  const tickNow = useNowWhile(st?.nextRevealAt);

  const start = async () => {
    const { participants, spectators } = computeParticipants(participation, { alive, allPlayers, shieldedNames, returnedNames });
    // Fold in whatever was collected through the disguised pre-submit
    // prompt (see lib/icebreakerData.js) — only for whoever actually
    // ended up a participant in THIS run, never spectators. Anyone who
    // didn't pre-submit just answers live, same as before this existed.
    const preseeded = {};
    participants.forEach((p) => {
      const q = presubmit?.questions?.[p.name];
      if (q) preseeded[p.name] = q;
    });
    const state = {
      active: true, createdAt: Date.now(), phase: "questions",
      players: participants.map((p) => ({ id: p.id, name: p.name, avatarUrl: p.avatarUrl })),
      participants: participants.map((p) => p.name), spectators: spectators.map((p) => p.name),
      questions: preseeded, answers: {}, anonymousSets: [], revealedQuestions: [],
      eliminated: [], guesses: {}, guessLog: [], lastRevealAt: {}, winner: null,
    };
    await storageSet(gameId, STORAGE_KEY_ICEBREAKER, state);
    setSt(state);
    // Done its job — closes the disguised prompt so it stops showing up
    // for players once the real (now-visible) mission has absorbed it.
    if (presubmit?.open) await setIcebreakerPresubmitOpen(gameId, false);
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
      // Seed the guessing phase with one randomly chosen question already
      // revealed. Guessing blind would just be a coin flip and leave
      // everyone waiting on the first reveal.
      const qOwners = Object.keys(fresh.questions || {});
      if (qOwners.length && !(fresh.revealedQuestions || []).length) {
        fresh.revealedQuestions = [qOwners[Math.floor(Math.random() * qOwners.length)]];
      }
      // The rest come out on a timer, one per hour. The host can stop or
      // restart this from the panel.
      fresh.revealIntervalMs = REVEAL_INTERVAL_MS;
      fresh.nextRevealAt = qOwners.length > (fresh.revealedQuestions || []).length ? Date.now() + REVEAL_INTERVAL_MS : null;
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
      // A manual reveal restarts the hourly clock (if one is running), so
      // the next automatic one is a full interval after this one.
      if (fresh.nextRevealAt) {
        fresh.nextRevealAt = qOwners.length > 1 ? Date.now() + (fresh.revealIntervalMs || REVEAL_INTERVAL_MS) : null;
      }
      return fresh;
    });
    if (res.ok) setSt(res.value);
  };

  // Turn the hourly schedule on (e.g. for a round that was already in
  // guessing before this existed) — first automatic reveal is one full
  // interval from now.
  const startAutoReveal = async () => {
    const res = await storageUpdate(gameId, STORAGE_KEY_ICEBREAKER, (fresh) => {
      if (!fresh || fresh.phase !== "guessing") return null;
      const left = Object.keys(fresh.questions || {}).filter((q) => !(fresh.revealedQuestions || []).includes(q)).length;
      if (!left) return null;
      fresh.revealIntervalMs = REVEAL_INTERVAL_MS;
      fresh.nextRevealAt = Date.now() + REVEAL_INTERVAL_MS;
      return fresh;
    });
    if (res.ok) setSt(res.value);
  };

  const stopAutoReveal = async () => {
    const res = await storageUpdate(gameId, STORAGE_KEY_ICEBREAKER, (fresh) => {
      if (!fresh || !fresh.nextRevealAt) return null;
      fresh.nextRevealAt = null;
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

  // Pull one player out of a round that's already underway. They're moved
  // to spectators (so their own view flips to the "you're spectating" card)
  // and every trace of them as a *player* is scrubbed: their answer set,
  // their guesses, their anonymous set (unless they were already identified
  // and out — that stays so the reveal history reads correctly).
  // Their *question* is only removed before the guessing phase; once
  // guessing has started the question is already in play and visible to
  // everyone, so it stays and just loses its owner as a player.
  // If removing them leaves exactly one unidentified player in guessing,
  // that player is declared the winner, same as a correct guess would.
  const removePlayer = async (name) => {
    if (!name) return;
    const ok = typeof window === "undefined" || window.confirm(`Remove ${name} from the Icebreaker? This can't be undone.`);
    if (!ok) return;
    let declaredWinner = false;
    const res = await storageUpdate(gameId, STORAGE_KEY_ICEBREAKER, (fresh) => {
      if (!fresh || !fresh.players.some((p) => p.name === name)) return null;
      const hadWinner = !!fresh.winner;
      const wasOut = (fresh.eliminated || []).includes(name);

      fresh.players = fresh.players.filter((p) => p.name !== name);
      fresh.participants = fresh.players.map((p) => p.name);
      fresh.spectators = (fresh.spectators || []).includes(name) ? fresh.spectators : [...(fresh.spectators || []), name];

      // Their own answers + their own guesses
      const { [name]: _dropAnswers, ...restAnswers } = fresh.answers || {};
      fresh.answers = restAnswers;
      const { [name]: _dropGuess, ...restGuesses } = fresh.guesses || {};
      fresh.guesses = restGuesses;
      if (fresh.guessLog) fresh.guessLog = fresh.guessLog.filter((g) => g.player !== name);

      // Their anonymous set (kept if they were already identified/out)
      if (!wasOut) {
        fresh.anonymousSets = (fresh.anonymousSets || []).filter((s) => s.owner !== name);
        fresh.eliminated = (fresh.eliminated || []).filter((n) => n !== name);
      }

      // Their question — only before guessing starts
      if (fresh.phase !== "guessing") {
        const { [name]: _dropQ, ...restQuestions } = fresh.questions || {};
        fresh.questions = restQuestions;
        fresh.revealedQuestions = (fresh.revealedQuestions || []).filter((n) => n !== name);
        const stripped = {};
        Object.keys(fresh.answers).forEach((o) => {
          const { [name]: _dropA, ...rest } = fresh.answers[o] || {};
          stripped[o] = rest;
        });
        fresh.answers = stripped;
      }

      if (fresh.phase === "guessing" && !hadWinner) {
        const remain = fresh.players.filter((p) => !fresh.eliminated.includes(p.name));
        if (remain.length === 1) {
          fresh.winner = remain[0].name;
          declaredWinner = true;
        }
      }
      return fresh;
    });
    if (res.ok) {
      setSt(res.value);
      setRemoveName("");
      if (declaredWinner && res.value.winner) logChallengeResult(gameId, { challenge: "Icebreaker", winners: [res.value.winner] });
    }
  };

  const clear = async () => { await storageDelete(gameId, STORAGE_KEY_ICEBREAKER); setSt(null); };
  const pause = async () => { const r = await pauseChallenge(gameId, STORAGE_KEY_ICEBREAKER); if (r.ok) setSt(r.value); };
  // Shift the next scheduled reveal forward by however long the round was
  // paused, so time spent paused doesn't count toward the hour.
  const resume = async () => {
    const r = await resumeChallenge(gameId, STORAGE_KEY_ICEBREAKER, (fresh, pausedAt, now) => {
      if (fresh.nextRevealAt) fresh.nextRevealAt += Math.max(0, now - pausedAt);
    });
    if (r.ok) setSt(r.value);
  };

  if (loading) return <Card><p style={{ color: "#706050", fontStyle: "italic" }}>Loading...</p></Card>;

  if (!st) {
    return (
      <ChallengeSetupCard
        icon="❄️" title="Icebreaker" onStart={start} startLabel="Start Icebreaker"
        disabled={computeParticipants(participation, { alive, allPlayers, shieldedNames, returnedNames }).participants.length < 2}
        blurb="Players submit a favorite icebreaker question, then everyone answers all of them. Answer sets are anonymized; one question is revealed up front and the rest follow one per hour. Guess who's who — a wrong guess locks you out until the next reveal. Last unidentified player wins."
      >
        <ParticipantPicker
          alive={alive} allPlayers={allPlayers} shieldedNames={shieldedNames} returnedNames={returnedNames}
          value={participation} onChange={setParticipation}
        />
        <div style={{ borderTop: "1px solid #253550", paddingTop: 10, marginTop: 4 }}>
          <Btn small variant={presubmit?.open ? "danger" : "ghost"} onClick={() => setIcebreakerPresubmitOpen(gameId, !presubmit?.open)}>
            {presubmit?.open ? "Close disguised pre-submit" : "Open disguised pre-submit"}
          </Btn>
          <p style={{ fontSize: 11, color: "#706050", margin: "6px 0 0", fontStyle: "italic" }}>
            {presubmit?.open
              ? `Collecting now, ahead of time, through a plain unbranded prompt that never mentions Icebreaker — ${Object.keys(presubmit?.questions || {}).length} submitted so far. Whoever's already in by the time you start gets skipped straight past the questions phase.`
              : `${Object.keys(presubmit?.questions || {}).length} already collected from an earlier open window, if any.`}
          </p>
        </div>
      </ChallengeSetupCard>
    );
  }

  const remaining = st.players.filter((p) => !st.eliminated.includes(p.name));
  const questionOwners = Object.keys(st.questions);
  const unrevealed = questionOwners.length - st.revealedQuestions.length;

  // Full guess history for the host. Rounds that started before the log
  // existed only have each player's latest guess in `guesses`, so fall back
  // to that for them.
  const guessLog = (st.guessLog || Object.entries(st.guesses || {}).map(([player, g]) => ({ player, ...g })))
    .slice()
    .sort((a, b) => (a.time || 0) - (b.time || 0));
  const nowMs = Date.now();

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
      {st.phase === "guessing" && !st.winner && (
        <p style={{ fontSize: 11, color: "#706050", margin: "0 0 8px", fontStyle: "italic" }}>
          {st.nextRevealAt
            ? (st.paused
              ? "Auto-reveal is on hold while the round is paused."
              : `Next question auto-reveals in ${formatCountdown(st.nextRevealAt - tickNow)}, then one every hour.`)
            : unrevealed > 0
              ? "Auto-reveal is off — reveal manually or start the hourly timer."
              : "All questions revealed."}
        </p>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        {st.phase === "questions" && <Btn small onClick={openAnswers}>Open Answer Phase →</Btn>}
        {st.phase === "answers" && <Btn small onClick={startGuessing}>Start Guessing Phase →</Btn>}
        {st.phase === "guessing" && <Btn small onClick={revealQuestion}>Reveal a Question</Btn>}
        {st.phase === "guessing" && !st.winner && (
          st.nextRevealAt
            ? <Btn small variant="ghost" onClick={stopAutoReveal}>Stop auto-reveal</Btn>
            : (unrevealed > 0 ? <Btn small variant="ghost" onClick={startAutoReveal}>Start hourly auto-reveal</Btn> : null)
        )}
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
        <>
          {/* Who's still in, who's out, and who can guess right now. */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: "#a09080", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
              Players — {remaining.length} left
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {st.players.map((p) => {
                const out = st.eliminated.includes(p.name);
                const lock = guessLockInfo(st, p.name, nowMs);
                const color = out ? "#706050" : lock.locked ? "#c45c3c" : "#7a9a5c";
                const bg = out ? "rgba(112,96,80,0.15)" : lock.locked ? "rgba(196,92,60,0.1)" : "rgba(122,154,92,0.15)";
                return (
                  <span key={p.id} style={{
                    fontSize: 11, padding: "3px 8px", borderRadius: 12, background: bg, color,
                    border: `1px solid ${color}55`, textDecoration: out ? "line-through" : "none",
                  }}>
                    {out ? "💀" : lock.locked ? "🔒" : "✓"} {p.name}
                  </span>
                );
              })}
            </div>
            <p style={{ fontSize: 10, color: "#706050", margin: "4px 0 0", fontStyle: "italic" }}>
              ✓ can guess · 🔒 locked until the next reveal · 💀 identified
            </p>
          </div>

          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: "#a09080", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
              Guess log ({guessLog.length})
            </div>
            {guessLog.length === 0 ? (
              <p style={{ fontSize: 11, color: "#706050", margin: 0, fontStyle: "italic" }}>No guesses yet.</p>
            ) : (
              <div style={{ maxHeight: 160, overflowY: "auto", background: "#0a1020", borderRadius: 6, padding: "6px 8px" }}>
                {guessLog.slice().reverse().map((g, i) => (
                  <div key={`${g.player}-${g.time}-${i}`} style={{ fontSize: 11, color: "#a09080", marginBottom: 2 }}>
                    <span style={{ color: "#706050" }}>
                      {g.time ? new Date(g.time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "—"}
                    </span>{" "}
                    <span style={{ color: "#f0e6d3" }}>{g.player}</span> guessed set {String(g.setId || "").replace("s", "#")} is{" "}
                    <span style={{ color: "#f0e6d3" }}>{g.guessedOwner}</span> —{" "}
                    <span style={{ color: g.correct ? "#7a9a5c" : "#c45c3c" }}>{g.correct ? "✓ correct" : "✗ wrong"}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ fontSize: 11, color: "#706050", marginBottom: 8 }}>
            {st.anonymousSets.map((s) => <div key={s.setId}>{s.setId}{st.eliminated.includes(s.owner) ? ` → ${s.owner} (out)` : ""}</div>)}
          </div>
        </>
      )}

      {/* Remove a player mid-round (see removePlayer above). */}
      {!st.winner && st.players.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", margin: "8px 0", paddingTop: 8, borderTop: "1px solid #253550" }}>
          <select
            value={removeName} onChange={(e) => setRemoveName(e.target.value)}
            style={{ background: "#0a1020", border: "1px solid #253550", borderRadius: 6, padding: "4px 8px", color: "#f0e6d3", fontSize: 12 }}
          >
            <option value="">Remove a player…</option>
            {st.players.map((p) => (
              <option key={p.id} value={p.name}>{p.name}{st.eliminated.includes(p.name) ? " (out)" : ""}</option>
            ))}
          </select>
          <Btn small variant="danger" onClick={() => removePlayer(removeName)} disabled={!removeName}>Remove</Btn>
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
