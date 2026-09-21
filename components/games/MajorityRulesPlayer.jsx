import { useState, useEffect } from "react";
import { Card, Btn, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { subscribeMajorityRules, submitMajorityRulesAnswers, tickMajorityRules } from "../../lib/games/majorityRulesData";

// ─── Majority Rules (regular mode, phone side) ───
// All 8 questions render at once, scrollable — pick a side on each,
// then lock the whole set in together. No tally, no majority hint, no
// "how did I do" feedback shows up here at all, before OR right after
// locking in — that reveal is deliberately deferred to the History tab
// once the whole battle's over (see lib/games/majorityRulesData.js's
// own header comment), so nobody can use an early partial reveal to
// change their answers to questions they haven't locked yet, and so
// nobody's last-minute answer is influenced by anyone else's already-
// locked picks leaking out.
export default function MajorityRulesPlayer({ gameId, round, player, players, settings }) {
  const [state, setState] = useState(null);
  const [selections, setSelections] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => subscribeMajorityRules(gameId, round.round, setState), [gameId, round.round]);

  // Same belt-and-suspenders redundancy as every other shared timed
  // battle here (see e.g. lib/games/wagerTriviaTvData.js's own header
  // comment) — lib/roundEngine.js's housekeeping tick drives this too,
  // this just keeps a solo phone from stalling the room if nobody else
  // has this screen open at the moment the clock runs out.
  useEffect(() => {
    const id = setInterval(() => tickMajorityRules(gameId, round.round, settings), 1000);
    return () => clearInterval(id);
  }, [gameId, round.round, settings]);

  if (!state) {
    return <Card style={{ marginBottom: 20, textAlign: "center" }}><p style={{ color: "#6b4f99", fontStyle: "italic" }}>Loading...</p></Card>;
  }

  const byId = {};
  (players || []).forEach((p) => (byId[p.id] = p));

  if (state.finalized) {
    const myPoints = state.results?.pointsByPlayer?.[player.id] ?? 0;
    return <GameResultCard icon="🗳️" title="Majority Rules Complete!" valueLabel={`${myPoints} / ${state.questions.length} correct`} />;
  }

  const alreadyLocked = !!state.locked?.[player.id];
  if (alreadyLocked) {
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <h3 style={{ color: "#ff2d95", margin: "0 0 8px", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🗳️ Majority Rules</h3>
        <p style={{ color: "#a68fd6", fontSize: 13, margin: 0 }}>
          You're locked in — results reveal on the History tab once the battle ends.
        </p>
      </Card>
    );
  }

  const answeredCount = Object.keys(selections).length;
  const allAnswered = state.questions.every((q, i) => !!selections[i]);
  const pick = (i, side) => setSelections((s) => ({ ...s, [i]: side }));

  const lockIn = async () => {
    if (!allAnswered || submitting) return;
    setSubmitting(true);
    const answersArray = state.questions.map((q, i) => selections[i]);
    await submitMajorityRulesAnswers(gameId, round.round, player.id, answersArray);
    setSubmitting(false);
  };

  return (
    <Card style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🗳️ Majority Rules</h3>
        <Badge>{answeredCount}/{state.questions.length} answered</Badge>
      </div>
      <p style={{ color: "#6b4f99", fontSize: 11, margin: "0 0 12px", fontStyle: "italic" }}>
        Answer all {state.questions.length}, then lock in. You'll find out how you compared to the room once this battle ends.
      </p>

      <div style={{ display: "grid", gap: 12, maxHeight: "52vh", overflowY: "auto", paddingRight: 4 }}>
        {state.questions.map((q, i) => {
          const a = byId[q.playerAId];
          const b = byId[q.playerBId];
          const sel = selections[i];
          return (
            <div key={q.id} style={{ background: "#0d0618", borderRadius: 10, padding: "10px 12px", border: "1px solid #3d1f5c", textAlign: "center" }}>
              <p style={{ color: "#f5f0ff", fontSize: 13, margin: "0 0 8px", fontWeight: 600 }}>{q.text}</p>
              <div style={{ display: "flex", gap: 8 }}>
                {["A", "B"].map((side) => {
                  const p = side === "A" ? a : b;
                  const chosen = sel === side;
                  return (
                    <button
                      key={side}
                      onClick={() => pick(i, side)}
                      style={{
                        flex: 1, padding: "10px 8px", borderRadius: 8, cursor: "pointer",
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                        border: `2px solid ${chosen ? "#ff2d95" : "#3d1f5c"}`,
                        background: chosen ? "rgba(255,45,149,0.15)" : "#150a28",
                        color: chosen ? "#ff2d95" : "#a68fd6", fontSize: 12, fontWeight: 700,
                      }}
                    >
                      {p?.effectiveAvatarUrl ? (
                        <img src={p.effectiveAvatarUrl} alt="" style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover" }} />
                      ) : (
                        <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#1c1030", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "#6b4f99" }}>
                          {(p?.display_name || "?").charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span>{p?.display_name || "?"}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 14, textAlign: "center" }}>
        <Btn onClick={lockIn} disabled={!allAnswered || submitting}>
          {submitting ? "Locking in..." : "🔒 Lock In My Answers"}
        </Btn>
      </div>
    </Card>
  );
}
