import { useState, useEffect } from "react";
import { subscribeMajorityRulesTv, tickMajorityRulesTv } from "../../lib/games/majorityRulesTvData";

// ─── Big Screen: Majority Rules ───
// See lib/games/majorityRulesTvData.js for the full mechanic. Unlike a
// few other TV components here (e.g. LifesTapestryTvDisplay.jsx), this
// one has no need to separately subscribe to KEY_CHALLENGE — the
// question countdown is this game's own per-question decision window,
// not the outer battle clock, and the game's own state already carries
// everything else (question, phase, scores, sudden death) needed to
// render it.
export default function MajorityRulesTvDisplay({ gameId, round, players, settings }) {
  const [state, setState] = useState(null);
  useEffect(() => subscribeMajorityRulesTv(gameId, round.round, setState), [gameId, round.round]);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  // Same belt-and-suspenders poll as every other shared timed battle
  // here (see e.g. lib/games/goldenFleeceData.js's own header comment).
  useEffect(() => {
    const id = setInterval(() => tickMajorityRulesTv(gameId, round.round, settings), 1000);
    return () => clearInterval(id);
  }, [gameId, round.round, settings]);

  if (!state) return <div style={{ textAlign: "center", color: "#6b4f99", padding: 60 }}>Loading...</div>;

  const byId = {};
  (players || []).forEach((p) => (byId[p.id] = p.display_name));

  const leaderboard = [...state.participantIds].sort((a, b) => (state.scores[b] || 0) - (state.scores[a] || 0));

  if (state.gameEnded) {
    const winnerIds = state.winnerIds || [];
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <div style={{ fontSize: 14, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 3, marginBottom: 12 }}>
          🗳️ Majority Rules — Complete
        </div>
        {winnerIds.length === 1 ? (
          <p style={{ fontSize: 26, color: "#c9a84c", fontWeight: 800, fontFamily: "'Orbitron', 'Segoe UI', sans-serif", margin: "0 0 24px" }}>
            👑 {byId[winnerIds[0]] || "?"} wins Majority Rules!
          </p>
        ) : winnerIds.length > 1 ? (
          <p style={{ fontSize: 20, color: "#c9a84c", fontWeight: 700, margin: "0 0 24px" }}>
            Still tied after every tiebreaker — {winnerIds.map((id) => byId[id] || "?").join(", ")} share the win.
          </p>
        ) : null}
        <div style={{ display: "grid", gap: 8, maxWidth: 420, margin: "0 auto" }}>
          {leaderboard.map((id, i) => (
            <div key={id} style={{ display: "flex", justifyContent: "space-between", background: "#0d0618", borderRadius: 8, padding: "10px 16px", border: winnerIds.includes(id) ? "1px solid #ffd700" : "1px solid transparent" }}>
              <span style={{ color: "#f5f0ff", fontSize: 15 }}>{winnerIds.includes(id) ? "👑 " : ""}{byId[id] || "?"}</span>
              <span style={{ color: "#ffd700", fontWeight: 800, fontSize: 16 }}>{state.scores[id] || 0}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const q = state.question;
  const secLeft = state.phase === "answering"
    ? Math.max(0, Math.ceil((decisionWindowMsForDisplay(settings) - (now - state.phaseStartedAt)) / 1000))
    : null;
  const answeredCount = Object.keys(state.answers || {}).length;

  return (
    <div style={{ padding: 40, display: "grid", gridTemplateColumns: "1fr 300px", gap: 32, minHeight: "70vh" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 14, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 3, marginBottom: 8 }}>
          🗳️ Majority Rules {state.suddenDeath ? "— Tiebreaker" : `— Question ${state.questionIndex + 1} of ${state.questions.length}`}
        </div>

        {state.suddenDeath && (
          <div style={{
            display: "inline-block", background: "rgba(255,179,71,0.1)", border: "1px solid #ffb347", borderRadius: 10,
            padding: "8px 18px", color: "#ffb347", fontSize: 14, fontWeight: 700, marginBottom: 16,
          }}>
            ⚡ TIEBREAKER — only {(state.tiedLeaderIds || []).map((id) => byId[id] || "?").join(", ")} {(state.tiedLeaderIds || []).length === 1 ? "is" : "are"} still playing for the win
          </div>
        )}

        <p style={{ color: "#f5f0ff", fontSize: 22, fontWeight: 700, margin: "0 0 20px", fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
          {q?.text}
        </p>

        {state.phase === "answering" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, maxWidth: 480, margin: "0 auto 16px" }}>
              {["A", "B"].map((side) => {
                const pid = side === "A" ? q.playerAId : q.playerBId;
                return (
                  <div key={side} style={{
                    padding: "18px 12px", borderRadius: 12, background: "#0d0618", border: "2px solid #3d1f5c",
                    color: "#f5f0ff", fontSize: 17, fontFamily: "'Orbitron', 'Segoe UI', sans-serif",
                  }}>
                    {byId[pid] || "?"}
                  </div>
                );
              })}
            </div>
            {secLeft != null && <div style={{ fontSize: 14, color: secLeft <= 5 ? "#ff3860" : "#6b4f99", marginBottom: 8 }}>{secLeft}s</div>}
            <p style={{ color: "#6b4f99", fontSize: 13 }}>{answeredCount} of {state.participantIds.length} answered</p>
          </>
        )}

        {state.phase === "revealed" && (() => {
          const last = state.history[state.history.length - 1];
          if (!last) return null;
          const total = Math.max(1, last.tallyA + last.tallyB);
          return (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, maxWidth: 480, margin: "0 auto 18px" }}>
                {[
                  { side: "A", name: last.playerAName, tally: last.tallyA },
                  { side: "B", name: last.playerBName, tally: last.tallyB },
                ].map(({ side, name, tally }) => {
                  const isMajority = last.majoritySide === side;
                  return (
                    <div key={side} style={{
                      padding: "16px 12px", borderRadius: 12,
                      background: isMajority ? "rgba(255,215,0,0.12)" : "#0d0618",
                      border: `2px solid ${isMajority ? "#ffd700" : "#3d1f5c"}`, color: "#f5f0ff",
                    }}>
                      <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
                        {isMajority ? "👑 " : ""}{name}
                      </div>
                      <div style={{ fontSize: 13, color: "#a68fd6", margin: "6px 0" }}>{tally} vote{tally === 1 ? "" : "s"}</div>
                      <div style={{ height: 8, borderRadius: 4, background: "#1c1030", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${(tally / total) * 100}%`, background: isMajority ? "#ffd700" : "#6b4f99" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              {!last.majoritySide && (
                <p style={{ color: "#a68fd6", fontSize: 13, marginBottom: 12, fontStyle: "italic" }}>Tied vote — nobody scores this one.</p>
              )}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", maxWidth: 560, margin: "0 auto" }}>
                {state.participantIds.map((id) => {
                  const pick = last.answers[id];
                  const matched = last.majoritySide && pick === last.majoritySide;
                  return (
                    <div key={id} style={{
                      fontSize: 12, padding: "5px 10px", borderRadius: 8,
                      background: pick == null ? "#0d0618" : matched ? "rgba(0,255,157,0.12)" : "rgba(255,56,96,0.12)",
                      border: `1px solid ${pick == null ? "#3d1f5c" : matched ? "#00ff9d" : "#ff3860"}`,
                      color: pick == null ? "#6b4f99" : matched ? "#00ff9d" : "#ff3860",
                    }}>
                      {pick == null ? "—" : matched ? "✅" : "❌"} {byId[id] || "?"} → {pick ? (pick === "A" ? last.playerAName : last.playerBName) : "no answer"}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </div>

      <div>
        <div style={{ fontSize: 14, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 2, marginBottom: 12 }}>Leaderboard</div>
        <div style={{ display: "grid", gap: 8 }}>
          {leaderboard.map((id) => (
            <div key={id} style={{
              display: "flex", justifyContent: "space-between", background: "#0d0618", borderRadius: 8, padding: "8px 12px",
              border: state.suddenDeath && (state.tiedLeaderIds || []).includes(id) ? "1px solid #ffb347" : "1px solid transparent",
            }}>
              <span style={{ fontSize: 13, color: "#f5f0ff" }}>{byId[id] || "?"}</span>
              <span style={{ fontSize: 13, color: "#00ff9d", fontWeight: 700 }}>{state.scores[id] || 0}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Mirrors lib/games/majorityRulesTvData.js's own decisionWindowMs
// exactly — duplicated here rather than imported so this purely-visual
// countdown can never accidentally diverge in behavior from the
// authoritative one (it doesn't drive anything, it just has to LOOK
// right), same reasoning WagerTriviaTvDisplay.jsx's own inlined window
// constants already follow.
function decisionWindowMsForDisplay(settings) {
  const totalSec = settings?.challengeDurationSec || 600;
  const perQuestionSec = Math.max(15, Math.min(30, totalSec / 10));
  return perQuestionSec * 1000;
}
