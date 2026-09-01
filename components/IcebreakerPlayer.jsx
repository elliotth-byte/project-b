import { useState, useEffect } from "react";
import { Btn, Card, PausedBanner } from "./traitorsUi";
import { storageUpdate, subscribeGameState } from "../lib/gameStorage";
import { STORAGE_KEY_ICEBREAKER } from "../lib/icebreakerData";
import { logChallengeResult } from "../lib/challengeHistory";
import { TRAITORS_GAME_REGISTRY } from "../lib/traitorsMiniGames";
import TraitorsRulesGate from "./games/TraitorsRulesGate";

// ─── Icebreaker: Player View ───
export default function IcebreakerPlayer({ gameId, playerName }) {
  const [st, setSt] = useState(null);
  const [q, setQ] = useState("");
  const [ans, setAns] = useState({});
  const [guessSet, setGuessSet] = useState("");
  const [guessOwner, setGuessOwner] = useState("");

  useEffect(() => {
    const unsubscribe = subscribeGameState(gameId, STORAGE_KEY_ICEBREAKER, setSt);
    return unsubscribe;
  }, [gameId]);

  if (!st || !st.active) return null;
  if (st.paused) return <PausedBanner icon="❄️" title="Icebreaker" />;

  // Enhancement 9: a player left out of `participants` doesn't get the
  // interactive controls. `st.participants` is only present on challenges
  // started after this feature shipped — older in-flight games with no
  // such field fall through to the original everyone-plays behavior.
  const isParticipant = !st.participants || st.participants.includes(playerName);
  const isSpectator = st.participants && !isParticipant;
  if (isSpectator) {
    return (
      <Card style={{ marginBottom: 20, borderColor: "rgba(74,122,196,0.3)", textAlign: "center" }}>
        <h3 style={{ color: "#c9a84c", margin: "0 0 6px", fontSize: 15, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>❄️ Icebreaker</h3>
        <p style={{ color: "#a09080", fontSize: 13, margin: 0, fontStyle: "italic" }}>
          You're spectating this round ({st.phase}). {st.winner ? `🏆 ${st.winner} won!` : "No controls for you here — just watch the outcome."}
        </p>
      </Card>
    );
  }

  const submitQ = async () => {
    if (!q.trim()) return;
    const res = await storageUpdate(gameId, STORAGE_KEY_ICEBREAKER, (fresh) => {
      if (!fresh || fresh.questions[playerName]) return null;
      fresh.questions[playerName] = q.trim();
      return fresh;
    });
    if (res.ok) setSt(res.value);
  };

  const questionOwners = Object.keys(st.questions);
  const allAnswered = questionOwners.length > 0 && questionOwners.every((o) => (ans[o] || "").trim());

  const submitAnswers = async () => {
    if (!allAnswered) return;
    const res = await storageUpdate(gameId, STORAGE_KEY_ICEBREAKER, (fresh) => {
      if (!fresh || fresh.answers[playerName]) return null;
      fresh.answers[playerName] = { ...ans };
      return fresh;
    });
    if (res.ok) setSt(res.value);
  };

  const myGuess = st.guesses?.[playerName];
  const submitGuess = async () => {
    if (!guessSet || !guessOwner || myGuess) return;
    const res = await storageUpdate(gameId, STORAGE_KEY_ICEBREAKER, (fresh) => {
      if (!fresh || fresh.guesses?.[playerName]) return null;
      const set = fresh.anonymousSets.find((s) => s.setId === guessSet);
      const correct = set && set.owner === guessOwner;
      fresh.guesses = { ...(fresh.guesses || {}), [playerName]: { setId: guessSet, guessedOwner: guessOwner, correct, time: Date.now() } };
      if (correct) {
        set.fullyRevealed = true;
        if (!fresh.eliminated.includes(set.owner)) fresh.eliminated.push(set.owner);
        const remain = fresh.players.filter((p) => !fresh.eliminated.includes(p.name));
        if (remain.length === 1) fresh.winner = remain[0].name;
      }
      return fresh;
    });
    if (res.ok) {
      setSt(res.value);
      if (res.value.winner) logChallengeResult(gameId, { challenge: "Icebreaker", winners: [res.value.winner] });
    }
  };

  const eliminated = st.eliminated.includes(playerName);
  const registryEntry = TRAITORS_GAME_REGISTRY[STORAGE_KEY_ICEBREAKER];

  return (
    <TraitorsRulesGate icon={registryEntry.icon} label={registryEntry.label} blurb={registryEntry.blurb} resetKey={st.createdAt}>
    <Card style={{ marginBottom: 20, borderColor: "rgba(74,122,196,0.3)" }}>
      <h3 style={{ color: "#c9a84c", margin: "0 0 6px", fontSize: 15, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>❄️ Icebreaker</h3>

      {st.phase === "questions" && (
        st.questions[playerName] ? (
          <p style={{ color: "#7a9a5c", fontSize: 13 }}>✓ Question submitted. Waiting for others.</p>
        ) : (
          <div>
            <p style={{ fontSize: 12, color: "#a09080", margin: "0 0 6px" }}>Submit your favorite icebreaker question:</p>
            <textarea
              rows={2} value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. What's a hill you'd die on?"
              style={{ width: "100%", background: "#0a1020", border: "1px solid #253550", borderRadius: 6, padding: "6px 8px", color: "#f0e6d3", fontSize: 13, boxSizing: "border-box", resize: "vertical", marginBottom: 6 }}
            />
            <Btn small onClick={submitQ} disabled={!q.trim()}>Submit Question</Btn>
          </div>
        )
      )}

      {st.phase === "answers" && (
        st.answers[playerName] ? (
          <p style={{ color: "#7a9a5c", fontSize: 13 }}>✓ All answers submitted.</p>
        ) : (
          <div>
            <p style={{ fontSize: 12, color: "#a09080", margin: "0 0 6px" }}>Answer every question:</p>
            {questionOwners.map((o) => (
              <div key={o} style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 12, color: "#c9a84c" }}>{st.questions[o]}</div>
                <input
                  value={ans[o] || ""} onChange={(e) => setAns({ ...ans, [o]: e.target.value })} placeholder="Your answer..."
                  style={{ width: "100%", background: "#0a1020", border: "1px solid #253550", borderRadius: 6, padding: "6px 8px", color: "#f0e6d3", fontSize: 13, boxSizing: "border-box" }}
                />
              </div>
            ))}
            <Btn small onClick={submitAnswers} disabled={!allAnswered}>Submit Answers</Btn>
          </div>
        )
      )}

      {st.phase === "guessing" && (
        st.winner ? (
          <p style={{ textAlign: "center", color: "#c9a84c", padding: 8 }}>🏆 {st.winner} wins!</p>
        ) : eliminated ? (
          <p style={{ textAlign: "center", color: "#c45c3c", padding: 8 }}>💀 You were identified. Out!</p>
        ) : (
          <div>
            <p style={{ fontSize: 12, color: "#a09080", margin: "0 0 6px", fontStyle: "italic" }}>
              Revealed questions: {st.revealedQuestions.length}. Study the answer sets and guess an owner.
            </p>
            {st.anonymousSets.map((set) => (
              <div key={set.setId} style={{ background: "#0a1020", borderRadius: 8, padding: 8, marginBottom: 6, border: guessSet === set.setId ? "1px solid #c9a84c" : "1px solid #253550" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: st.eliminated.includes(set.owner) ? "#706050" : "#f0e6d3" }}>
                    Set {set.setId.replace("s", "#")}{st.eliminated.includes(set.owner) ? ` — ${set.owner}` : ""}
                  </span>
                  {!st.eliminated.includes(set.owner) && (
                    <button onClick={() => setGuessSet(set.setId)} style={{ fontSize: 11, background: "transparent", border: "1px solid #253550", borderRadius: 5, color: "#a09080", cursor: "pointer", padding: "2px 8px" }}>select</button>
                  )}
                </div>
                {st.revealedQuestions.map((qo) => (
                  <div key={qo} style={{ fontSize: 11, color: "#a09080" }}>
                    <span style={{ color: "#c9a84c" }}>{st.questions[qo]}:</span> {set.answers[qo] || "—"}
                  </div>
                ))}
                {st.revealedQuestions.length === 0 && <span style={{ fontSize: 11, color: "#706050", fontStyle: "italic" }}>No questions revealed yet.</span>}
              </div>
            ))}
            {!myGuess ? (
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <select value={guessOwner} onChange={(e) => setGuessOwner(e.target.value)} style={{ flex: 1, background: "#0a1020", border: "1px solid #253550", borderRadius: 6, padding: "6px 8px", color: "#f0e6d3", fontSize: 12 }}>
                  <option value="">Owner of Set {guessSet ? guessSet.replace("s", "#") : "?"}...</option>
                  {st.players.filter((p) => p.name !== playerName).map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
                </select>
                <Btn small onClick={submitGuess} disabled={!guessSet || !guessOwner}>Guess</Btn>
              </div>
            ) : (
              <p style={{ fontSize: 12, color: myGuess.correct ? "#7a9a5c" : "#c45c3c", marginTop: 6 }}>
                Guessed {myGuess.guessedOwner}: {myGuess.correct ? "Correct!" : "Wrong. No guesses left."}
              </p>
            )}
          </div>
        )
      )}
    </Card>
    </TraitorsRulesGate>
  );
}
