import { useState, useEffect, useRef, useMemo } from "react";
import { Card, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { useCountdown } from "./useCountdown";
import { usePersistedStart } from "./usePersistedStart";
import { reportScore } from "../../lib/challengeScores";
import { generateBoard, evaluate, COLUMN_LABELS } from "../../lib/games/delphisDigData";

// ─── Delphi's Dig ───
// See lib/games/delphisDigData.js's header for the full mechanic. This
// is a genuine memory game, not just a reveal-and-leave-it board: only
// ONE pile is ever uncovered at a time. Digging a different pile
// instantly reburies whatever was showing — there's no "active" state
// to persist per cell, just a single `active` pointer for whichever
// one pile is currently uncovered. A cell you dug a minute ago looks
// exactly like one you've never touched; getting back to it costs
// another two taps (and reburies whatever's currently up), same as
// the first time.
//
// The game itself still has to know when a sigil's three fragments
// have ALL been seen at some point, even though the board itself never
// shows more than one at once — that's `discovered`, a plain ledger of
// {a, op, b} per equation that only ever fills in, never forgets. It's
// the game's memory standing in for a shared truth the player has to
// keep in their own head; the board's visuals don't reflect it at all
// until an equation is actually solved (its 3 fragments then stay
// permanently unearthed, as a small reward for finishing it).
const FINISH_BASE = 100000000000; // same finish-tier trick as NaiadsAqueductPlayer.jsx/SlidingPuzzlePlayer.jsx
const POINTS_PER_SOLVE = 100;
const WRONG_PENALTY = 10;

const PEEKED = 1, DUG = 2;
const COLUMN_FIELD = ["a", "op", "b"];

const OP_LABEL = { "+": "+", "-": "−", "×": "×", "÷": "÷" };

export default function DelphisDigPlayer({ gameId, challenge, round, player }) {
  const startedAt = challenge?.startedAt || null;
  const myStartTime = usePersistedStart(gameId, round.round, challenge?.startedAt, player.id);
  const { timeUp } = useCountdown(challenge?.endsAt);

  const board = useMemo(() => generateBoard(startedAt || 1), [startedAt]);
  const { equations, grid, numEquations } = board;

  // The one pile currently uncovered — { r, c, stage: PEEKED|DUG } — or
  // null when everything's covered. Nothing else on the board tracks
  // its own reveal state; this single pointer IS the board's visible
  // state.
  const [active, setActive] = useState(null);
  // Permanent ledger of what's been dug up at some point, per equation
  // — e.g. { a: 6, op: "×" } once those two fragments have each been
  // fully dug at least once, regardless of what the board shows now.
  const [discovered, setDiscovered] = useState(() => equations.map(() => ({})));
  const [solved, setSolved] = useState(() => new Array(numEquations).fill(false));
  const [wrongCount, setWrongCount] = useState(0);
  const [answerInputs, setAnswerInputs] = useState({});
  const [shake, setShake] = useState(null); // eq index that just got a wrong answer, for a brief flash
  const [done, setDone] = useState(false);
  const [finishedMs, setFinishedMs] = useState(null);
  const reportedRef = useRef(false);
  const [, forceTick] = useState(0);

  useEffect(() => {
    setActive(null);
    setDiscovered(equations.map(() => ({})));
    setSolved(new Array(numEquations).fill(false));
  }, [board]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!myStartTime || done) return;
    const interval = window.setInterval(() => forceTick((t) => t + 1), 250);
    return () => window.clearInterval(interval);
  }, [myStartTime, done]);

  const solvedCount = solved.filter(Boolean).length;

  // Every equation whose full {a, op, b} has been unearthed at some
  // point (per `discovered`, not the current board state) and hasn't
  // been answered yet.
  const readyEquations = useMemo(() => {
    return equations
      .map((eq, i) => ({ ...eq, index: i }))
      .filter((eq) => !solved[eq.index] && discovered[eq.index].a !== undefined && discovered[eq.index].op !== undefined && discovered[eq.index].b !== undefined);
  }, [discovered, equations, solved]);

  const dig = (r, c) => {
    if (done) return;
    const cell = grid[r][c];
    if (solved[cell.eq]) return; // already answered — permanently shown, nothing to dig

    setActive((prev) => {
      if (prev && prev.r === r && prev.c === c) {
        if (prev.stage === PEEKED) {
          setDiscovered((d) => {
            const next = d.slice();
            next[cell.eq] = { ...next[cell.eq], [COLUMN_FIELD[c]]: cell.value };
            return next;
          });
          return { r, c, stage: DUG };
        }
        return prev; // already fully dug — no-op
      }
      // A different pile — whatever was showing reburies itself simply
      // by no longer being `active`; the new one starts fresh at a peek.
      return { r, c, stage: PEEKED };
    });
  };

  const submitAnswer = (eqIndex) => {
    const raw = (answerInputs[eqIndex] || "").trim();
    if (raw === "") return;
    const guess = Number(raw);
    const correct = equations[eqIndex].result;
    if (guess === correct) {
      setSolved((prev) => { const next = prev.slice(); next[eqIndex] = true; return next; });
      setAnswerInputs((prev) => ({ ...prev, [eqIndex]: "" }));
    } else {
      setWrongCount((w) => w + 1);
      setShake(eqIndex);
      window.setTimeout(() => setShake((s) => (s === eqIndex ? null : s)), 450);
    }
  };

  useEffect(() => {
    if (solvedCount >= numEquations && !done) {
      setFinishedMs(Math.max(0, Date.now() - (myStartTime || Date.now())));
      setDone(true);
    }
  }, [solvedCount]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (timeUp && !done) setDone(true);
  }, [timeUp, done]);

  useEffect(() => {
    if (!done || reportedRef.current) return;
    reportedRef.current = true;
    // Math.max floors above the highest possible non-finished partial
    // score, same reasoning as NaiadsAqueductPlayer.jsx's identical fix
    // — a finisher must always outrank someone who merely got close.
    const maxPartial = numEquations * POINTS_PER_SOLVE;
    const partial = Math.max(0, solvedCount * POINTS_PER_SOLVE - wrongCount * WRONG_PENALTY);
    const value = finishedMs != null ? Math.max(maxPartial + 1, FINISH_BASE - finishedMs) : partial;
    reportScore(gameId, round.round, player.id, player.name, value, { final: true });
  }, [done]); // eslint-disable-line react-hooks/exhaustive-deps

  const elapsedSec = myStartTime ? (Math.max(0, Date.now() - myStartTime) / 1000).toFixed(1) : "0.0";

  if (done) {
    return finishedMs != null
      ? <GameResultCard icon="⛏️" title="Prophecy Complete!" valueLabel={`${(finishedMs / 1000).toFixed(1)}s`} />
      : <GameResultCard icon="📜" title="Time's Up" valueLabel={`${solvedCount}/${numEquations} tablets solved`} />;
  }

  if (!startedAt || !myStartTime) {
    return <Card style={{ marginBottom: 20, textAlign: "center" }}><p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic" }}>Loading...</p></Card>;
  }

  const HIDDEN = 0, SOLVED = 3;
  const cellStyle = (state) => ({
    width: "100%", aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center",
    borderRadius: 8, cursor: state === DUG || state === SOLVED ? "default" : "pointer", fontSize: state === HIDDEN ? 15 : 17,
    fontWeight: 800, userSelect: "none",
    background: state === HIDDEN
      ? "linear-gradient(160deg, #6b4a2e, #3a2513)"
      : state === PEEKED
      ? "linear-gradient(160deg, #4a2a72, #2a1650)"
      : state === SOLVED
      ? "linear-gradient(160deg, #0a3a2a, #0d0618)"
      : "linear-gradient(160deg, #1a0f08, #0d0618)",
    border: `2px solid ${state === HIDDEN ? "#8a6540" : state === PEEKED ? "#a68fd6" : "#00ff9d"}`,
    color: state === DUG || state === SOLVED ? "#00ff9d" : "#f5f0ff",
    fontFamily: state === DUG || state === SOLVED ? "'Courier New', Courier, monospace" : "inherit",
    opacity: state === SOLVED ? 0.55 : 1,
  });

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>⛏️ Delphi's Dig</h3>
        <Badge>{elapsedSec}s · {solvedCount}/{numEquations}</Badge>
      </div>
      <p style={{ color: "#6b4f99", fontSize: 11, margin: "0 0 10px", fontStyle: "italic" }}>
        Tap a pile to brush it off and see whose sigil marks it; tap it again to fully unearth the number or operator
        beneath. It's a memory dig, not a checklist — only one pile ever stays uncovered at a time, so digging
        anywhere else buries it right back. Every fragment sharing a sigil belongs to one buried equation, but its
        three pieces are scattered to different rows, one per column — remember what you've found and where.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 6, maxWidth: 280, margin: "0 auto 6px" }}>
        {COLUMN_LABELS.map((label) => (
          <div key={label} style={{ fontSize: 9, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 700 }}>{label}</div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, maxWidth: 280, margin: "0 auto" }}>
        {grid.map((row, r) =>
          row.map((cell, c) => {
            const state = solved[cell.eq] ? SOLVED : active && active.r === r && active.c === c ? active.stage : HIDDEN;
            return (
              <button key={`${r}-${c}`} onClick={() => dig(r, c)} style={cellStyle(state)}>
                {state === HIDDEN ? "" : state === PEEKED ? cell.symbol : (typeof cell.value === "string" ? OP_LABEL[cell.value] : cell.value)}
              </button>
            );
          })
        )}
      </div>

      {readyEquations.length > 0 && (
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
          {readyEquations.map((eq) => (
            <div
              key={eq.index}
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 10,
                background: shake === eq.index ? "rgba(255,56,80,0.15)" : "rgba(0,255,157,0.08)",
                border: `1px solid ${shake === eq.index ? "#ff3850" : "#00ff9d"}`,
              }}
            >
              <span style={{ fontSize: 22 }}>{grid.flat().find((c) => c.eq === eq.index)?.symbol}</span>
              <span style={{ color: "#f5f0ff", fontSize: 14, fontWeight: 700, fontFamily: "'Courier New', Courier, monospace" }}>
                =
              </span>
              <input
                type="number" inputMode="numeric"
                value={answerInputs[eq.index] || ""}
                onChange={(e) => setAnswerInputs((prev) => ({ ...prev, [eq.index]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") submitAnswer(eq.index); }}
                placeholder="?"
                style={{
                  width: 60, padding: "6px 4px", borderRadius: 6, border: "1px solid #c9a84c",
                  background: "#0d0a05", color: "#f5f0ff", textAlign: "center", fontSize: 14, boxSizing: "border-box",
                }}
              />
              <button
                onClick={() => submitAnswer(eq.index)}
                style={{
                  padding: "6px 12px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 800,
                  background: "linear-gradient(135deg, #00ff9d, #00d9ff)", color: "#05010f",
                }}
              >
                ✓
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
