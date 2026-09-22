import { useState, useEffect } from "react";
import { subscribeGodsAndGambits, tickGodsAndGambits, guessWindowMs, betWindowMs } from "../../lib/games/godsAndGambitsData";

const GOLD = "#c9a84c";
const OLIVE = "#8a9a5b";
const MARBLE_BG = "#0d0a05";

function spaceLabel(space) {
  return space.value === null ? "Under Every Guess" : `${space.value}`;
}

// ─── Big Screen: Gods and Gambits ───
// See lib/games/godsAndGambitsData.js for the full mechanic — this is
// the only place the current riddle, the sorted betting board, and
// everyone's bankroll ever show together. A phone
// (components/games/GodsAndGambitsPlayer.jsx) only ever gets its own
// guess input, its own bet-sizing controls, and its own bankroll.
export default function GodsAndGambitsTvDisplay({ gameId, round, players, settings }) {
  const [state, setState] = useState(null);
  useEffect(() => subscribeGodsAndGambits(gameId, round.round, setState), [gameId, round.round]);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  // Same belt-and-suspenders poll as every other shared timed battle
  // here (see e.g. lib/games/goldenFleeceData.js's own header comment).
  useEffect(() => {
    const id = setInterval(() => tickGodsAndGambits(gameId, round.round, settings), 1000);
    return () => clearInterval(id);
  }, [gameId, round.round, settings]);

  if (!state) return <div style={{ textAlign: "center", color: "#6b4f99", padding: 60 }}>Loading...</div>;

  const byId = {};
  (players || []).forEach((p) => (byId[p.id] = p.display_name));

  const leaderboard = [...state.participantIds].sort((a, b) => (state.bankrolls[b] || 0) - (state.bankrolls[a] || 0));

  if (state.gameEnded) {
    const winnerId = leaderboard[0];
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <div style={{ fontSize: 14, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 3, marginBottom: 12 }}>
          🏺 Gods and Gambits — The Oracle Falls Silent
        </div>
        {winnerId && (
          <p style={{ fontSize: 26, color: GOLD, fontWeight: 800, fontFamily: "'Cinzel', 'Segoe UI', serif", margin: "0 0 24px" }}>
            👑 {byId[winnerId] || "?"} leaves with the richest coffer!
          </p>
        )}
        <div style={{ display: "grid", gap: 8, maxWidth: 420, margin: "0 auto" }}>
          {leaderboard.map((id, i) => (
            <div key={id} style={{
              display: "flex", justifyContent: "space-between", background: MARBLE_BG, borderRadius: 8, padding: "10px 16px",
              border: i === 0 ? `1px solid ${GOLD}` : "1px solid transparent",
            }}>
              <span style={{ color: "#f5f0ff", fontSize: 15 }}>{i === 0 ? "👑 " : ""}{byId[id] || "?"}</span>
              <span style={{ color: GOLD, fontWeight: 800, fontSize: 16 }}>{Math.round(state.bankrolls[id] || 0)} ⛁</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const q = state.question;
  const windowMs = state.phase === "guessing" ? guessWindowMs(settings) : state.phase === "betting" ? betWindowMs(settings) : null;
  const secLeft = windowMs != null ? Math.max(0, Math.ceil((windowMs - (now - state.phaseStartedAt)) / 1000)) : null;
  const guessedCount = Object.keys(state.guesses || {}).length;
  const betCount = Object.keys(state.pendingBets || {}).length;

  return (
    <div style={{ padding: 40, display: "grid", gridTemplateColumns: "1fr 300px", gap: 32, minHeight: "70vh" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 14, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 3, marginBottom: 8 }}>
          🏺 Gods and Gambits — Round {state.roundNum} of {state.totalRounds}
        </div>

        <p style={{ color: "#f5f0ff", fontSize: 20, fontWeight: 700, margin: "0 0 20px", fontFamily: "'Cinzel', 'Segoe UI', serif" }}>
          {q?.prompt}
        </p>

        {state.phase === "guessing" && (
          <>
            <p style={{ color: OLIVE, fontSize: 14, marginBottom: 8 }}>Every gambler writes their own guess, in secret...</p>
            {secLeft != null && <div style={{ fontSize: 16, color: secLeft <= 5 ? "#ff3860" : "#6b4f99", marginBottom: 8 }}>{secLeft}s</div>}
            <p style={{ color: "#6b4f99", fontSize: 13 }}>{guessedCount} of {state.participantIds.length} have guessed</p>
          </>
        )}

        {state.phase === "betting" && (
          <>
            <p style={{ color: OLIVE, fontSize: 13, marginBottom: 14 }}>The guesses are in — place your bets, up to 2 each.</p>
            <div style={{ display: "grid", gap: 8, maxWidth: 480, margin: "0 auto 14px" }}>
              {(state.bettingSpaces || []).map((space) => (
                <div key={space.id} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center", background: MARBLE_BG,
                  border: `1px solid ${space.value === null ? "#7a5fb3" : GOLD}`, borderRadius: 8, padding: "10px 16px",
                }}>
                  <span style={{ color: "#f5f0ff", fontSize: 15 }}>
                    {space.value === null ? "🌫️ Under Every Guess" : `🔢 ${space.value}`}
                    {space.ownerIds.length > 0 && (
                      <span style={{ color: "#6b4f99", fontSize: 12 }}> — {space.ownerIds.map((id) => byId[id] || "?").join(", ")}</span>
                    )}
                  </span>
                  <span style={{ color: GOLD, fontWeight: 800, fontSize: 14 }}>{space.odds}:1</span>
                </div>
              ))}
            </div>
            {secLeft != null && <div style={{ fontSize: 16, color: secLeft <= 5 ? "#ff3860" : "#6b4f99", marginBottom: 8 }}>{secLeft}s</div>}
            <p style={{ color: "#6b4f99", fontSize: 13 }}>{betCount} of {state.participantIds.length} have wagered — bets stay sealed until the reveal</p>
          </>
        )}

        {state.phase === "revealed" && (() => {
          const r = state.reveal;
          if (!r) return null;
          const winSpace = r.bettingSpaces.find((s) => s.id === r.winningSpaceId);
          return (
            <div>
              <p style={{ color: GOLD, fontSize: 28, fontWeight: 800, margin: "0 0 10px", fontFamily: "'Cinzel', 'Segoe UI', serif" }}>
                The truth: {r.trueAnswer}
              </p>
              <p style={{ color: "#f5f0ff", fontSize: 15, marginBottom: 6 }}>
                Winning space: <strong style={{ color: GOLD }}>{spaceLabel(winSpace)}</strong> ({winSpace.odds}:1)
              </p>
              {r.bonusWinnerIds.length > 0 ? (
                <p style={{ color: "#ffd700", fontSize: 13, marginBottom: 16, fontStyle: "italic" }}>
                  🏆 {r.bonusWinnerIds.map((id) => byId[id] || "?").join(", ")} guessed it best — {Math.round(r.bonusPot)} bonus drachma!
                </p>
              ) : (
                <p style={{ color: "#a68fd6", fontSize: 13, marginBottom: 16, fontStyle: "italic" }}>
                  Every guess overshot the truth — no bonus this round, only the fallback bet pays.
                </p>
              )}
              <div style={{ display: "grid", gap: 6, maxWidth: 480, margin: "0 auto" }}>
                {state.participantIds.map((id) => {
                  const p = r.payouts[id] || { netChange: 0 };
                  const net = p.netChange || 0;
                  return (
                    <div key={id} style={{ display: "flex", justifyContent: "space-between", background: MARBLE_BG, borderRadius: 8, padding: "6px 14px" }}>
                      <span style={{ fontSize: 13, color: "#f5f0ff" }}>{byId[id] || "?"}</span>
                      <span style={{ fontSize: 13, color: net > 0 ? "#00ff9d" : net < 0 ? "#ff3860" : "#6b4f99" }}>
                        {net > 0 ? `+${Math.round(net)}` : Math.round(net)} → {Math.round(r.bankrollsAfter[id] || 0)} ⛁
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </div>

      <div>
        <div style={{ fontSize: 14, color: "#6b4f99", textTransform: "uppercase", letterSpacing: 2, marginBottom: 12 }}>Bankrolls</div>
        <div style={{ display: "grid", gap: 8 }}>
          {leaderboard.map((id) => (
            <div key={id} style={{ display: "flex", justifyContent: "space-between", background: MARBLE_BG, borderRadius: 8, padding: "8px 12px" }}>
              <span style={{ fontSize: 13, color: "#f5f0ff" }}>{byId[id] || "?"}</span>
              <span style={{ fontSize: 13, color: GOLD, fontWeight: 700 }}>{Math.round(state.bankrolls[id] || 0)} ⛁</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
