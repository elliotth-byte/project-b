import { useState, useEffect, useRef } from "react";
import { Card, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { reportScore } from "../../lib/challengeScores";
import {
  subscribeDivinersDice, tickDivinersDice, rollDice, submitWhiteMark, submitColoredMark,
  isValidMark, placementValue, rowScore, ROW_COLORS, ROW_SEQUENCE,
} from "../../lib/games/divinersDiceData";

// ─── The Diviner's Dice — Big Screen (phone side) ───
// The shared dice and everyone else's progress only ever show on the
// TV (components/bigscreen/DivinersDiceTvDisplay.jsx) — your phone is
// your own scoresheet, tappable straight from the grid, plus (only on
// your own turn) the Roll Dice button and your exclusive bonus mark.
// Every player, not just the active one, gets to act every single
// roll — see lib/games/divinersDiceData.js's own header — so this
// always shows the current shared white sum and lets you respond to
// it even when someone else is the one rolling.
//
// Cells are tap-to-mark, and obviously-illegal ones are greyed out for
// a responsive feel, but that's purely a UX courtesy — every tap still
// goes through the real submitWhiteMark/submitColoredMark server
// functions below, which re-validate from scratch and are the only
// real source of truth (see isValidMark, shared with the TV/server).
export default function DivinersDicePlayer({ gameId, round, player, settings }) {
  const [state, setState] = useState(null);
  const reportedRef = useRef(false);

  useEffect(() => subscribeDivinersDice(gameId, round.round, setState), [gameId, round.round]);

  // Same belt-and-suspenders redundancy as every other shared timed
  // battle here (see e.g. lib/games/goldenFleeceData.js's header) —
  // the TV and lib/roundEngine.js's housekeeping both already drive
  // this, this just keeps a solo phone from stalling the room.
  useEffect(() => {
    const id = setInterval(() => tickDivinersDice(gameId, round.round, settings), 1000);
    return () => clearInterval(id);
  }, [gameId, round.round, settings]);

  useEffect(() => {
    if (!state) return;
    reportScore(gameId, round.round, player.id, player.name, placementValue(state, player.id), { final: false });
  }, [state?.sheets?.[player.id]]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (state?.gameEnded && !reportedRef.current) {
      reportedRef.current = true;
      reportScore(gameId, round.round, player.id, player.name, placementValue(state, player.id), { final: true });
    }
  }, [state?.gameEnded]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!state) return <Card style={{ marginBottom: 20, textAlign: "center" }}><p style={{ color: "#6b4f99", fontStyle: "italic" }}>Loading...</p></Card>;

  const myScore = placementValue(state, player.id);
  const mySheet = state.sheets[player.id];

  if (state.gameEnded) {
    return <GameResultCard icon="🔮" title="The Omens Are Sealed" valueLabel={`${myScore} points`} />;
  }

  const iAmActive = state.activePlayerId === player.id;
  const iRespondedWhite = state.pendingWhite[player.id] !== undefined;
  const whiteSum = state.dice?.white ? state.dice.white[0] + state.dice.white[1] : null;

  const markWhite = (color, number) => submitWhiteMark(gameId, round.round, player.id, color, number);
  const passWhite = () => submitWhiteMark(gameId, round.round, player.id, null, null);
  const markColored = (whiteDieValue, color, number) => submitColoredMark(gameId, round.round, player.id, whiteDieValue, color, number);
  const passColored = () => submitColoredMark(gameId, round.round, player.id, null, null, null);

  // For each cell, work out whether tapping it would fire the shared
  // white mark, your own bonus mark, both (rare — prefers white, since
  // that's the mark everyone's racing for) or neither.
  function cellAction(color, number) {
    if (state.phase !== "deciding") return null;
    if (!iRespondedWhite && whiteSum != null && number === whiteSum && isValidMark(state, player.id, color, number)) {
      return { type: "white" };
    }
    if (iAmActive && !state.coloredResolved && state.dice?.[color] != null) {
      const whites = state.dice.white || [];
      const match = whites.find((w) => w + state.dice[color] === number);
      if (match != null && isValidMark(state, player.id, color, number)) {
        return { type: "colored", whiteDieValue: match };
      }
    }
    return null;
  }

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🔮 The Diviner's Dice</h3>
        <Badge>{myScore} pts</Badge>
      </div>
      <p style={{ color: "#6b4f99", fontSize: 11, margin: "0 0 4px" }}>
        Penalties: <span style={{ color: mySheet.penalties > 0 ? "#ff3860" : "#6b4f99" }}>{"✗".repeat(mySheet.penalties) || "none"}</span> (4 ends the game)
      </p>

      {state.phase === "awaiting-roll" ? (
        iAmActive ? (
          <button onClick={() => rollDice(gameId, round.round, player.id)} style={btnStyle("#ffd700")}>
            🎲 Roll the Dice
          </button>
        ) : (
          <p style={{ color: "#a68fd6", fontSize: 13, fontStyle: "italic", margin: "10px 0" }}>
            Waiting on {state.activePlayerId ? "the active diviner" : "someone"} to cast the dice...
          </p>
        )
      ) : (
        <>
          <div style={{ background: "#0d0618", borderRadius: 8, padding: "8px 12px", margin: "6px 0 12px" }}>
            <span style={{ color: "#ffd700", fontSize: 18, fontWeight: 800, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
              ⚪{state.dice.white[0]} ⚪{state.dice.white[1]} = {whiteSum}
            </span>
            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 6 }}>
              {ROW_COLORS.map(({ id, hex, icon }) => {
                const locked = state.lockedColors.includes(id);
                return (
                  <span key={id} style={{
                    fontSize: 12, padding: "2px 8px", borderRadius: 6, opacity: locked ? 0.35 : 1,
                    background: locked ? "transparent" : `${hex}22`, border: `1px solid ${locked ? "#3d1f5c" : hex}`, color: locked ? "#6b4f99" : hex,
                  }}>
                    {icon} {locked ? "✕" : state.dice[id]}
                  </span>
                );
              })}
            </div>
          </div>

          {!iAmActive && (
            <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 8px" }}>
              {iRespondedWhite ? "You've responded — waiting on everyone else." : `It's ${state.activePlayerId ? "not your turn to roll" : ""}, but you can still mark the shared sum below.`}
            </p>
          )}
        </>
      )}

      {state.phase === "deciding" && (
        <div style={{ display: "grid", gap: 6, marginTop: 4 }}>
          {ROW_COLORS.map(({ id, hex, icon, label }) => {
            const seq = ROW_SEQUENCE[id];
            const marks = mySheet[id].marks;
            return (
              <div key={id} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <span style={{ width: 20, fontSize: 12 }}>{icon}</span>
                <div style={{ display: "flex", gap: 2, flex: 1, justifyContent: "center" }}>
                  {seq.map((n, i) => {
                    const marked = marks[i];
                    const action = !marked ? cellAction(id, n) : null;
                    return (
                      <button
                        key={n}
                        disabled={marked || !action}
                        onClick={() => (action.type === "white" ? markWhite(id, n) : markColored(action.whiteDieValue, id, n))}
                        style={{
                          width: 22, height: 26, borderRadius: 4, fontSize: 10, fontWeight: 700,
                          background: marked ? hex : action ? (action.type === "white" ? "rgba(255,215,0,0.18)" : "rgba(0,255,157,0.18)") : "rgba(255,255,255,0.04)",
                          color: marked ? "#0d0618" : action ? "#f5f0ff" : "#3d1f5c",
                          border: `1px solid ${marked ? hex : action ? (action.type === "white" ? "#ffd700" : "#00ff9d") : "#241436"}`,
                          cursor: marked || !action ? "default" : "pointer",
                        }}
                      >
                        {n}
                      </button>
                    );
                  })}
                </div>
                <span style={{ width: 30, fontSize: 10, color: "#6b4f99", textAlign: "right" }}>{rowScore(mySheet, id)}p</span>
              </div>
            );
          })}

          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 8 }}>
            {!iRespondedWhite && (
              <button onClick={passWhite} style={btnStyle("#ff3860", true)}>Pass Shared Mark</button>
            )}
            {iAmActive && !state.coloredResolved && (
              <button onClick={passColored} style={btnStyle("#a68fd6", true)}>Pass Bonus Mark</button>
            )}
          </div>
          {iAmActive && !state.coloredResolved && (
            <p style={{ color: "#00ff9d", fontSize: 10, margin: "4px 0 0", fontStyle: "italic" }}>
              Green-glowing cells above are your extra bonus mark (white + a colored die).
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

function btnStyle(color, small) {
  return {
    padding: small ? "8px 14px" : "16px 20px", borderRadius: 10, border: `2px solid ${color}`,
    background: `${color}1a`, color, fontSize: small ? 12 : 16, fontWeight: 700, cursor: "pointer",
    fontFamily: "'Orbitron', 'Segoe UI', sans-serif", margin: small ? 0 : "10px 0",
  };
}
