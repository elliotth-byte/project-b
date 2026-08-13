import { useState } from "react";
import { Card, Btn } from "./ui";
import { submitStatement, submitJuryQuestion, submitResponse, isJuryEligible } from "../lib/finaleQaData";

// ─── Finale Q&A ───
// Shown to everyone — finalists, jury-eligible exiled players, players
// who quit or were removed, and the host — statements, jury questions,
// and finalist responses are all fully public, nothing here is secret.
// Only WHO can submit what differs by role (see lib/finaleQaData.js):
//   - a finalist writes their own statement (once) and can respond to
//     each juror's question (once each)
//   - a jury-eligible player (exiled, didn't quit, wasn't removed) can
//     write one question or statement to the final 3
//   - everyone else — including a quit/removed player, or the host's own
//     "View as Player" — just reads
// Submitting is only offered during finale.phase === "qa" — once voting
// opens the window's closed, but the whole feed stays visible afterward
// as a permanent record.
export default function FinaleQaPanel({ gameId, finale, qa, players, player, readOnly = false }) {
  const [statementDraft, setStatementDraft] = useState("");
  const [questionDraft, setQuestionDraft] = useState("");
  const [responseDrafts, setResponseDrafts] = useState({});
  const [busy, setBusy] = useState(null);

  const finalistIds = finale.finalists.map((f) => f.playerId);
  const canSubmit = !readOnly && !!player;
  const me = canSubmit ? (players || []).find((p) => p.id === player.id) : null;
  const isFinalist = canSubmit && finalistIds.includes(player.id);
  const isJuror = canSubmit && isJuryEligible(me);
  const submissionsOpen = finale.phase === "qa";

  const myStatement = isFinalist ? qa.statements[player.id] : null;
  const myQuestion = isJuror ? qa.questions.find((q) => q.jurorId === player.id) : null;

  const doSubmitStatement = async () => {
    if (!statementDraft.trim()) return;
    setBusy("statement");
    await submitStatement(gameId, player.id, statementDraft);
    setBusy(null);
  };

  const doSubmitQuestion = async () => {
    if (!questionDraft.trim()) return;
    setBusy("question");
    await submitJuryQuestion(gameId, player.id, player.name, questionDraft);
    setBusy(null);
  };

  const doSubmitResponse = async (questionId) => {
    const text = responseDrafts[questionId];
    if (!text?.trim()) return;
    setBusy(questionId);
    await submitResponse(gameId, questionId, player.id, text);
    setBusy(null);
    setResponseDrafts((d) => ({ ...d, [questionId]: "" }));
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {isFinalist && submissionsOpen && !myStatement && (
        <Card>
          <h4 style={{ color: "#ff2d95", margin: "0 0 8px", fontSize: 14, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
            Why should you win?
          </h4>
          <textarea
            value={statementDraft} onChange={(e) => setStatementDraft(e.target.value)}
            maxLength={1000} rows={5} placeholder="Make your case..."
            style={{ width: "100%", boxSizing: "border-box", background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 8, padding: "10px 12px", color: "#f5f0ff", fontSize: 13, resize: "vertical", marginBottom: 8, fontFamily: "inherit" }}
          />
          <Btn onClick={doSubmitStatement} disabled={!statementDraft.trim() || busy === "statement"}>
            {busy === "statement" ? "Submitting..." : "Submit Statement"}
          </Btn>
        </Card>
      )}

      {isJuror && submissionsOpen && !myQuestion && (
        <Card>
          <h4 style={{ color: "#ff2d95", margin: "0 0 8px", fontSize: 14, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
            Ask the Final 3 a question
          </h4>
          <p style={{ color: "#6b4f99", fontSize: 11, margin: "0 0 8px", fontStyle: "italic" }}>
            One question or statement, seen (and answerable) by all three finalists. You get one shot at this.
          </p>
          <textarea
            value={questionDraft} onChange={(e) => setQuestionDraft(e.target.value)}
            maxLength={500} rows={3} placeholder="Ask your question, or say your piece..."
            style={{ width: "100%", boxSizing: "border-box", background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 8, padding: "10px 12px", color: "#f5f0ff", fontSize: 13, resize: "vertical", marginBottom: 8, fontFamily: "inherit" }}
          />
          <Btn onClick={doSubmitQuestion} disabled={!questionDraft.trim() || busy === "question"}>
            {busy === "question" ? "Submitting..." : "Submit"}
          </Btn>
        </Card>
      )}

      <Card>
        <h4 style={{ color: "#a68fd6", margin: "0 0 10px", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>
          Final Statements
        </h4>
        <div style={{ display: "grid", gap: 10 }}>
          {finale.finalists.map((f) => {
            const s = qa.statements[f.playerId];
            return (
              <div key={f.playerId} style={{ background: "#0d0618", borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ color: "#ff2d95", fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{f.name}</div>
                {s ? (
                  <p style={{ color: "#f5f0ff", fontSize: 13, margin: 0, whiteSpace: "pre-wrap" }}>{s.text}</p>
                ) : (
                  <p style={{ color: "#6b4f99", fontSize: 12, fontStyle: "italic", margin: 0 }}>Hasn't submitted yet.</p>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <h4 style={{ color: "#a68fd6", margin: "0 0 10px", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>
          Jury Questions
        </h4>
        {qa.questions.length === 0 ? (
          <p style={{ color: "#6b4f99", fontSize: 12, fontStyle: "italic", margin: 0 }}>No questions submitted yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            {qa.questions.map((q) => (
              <div key={q.id} style={{ background: "#0d0618", borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ color: "#ff3860", fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{q.jurorName} asks:</div>
                <p style={{ color: "#f5f0ff", fontSize: 13, margin: "0 0 10px", whiteSpace: "pre-wrap" }}>{q.text}</p>
                <div style={{ display: "grid", gap: 8, paddingLeft: 10, borderLeft: "2px solid #3d1f5c" }}>
                  {finale.finalists.map((f) => {
                    const r = q.responses[f.playerId];
                    const isMe = isFinalist && player.id === f.playerId;
                    return (
                      <div key={f.playerId}>
                        <div style={{ color: "#a68fd6", fontSize: 11, fontWeight: 700, marginBottom: 2 }}>{f.name}</div>
                        {r ? (
                          <p style={{ color: "#f5f0ff", fontSize: 12, margin: 0, whiteSpace: "pre-wrap" }}>{r.text}</p>
                        ) : isMe && submissionsOpen ? (
                          <div>
                            <textarea
                              value={responseDrafts[q.id] || ""} onChange={(e) => setResponseDrafts((d) => ({ ...d, [q.id]: e.target.value }))}
                              maxLength={500} rows={2} placeholder="Your response..."
                              style={{ width: "100%", boxSizing: "border-box", background: "#150a28", border: "1px solid #3d1f5c", borderRadius: 6, padding: "6px 10px", color: "#f5f0ff", fontSize: 12, resize: "vertical", marginBottom: 6, fontFamily: "inherit" }}
                            />
                            <Btn small onClick={() => doSubmitResponse(q.id)} disabled={!responseDrafts[q.id]?.trim() || busy === q.id}>
                              {busy === q.id ? "Submitting..." : "Respond"}
                            </Btn>
                          </div>
                        ) : (
                          <p style={{ color: "#6b4f99", fontSize: 12, fontStyle: "italic", margin: 0 }}>Hasn't responded yet.</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
