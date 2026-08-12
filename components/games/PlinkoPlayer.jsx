import { useState, useEffect, useRef } from "react";
import { Card, Btn, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { reportScore, subscribeScores } from "../../lib/challengeScores";
import { storageUpdate } from "../../lib/gameStorage";
import {
  subscribePlinkoBracket, resolveDuelIfReady, pickNextChallenger, placementValueFor,
} from "../../lib/games/plinkoBracketData";

const SLOTS = [100, 50, 25, 10, 5, 10, 25, 50, 100];
const ROWS = SLOTS.length - 1;
const W = 300, H = 320;
const SHOTS = 3;
const colX = (col) => (W / (SLOTS.length)) * (col + 0.5);

// ─── Plinko: duel bracket ───
// Big Brother-style: two random players duel (3 drops each, high total
// wins), the winner stays in and picks who's next from whoever hasn't
// played, repeat until someone's beaten everyone. See
// lib/games/plinkoBracketData.js for the actual bracket state machine
// and — importantly — for how each player's final CHALLENGE score is
// just their elimination order encoded as a number, which is what lets
// this whole bracket run on top of the normal scoring pipeline
// unchanged, no special-casing anywhere else in the app.
//
// Deliberately robust to someone closing their tab mid-bracket: EVERY
// player's screen (not just the two currently dueling) watches the
// shared bracket state and will resolve a finished duel, or report an
// eliminated/winning player's final score on their behalf, the moment it
// notices — not just the player it happened to.
export default function PlinkoPlayer({ gameId, round, challenge, player, players }) {
  const [bracket, setBracket] = useState(null);
  const [bracketLoaded, setBracketLoaded] = useState(false); // storageGet resolves missing keys as null, same as "still loading" — this is what tells them apart
  const [scores, setScores] = useState({});
  const [dropsLeft, setDropsLeft] = useState(SHOTS);
  const [myDuelTotal, setMyDuelTotal] = useState(0);
  const [dropping, setDropping] = useState(false);
  const [startCol, setStartCol] = useState(Math.floor(SLOTS.length / 2));
  const [lastResult, setLastResult] = useState(null);
  const canvasRef = useRef(null);
  const ballRef = useRef({ row: 0, col: startCol });
  const reportedRef = useRef(new Set()); // playerIds this client has already reported, so it doesn't spam retries

  useEffect(() => {
    const unsubscribe = subscribePlinkoBracket(gameId, round.round, (v) => { setBracket(v); setBracketLoaded(true); });
    return unsubscribe;
  }, [gameId, round.round]);

  useEffect(() => {
    const unsubscribe = subscribeScores(gameId, round.round, setScores);
    return unsubscribe;
  }, [gameId, round.round]);

  // A champion who wins duel #1 and moves on to duel #2 is the SAME
  // mounted component, still showing iAmDueling === true — without this,
  // their drop count/total from the PREVIOUS duel would just carry over
  // into the new one instead of starting fresh. Keyed off the actual
  // pairing (not just "am I dueling"), so it only resets when the
  // opponent genuinely changes.
  const duelKey = bracket?.current?.join(",") || null;
  useEffect(() => {
    setDropsLeft(SHOTS);
    setMyDuelTotal(0);
    setLastResult(null);
  }, [duelKey]);

  const byName = (id) => players?.find((p) => p.id === id)?.display_name || "?";

  const iAmDueling = bracket?.current?.includes(player.id);
  const iAmChampion = bracket?.champion === player.id && !bracket.current;
  const bracketOver = bracket && !bracket.current && bracket.champion && bracket.pool.length === 0;

  // My own outcome is read from MY locked score, not from the shared
  // bracket.lastLoserId/champion fields — those are transient (whoever
  // was eliminated or crowned MOST RECENTLY), and get overwritten every
  // time any duel resolves, including other players' duels that have
  // nothing to do with me. Using my own score instead means my result
  // screen, once it appears, can't ever silently flip back to a generic
  // spectator view just because the bracket kept moving after me.
  const myScore = scores[player.id];
  const myScoreLocked = !!myScore?.locked;
  const iWonItAll = myScoreLocked && bracket && myScore.value === bracket.totalPlayers;
  const iWasEliminated = myScoreLocked && !iWonItAll;

  // Resolve a finished duel, and report a just-decided player's final
  // score — from ANY client watching, not just the people it happened
  // to. Runs every time the bracket changes.
  useEffect(() => {
    if (!bracket) return;
    if (bracket.current) {
      const [a, b] = bracket.current;
      if (bracket.duelScores[a] != null && bracket.duelScores[b] != null) {
        resolveDuelIfReady(gameId, round.round);
      }
    }
    if (bracket.lastLoserId && !reportedRef.current.has(bracket.lastLoserId)) {
      reportedRef.current.add(bracket.lastLoserId);
      reportScore(gameId, round.round, bracket.lastLoserId, byName(bracket.lastLoserId), bracket.lastLoserValue, { final: true });
    }
    if (bracketOver && !reportedRef.current.has(bracket.champion)) {
      reportedRef.current.add(bracket.champion);
      const value = placementValueFor(bracket, bracket.champion) ?? bracket.totalPlayers;
      reportScore(gameId, round.round, bracket.champion, byName(bracket.champion), value, { final: true });
    }
  }, [bracket]); // eslint-disable-line react-hooks/exhaustive-deps

  // Degenerate case — a lone participant with nobody to duel. Crown them
  // immediately rather than leave them stuck waiting forever. Gated on
  // bracketLoaded specifically (not just `bracket == null`) — storageGet
  // resolves a missing key as null too, and without this gate every
  // normal bracket would flash through a false "no bracket" state on
  // first load, before the real subscription value ever arrives, and
  // wrongly lock in a solo-champion score for someone who's actually in
  // a real bracket.
  useEffect(() => {
    if (!bracketLoaded || bracket !== null) return;
    if (reportedRef.current.has(player.id)) return;
    reportedRef.current.add(player.id);
    reportScore(gameId, round.round, player.id, player.name, 1, { final: true });
  }, [bracket, bracketLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const draw = () => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#3d1f5c";
    for (let r = 0; r < ROWS; r++) {
      const pegsInRow = r + 3;
      for (let p = 0; p < pegsInRow; p++) {
        const x = (W / (pegsInRow + 1)) * (p + 1);
        const y = 30 + r * ((H - 90) / ROWS);
        ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.fillStyle = "#150a28";
    ctx.fillRect(0, H - 34, W, 34);
    SLOTS.forEach((v, i) => {
      ctx.fillStyle = "#ff2d95";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(String(v), colX(i), H - 14);
    });
    const b = ballRef.current;
    const y = 30 + b.row * ((H - 90) / ROWS);
    const x = colX(b.col);
    ctx.fillStyle = "#ff3860";
    ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
  };

  useEffect(() => {
    if (!dropping) ballRef.current = { row: 0, col: startCol };
  }, [startCol, dropping]);

  useEffect(() => { draw(); }); // eslint-disable-line react-hooks/exhaustive-deps

  const drop = () => {
    if (dropping || dropsLeft <= 0) return;
    setDropping(true);
    setLastResult(null);
    let col = startCol;
    ballRef.current = { row: 0, col };
    draw();
    let row = 0;
    const interval = window.setInterval(() => {
      row += 1;
      col = Math.max(0, Math.min(SLOTS.length - 1, col + (Math.random() < 0.5 ? -0.5 : 0.5)));
      ballRef.current = { row, col };
      draw();
      if (row >= ROWS) {
        window.clearInterval(interval);
        const finalSlot = Math.round(col);
        const won = SLOTS[finalSlot];
        setMyDuelTotal((s) => {
          const next = s + won;
          const remaining = dropsLeft - 1;
          if (remaining <= 0) {
            storageUpdate(gameId, `pb:plinko-bracket:${round.round}`, (fresh) => (fresh ? { ...fresh, duelScores: { ...fresh.duelScores, [player.id]: next } } : fresh));
          }
          return next;
        });
        setLastResult(won);
        setDropsLeft((s) => s - 1);
        setDropping(false);
      }
    }, 160);
  };

  const pickOpponent = (id) => pickNextChallenger(gameId, round.round, id);

  if (!challenge?.active) return null;

  if (bracket === null && !bracketLoaded) {
    return <Card style={{ marginBottom: 20, textAlign: "center" }}><p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic" }}>Loading...</p></Card>;
  }

  if (bracket === null && bracketLoaded) {
    // Degenerate case — solo participant, nobody to duel. The effect
    // above already reports their score; this is just the transient
    // visual while that resolves.
    return <GameResultCard icon="🏆" title="Only Competitor" valueLabel="Automatic win" />;
  }

  if (iWonItAll) {
    return <GameResultCard icon="🏆" title="You Won the Bracket!" valueLabel="Undefeated" />;
  }
  if (iWasEliminated) {
    return <GameResultCard icon="🔴" title="Eliminated" valueLabel={`Out in position ${myScore.value} of ${bracket.totalPlayers}`} />;
  }

  if (iAmDueling) {
    const doneWithMyDrops = dropsLeft <= 0;
    const opponentId = bracket.current.find((id) => id !== player.id);
    const opponentDone = bracket.duelScores[opponentId] != null;
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🔴 Plinko Duel</h3>
          <Badge>vs {byName(opponentId)}</Badge>
        </div>
        {doneWithMyDrops ? (
          <p style={{ color: "#00ff9d", fontSize: 14, margin: "0 0 10px" }}>
            Your total: {myDuelTotal} pts — {opponentDone ? "resolving..." : `waiting on ${byName(opponentId)}...`}
          </p>
        ) : (
          <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 10px" }}>{dropsLeft} drop{dropsLeft === 1 ? "" : "s"} left · {myDuelTotal} pts so far</p>
        )}
        <canvas ref={canvasRef} width={W} height={H} style={{ background: "#0d0618", borderRadius: 10, border: "1px solid #3d1f5c" }} />
        {lastResult != null && !dropping && <p style={{ color: "#00ff9d", fontSize: 13, margin: "8px 0 0" }}>Landed on {lastResult} points!</p>}
        {!doneWithMyDrops && (
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 10 }}>
            <button disabled={dropping} onClick={() => setStartCol((c) => Math.max(0, c - 1))} style={arrowStyle}>←</button>
            <Btn onClick={drop} disabled={dropping}>{dropping ? "Dropping..." : "Drop Chip"}</Btn>
            <button disabled={dropping} onClick={() => setStartCol((c) => Math.min(SLOTS.length - 1, c + 1))} style={arrowStyle}>→</button>
          </div>
        )}
      </Card>
    );
  }

  if (iAmChampion && bracket.pool.length > 0) {
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <h3 style={{ color: "#ff2d95", margin: "0 0 4px", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🏆 You're the Reigning Champion</h3>
        <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 12px" }}>Pick who faces you next.</p>
        <div style={{ display: "grid", gap: 6 }}>
          {bracket.pool.map((id) => (
            <button key={id} onClick={() => pickOpponent(id)} style={{
              textAlign: "left", padding: "10px 14px", borderRadius: 8, cursor: "pointer",
              background: "#0d0618", border: "2px solid #3d1f5c", color: "#f5f0ff", fontSize: 14,
              fontFamily: "'Orbitron', 'Segoe UI', sans-serif",
            }}>{byName(id)}</button>
          ))}
        </div>
      </Card>
    );
  }

  // Spectator view — waiting in the pool, already eliminated, or between
  // duels while someone else picks.
  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <h3 style={{ color: "#ff2d95", margin: "0 0 8px", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🔴 Plinko Duel Bracket</h3>
      {bracket?.current ? (
        <p style={{ color: "#f5f0ff", fontSize: 13, margin: "0 0 6px" }}>
          🥊 {byName(bracket.current[0])} vs {byName(bracket.current[1])} is dueling now.
        </p>
      ) : bracket?.champion ? (
        <p style={{ color: "#f5f0ff", fontSize: 13, margin: "0 0 6px" }}>🏆 {byName(bracket.champion)} is picking their next challenger...</p>
      ) : null}
      <p style={{ color: "#6b4f99", fontSize: 12, margin: 0 }}>{bracket?.eliminationCount || 0} eliminated so far, {(bracket?.pool.length || 0)} still waiting.</p>
    </Card>
  );
}

const arrowStyle = { width: 44, height: 36, borderRadius: 8, background: "#0d0618", border: "1px solid #3d1f5c", color: "#f5f0ff", fontSize: 16, cursor: "pointer" };
