import { useState, useEffect, useRef } from "react";
import { Card, PausedBanner } from "./traitorsUi";
import { storageUpdate, subscribeGameState } from "../lib/gameStorage";
import { generateMaze, firstPersonView, MAZE_DIRS, STORAGE_KEY_MAZE3D } from "../lib/mazeData";
import { TRAITORS_GAME_REGISTRY } from "../lib/traitorsMiniGames";
import TraitorsRulesGate from "./games/TraitorsRulesGate";
import { getOrStartSession, peekSession } from "../lib/traitorsChallengeSession";

// ─── 3D Maze: Player View ───
export default function Maze3DPlayer({ gameId, playerName }) {
  const [st, setSt] = useState(null);
  const [pos, setPos] = useState([0, 0]);
  const [facing, setFacing] = useState(2);
  const [started, setStarted] = useState(false);
  const [startTime, setStartTime] = useState(null);
  const [finish, setFinish] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [visited, setVisited] = useState(() => new Set(["0,0"]));
  const timerRef = useRef(null);
  const pausedMsRef = useRef(0);
  const pauseStartRef = useRef(null);

  useEffect(() => {
    const unsubscribe = subscribeGameState(gameId, STORAGE_KEY_MAZE3D, (value) => {
      setSt(value);
      if (value?.times?.[playerName]) setFinish(value.times[playerName]);
    });
    return unsubscribe;
  }, [gameId, playerName]);

  // Track paused duration so the escape timer freezes instead of drifting.
  useEffect(() => {
    if (st?.paused) {
      if (!pauseStartRef.current) pauseStartRef.current = Date.now();
    } else if (pauseStartRef.current) {
      pausedMsRef.current += Date.now() - pauseStartRef.current;
      pauseStartRef.current = null;
    }
  }, [st?.paused]);

  useEffect(() => {
    if (started && !finish && !st?.paused) {
      timerRef.current = window.setInterval(() => setElapsed(Date.now() - startTime - pausedMsRef.current), 50);
      return () => window.clearInterval(timerRef.current);
    }
  }, [started, finish, startTime, st?.paused]);

  // Resume an already-running clock on mount/remount — a tab switch or the
  // browser backgrounding shouldn't silently hand this player a fresh
  // "haven't moved yet" state if they'd already taken their first step.
  // Deliberately read-only (peekSession, not getOrStartSession) — checking
  // this must never itself start a clock for a player who hasn't actually
  // moved yet, same reasoning as Match3Player's own identical check.
  useEffect(() => {
    if (!st?.createdAt) return;
    let cancelled = false;
    peekSession(gameId, STORAGE_KEY_MAZE3D, st.createdAt, playerName).then((existing) => {
      if (cancelled || !existing) return;
      setStarted(true);
      setStartTime(existing);
    });
    return () => { cancelled = true; };
  }, [gameId, st?.createdAt, playerName]);

  const maze = st ? generateMaze(st.rows, st.cols, st.seed) : null;
  const goalR = st ? st.rows - 1 : 0, goalC = st ? st.cols - 1 : 0;

  useEffect(() => {
    setVisited((prev) => new Set(prev).add(`${pos[0]},${pos[1]}`));
  }, [pos]);

  useEffect(() => {
    if (!maze || !started || finish || st?.paused) return;
    if (pos[0] === goalR && pos[1] === goalC) {
      const t = Date.now() - startTime - pausedMsRef.current;
      setFinish(t);
      setElapsed(t);
      (async () => {
        await storageUpdate(gameId, STORAGE_KEY_MAZE3D, (fresh) => {
          if (!fresh) return null;
          fresh.times = { ...(fresh.times || {}), [playerName]: t };
          return fresh;
        });
      })();
    }
  }, [pos]); // eslint-disable-line react-hooks/exhaustive-deps

  // The clock starts on this player's first real move, not the instant the
  // maze goes active — getOrStartSession still makes that moment durable
  // (first call wins), it just isn't called until there's actually a first
  // move to make.
  const beginClock = () => {
    if (started) return;
    setStarted(true);
    getOrStartSession(gameId, STORAGE_KEY_MAZE3D, st.createdAt, playerName).then(setStartTime);
  };

  const forward = () => {
    if (!maze || finish || st?.paused) return;
    beginClock();
    const [r, c] = pos;
    const dir = MAZE_DIRS[facing];
    if (!maze[r][c][dir.wall]) setPos([r + dir.dr, c + dir.dc]);
  };
  const back = () => {
    if (!maze || finish || st?.paused) return;
    beginClock();
    const [r, c] = pos;
    const bf = (facing + 2) % 4;
    const dir = MAZE_DIRS[bf];
    if (!maze[r][c][dir.wall]) setPos([r + dir.dr, c + dir.dc]);
  };
  const turnL = () => { if (!st?.paused) setFacing((f) => (f + 3) % 4); };
  const turnR = () => { if (!st?.paused) setFacing((f) => (f + 1) % 4); };

  useEffect(() => {
    const h = (e) => {
      // Only steer the maze while this challenge is actually running for this
      // player — otherwise this listener sits on `window` at all times (since
      // every challenge's Player component is always mounted) and silently
      // swallows "a"/"w"/"s"/"d" and the arrow keys everywhere else in the
      // app, including other challenges' text inputs (e.g. Word Scramble).
      if (!st || !st.active || finish || st?.paused) return;
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.target?.isContentEditable) return;
      if (["ArrowUp", "w", "W"].includes(e.key)) { e.preventDefault(); forward(); }
      if (["ArrowDown", "s", "S"].includes(e.key)) { e.preventDefault(); back(); }
      if (["ArrowLeft", "a", "A"].includes(e.key)) { e.preventDefault(); turnL(); }
      if (["ArrowRight", "d", "D"].includes(e.key)) { e.preventDefault(); turnR(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  if (!st || !st.active) return null;
  if (st.paused && !finish) return <PausedBanner icon="🧭" title="3D Maze" />;

  const isParticipant = !st.participants || st.participants.includes(playerName);
  if (st.participants && !isParticipant) {
    return (
      <Card style={{ marginBottom: 20, borderColor: "rgba(201,168,76,0.3)", textAlign: "center" }}>
        <h3 style={{ color: "#c9a84c", margin: "0 0 6px", fontSize: 15, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>🧭 3D Maze</h3>
        <p style={{ color: "#a09080", fontSize: 13, margin: 0, fontStyle: "italic" }}>You're spectating this round — no maze for you this time.</p>
      </Card>
    );
  }

  const compass = ["North", "East", "South", "West"][facing];
  const slices = maze ? firstPersonView(maze, pos[0], pos[1], facing, st.rows, st.cols) : [];
  const W = 300, H = 200;
  const DEPTH_COLORS = ["#1c2f52", "#24243f", "#3a2a4a", "#2a3f4a", "#472f3a", "#2f4a3a"];
  const WALL_HILITE = "#c9a84c";
  const registryEntry = TRAITORS_GAME_REGISTRY[STORAGE_KEY_MAZE3D];

  return (
    <TraitorsRulesGate icon={registryEntry.icon} label={registryEntry.label} blurb={registryEntry.blurb} resetKey={st.createdAt}>
    <Card style={{ marginBottom: 20, borderColor: "rgba(201,168,76,0.3)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h3 style={{ color: "#c9a84c", margin: 0, fontSize: 15, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>🧭 3D Maze</h3>
        <span style={{ fontSize: 16, fontWeight: 700, color: finish ? "#7a9a5c" : "#c9a84c", fontFamily: "'Courier New', monospace" }}>
          {finish ? `${(finish / 1000).toFixed(2)}s` : started ? `${(elapsed / 1000).toFixed(1)}s` : "—"}
        </span>
      </div>
      {finish ? (
        <div style={{ textAlign: "center", padding: "10px 0" }}>
          <div style={{ fontSize: 12, color: "#7a9a5c", textTransform: "uppercase", letterSpacing: 2, fontWeight: 700 }}>✦ Escaped ✦</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#c9a84c", margin: "8px 0", fontFamily: "'Courier New', monospace" }}>{(finish / 1000).toFixed(2)}s</div>
          <p style={{ color: "#706050", fontSize: 12, fontStyle: "italic" }}>Your time is on the leaderboard.</p>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8, flexWrap: "wrap", gap: 4 }}>
            <p style={{ color: "#a09080", fontSize: 12, fontStyle: "italic", margin: 0 }}>Facing <strong style={{ color: "#c9a84c" }}>{compass}</strong>. Reach the far corner. Arrows/WASD or buttons.</p>
            <span style={{ fontSize: 11, color: "#7a9a5c" }}>🟡 you on map below · shaded = explored</span>
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", background: "#05080f", borderRadius: 8, border: "1px solid #253550", display: "block" }}>
            {(() => {
              const rects = [];
              let inset = 0;
              const step = 26;
              for (let d = 0; d < slices.length; d++) {
                const s = slices[d];
                const x0 = inset, y0 = inset * 0.66, x1 = W - inset, y1 = H - inset * 0.66;
                const fillColor = DEPTH_COLORS[d % DEPTH_COLORS.length];
                rects.push(<rect key={`f${d}`} x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill={fillColor} stroke="#0a1020" strokeWidth="1.5" />);
                rects.push(<line key={`l${d}`} x1={x0} y1={y0} x2={x0} y2={y1} stroke={s.leftOpen ? "#7a9a5c" : "#c45c3c"} strokeOpacity={s.leftOpen ? 0.85 : 0.35} strokeWidth="3" />);
                rects.push(<line key={`r${d}`} x1={x1} y1={y0} x2={x1} y2={y1} stroke={s.rightOpen ? "#7a9a5c" : "#c45c3c"} strokeOpacity={s.rightOpen ? 0.85 : 0.35} strokeWidth="3" />);
                if (!s.openAhead) {
                  rects.push(<rect key={`w${d}`} x={x0 + 8} y={y0 + 6} width={x1 - x0 - 16} height={y1 - y0 - 12} fill="#0c1425" stroke={WALL_HILITE} strokeWidth="2" />);
                  break;
                }
                inset += step;
              }
              return rects;
            })()}
            {pos[0] === goalR && pos[1] === goalC && <text x={W / 2} y={H / 2} fill="#c9a84c" fontSize="16" fontWeight="700" textAnchor="middle">⭐ EXIT</text>}
          </svg>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 12, maxWidth: 240, margin: "12px auto 0" }}>
            <button onClick={turnL} style={mazeBtn}>↺ Left</button>
            <button onClick={forward} style={mazeBtn}>▲ Fwd</button>
            <button onClick={turnR} style={mazeBtn}>Right ↻</button>
            <div />
            <button onClick={back} style={mazeBtn}>▼ Back</button>
            <div />
          </div>
          {maze && (
            <MazeMinimap maze={maze} rows={st.rows} cols={st.cols} pos={pos} facing={facing} visited={visited} goalR={goalR} goalC={goalC} />
          )}
        </>
      )}
    </Card>
    </TraitorsRulesGate>
  );
}

const mazeBtn = { padding: "12px 0", borderRadius: 8, background: "#132038", border: "1px solid #c9a84c55", color: "#f0e6d3", fontSize: 13, fontWeight: 600, cursor: "pointer" };

// Top-down minimap for the 3D maze — fog-of-war style. Only reveals walls
// and shading for cells the player has actually stepped in.
function MazeMinimap({ maze, rows, cols, pos, facing, visited, goalR, goalC }) {
  const cell = Math.max(10, Math.min(22, Math.floor(220 / Math.max(rows, cols))));
  const W = cols * cell, H = rows * cell;
  const arrow = ["-90", "0", "90", "180"][facing];
  const goalVisited = visited.has(`${goalR},${goalC}`);
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 10, color: "#706050", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4, textAlign: "center" }}>Map (explored so far)</div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: 220, display: "block", margin: "0 auto", background: "#05080f", borderRadius: 8, border: "1px solid #253550" }}>
        {Array.from({ length: rows }).map((_, r) => Array.from({ length: cols }).map((_, c) => {
          if (!visited.has(`${r},${c}`)) return null;
          return <rect key={`v${r}-${c}`} x={c * cell} y={r * cell} width={cell} height={cell} fill="rgba(201,168,76,0.16)" />;
        }))}
        {goalVisited && (
          <>
            <rect x={goalC * cell} y={goalR * cell} width={cell} height={cell} fill="rgba(122,154,92,0.35)" />
            <text x={goalC * cell + cell / 2} y={goalR * cell + cell / 2 + 4} fontSize={cell * 0.7} textAnchor="middle" fill="#7a9a5c">★</text>
          </>
        )}
        {Array.from({ length: rows }).map((_, r) => Array.from({ length: cols }).map((_, c) => {
          if (!visited.has(`${r},${c}`)) return null;
          const cd = maze[r][c];
          const x = c * cell, y = r * cell;
          const lines = [];
          if (cd.top) lines.push(<line key={`t${r}-${c}`} x1={x} y1={y} x2={x + cell} y2={y} stroke="#c9a84c" strokeWidth="1.5" />);
          if (cd.left) lines.push(<line key={`le${r}-${c}`} x1={x} y1={y} x2={x} y2={y + cell} stroke="#c9a84c" strokeWidth="1.5" />);
          if (cd.bottom) lines.push(<line key={`b${r}-${c}`} x1={x} y1={y + cell} x2={x + cell} y2={y + cell} stroke="#c9a84c" strokeWidth="1.5" />);
          if (cd.right) lines.push(<line key={`ri${r}-${c}`} x1={x + cell} y1={y} x2={x + cell} y2={y + cell} stroke="#c9a84c" strokeWidth="1.5" />);
          return lines;
        }))}
        <g transform={`translate(${pos[1] * cell + cell / 2}, ${pos[0] * cell + cell / 2}) rotate(${arrow})`}>
          <circle r={cell * 0.42} fill="#ffd93d" stroke="#0c1425" strokeWidth="1.5" />
          <polygon points={`0,${-cell * 0.28} ${cell * 0.16},${cell * 0.14} ${-cell * 0.16},${cell * 0.14}`} fill="#0c1425" />
        </g>
      </svg>
    </div>
  );
}
