import { useState, useEffect, useRef } from "react";
import { Card, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { useCountdown } from "./useCountdown";
import { reportScore, peekSession, getOrStartSession } from "../../lib/challengeScores";
import SwipeControlsCallout from "./SwipeControlsCallout";
import { COLOR_BLIND_SAFE_PALETTE } from "../../lib/games/colorBlindPalette";

const SIZE = 6;
// Vibrant default (shape already varies a bit — diamond/hexagon/circle —
// but relies on color as the main signal). The colorblind-safe set below
// swaps in maximally distinct shapes PLUS the Okabe-Ito palette as a
// colored ring, so shape alone is enough to tell gems apart even before
// color comes into it.
const GEMS_VIBRANT = [
  { symbol: "💎", ring: "#ff2d95" }, { symbol: "🔷", ring: "#00d9ff" }, { symbol: "🔶", ring: "#ff9f4d" },
  { symbol: "🟣", ring: "#b829ff" }, { symbol: "🟢", ring: "#00ff9d" },
];
const GEMS_COLOR_BLIND = [
  { symbol: "★", ring: COLOR_BLIND_SAFE_PALETTE[0] }, { symbol: "●", ring: COLOR_BLIND_SAFE_PALETTE[1] },
  { symbol: "▲", ring: COLOR_BLIND_SAFE_PALETTE[2] }, { symbol: "◆", ring: COLOR_BLIND_SAFE_PALETTE[3] },
  { symbol: "■", ring: COLOR_BLIND_SAFE_PALETTE[4] },
];
const GEM_COUNT = GEMS_VIBRANT.length;

function randomGrid() {
  return Array.from({ length: SIZE * SIZE }, () => Math.floor(Math.random() * GEM_COUNT));
}

// Returns GROUPS (each a run of 3+ same-gem positions), not just a flat
// set — a longer run stays its own group instead of collapsing into an
// undifferentiated blob, which is what makes per-length bonus scoring
// possible below. A run of 4 is genuinely detected and cleared as one
// group of 4, not two overlapping groups of 3.
function findMatchGroups(grid) {
  const groups = [];
  for (let r = 0; r < SIZE; r++) {
    let runStart = 0;
    for (let c = 1; c <= SIZE; c++) {
      const same = c < SIZE && grid[r * SIZE + c] != null && grid[r * SIZE + c] === grid[r * SIZE + runStart];
      if (!same) {
        const len = c - runStart;
        if (len >= 3) groups.push(Array.from({ length: len }, (_, k) => r * SIZE + runStart + k));
        runStart = c;
      }
    }
  }
  for (let c = 0; c < SIZE; c++) {
    let runStart = 0;
    for (let r = 1; r <= SIZE; r++) {
      const same = r < SIZE && grid[r * SIZE + c] != null && grid[r * SIZE + c] === grid[runStart * SIZE + c];
      if (!same) {
        const len = r - runStart;
        if (len >= 3) groups.push(Array.from({ length: len }, (_, k) => (runStart + k) * SIZE + c));
        runStart = r;
      }
    }
  }
  return groups;
}

function findMatches(grid) {
  const matched = new Set();
  findMatchGroups(grid).forEach((g) => g.forEach((i) => matched.add(i)));
  return matched;
}

// Escalating points per gem based on that specific run's length — a
// 3-match still scores like it always did (10/gem), but a 4 is worth
// more per gem, and 5+ more still. A gem shared between an overlapping
// horizontal + vertical run (an L/T shape) legitimately scores for both
// groups — standard match-3 convention, not a bug.
function pointsPerGem(len) {
  if (len >= 5) return 20;
  if (len === 4) return 15;
  return 10;
}

function resolveGrid(grid) {
  let g = [...grid];
  let totalScore = 0;
  let biggestGroup = 0;
  for (let guard = 0; guard < 20; guard++) {
    const groups = findMatchGroups(g);
    if (groups.length === 0) break;
    groups.forEach((group) => {
      biggestGroup = Math.max(biggestGroup, group.length);
      totalScore += group.length * pointsPerGem(group.length);
    });
    const toClear = new Set();
    groups.forEach((group) => group.forEach((i) => toClear.add(i)));
    toClear.forEach((i) => (g[i] = null));
    for (let c = 0; c < SIZE; c++) {
      const col = [];
      for (let r = SIZE - 1; r >= 0; r--) { const v = g[r * SIZE + c]; if (v != null) col.push(v); }
      while (col.length < SIZE) col.push(Math.floor(Math.random() * GEM_COUNT));
      for (let r = SIZE - 1; r >= 0; r--) g[r * SIZE + c] = col[SIZE - 1 - r];
    }
  }
  return { grid: g, score: totalScore, biggestGroup };
}

const MATCH3_DURATION_MS = 3 * 60 * 1000;

export default function Match3Player({ gameId, round, challenge, player }) {
  const colorBlindMode = !!player?.gamePrefs?.colorBlindMode;
  const [swipeOverride, setSwipeOverride] = useState(false); // true once turned on via the in-game callout this session, before player.gamePrefs itself has caught up
  const swipeEnabled = !!player?.gamePrefs?.swipeControls || swipeOverride;
  const GEMS = colorBlindMode ? GEMS_COLOR_BLIND : GEMS_VIBRANT;

  // Match 3 always gets a flat 3 minutes from the moment the player hits
  // Start — not challenge?.endsAt (the host's round length), and not
  // running from the moment the component mounts either. That start
  // moment is persisted (see lib/challengeScores.js) so navigating away
  // mid-game and coming back resumes the SAME clock instead of showing
  // the Start button again and handing them a fresh 3 minutes.
  const [startedAt, setStartedAt] = useState(null);
  const [checkedExisting, setCheckedExisting] = useState(false);
  const [localEndsAt, setLocalEndsAt] = useState(null);
  const { timeUp, remainingSec } = useCountdown(localEndsAt);
  const [grid, setGrid] = useState(() => {
    let g = randomGrid();
    while (findMatches(g).size > 0) g = randomGrid();
    return g;
  });
  const [score, setScore] = useState(0);
  const [selected, setSelected] = useState(null);
  const [done, setDone] = useState(false);
  const [comboFlash, setComboFlash] = useState(null);
  const reportedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    peekSession(gameId, round.round, challenge?.startedAt, player.id).then((existingStart) => {
      if (cancelled) return;
      if (existingStart) {
        setStartedAt(existingStart);
        setLocalEndsAt(existingStart + MATCH3_DURATION_MS);
      }
      setCheckedExisting(true);
    });
    return () => { cancelled = true; };
  }, [gameId, round.round, challenge?.startedAt, player.id]);

  const handleStart = async () => {
    const now = await getOrStartSession(gameId, round.round, challenge?.startedAt, player.id);
    setStartedAt(now);
    setLocalEndsAt(now + MATCH3_DURATION_MS);
  };

  useEffect(() => {
    if (!startedAt) return;
    reportScore(gameId, round.round, player.id, player.name, score, { final: false });
  }, [score, startedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (timeUp && !reportedRef.current) {
      reportedRef.current = true;
      setDone(true);
      reportScore(gameId, round.round, player.id, player.name, score, { final: true });
    }
  }, [timeUp]); // eslint-disable-line react-hooks/exhaustive-deps

  const areAdjacent = (a, b) => {
    const ar = Math.floor(a / SIZE), ac = a % SIZE, br = Math.floor(b / SIZE), bc = b % SIZE;
    return (ar === br && Math.abs(ac - bc) === 1) || (ac === bc && Math.abs(ar - br) === 1);
  };

  const attemptSwap = (a, b) => {
    if (done || !startedAt || a == null || b == null || a === b || !areAdjacent(a, b)) return;
    const swapped = [...grid];
    [swapped[a], swapped[b]] = [swapped[b], swapped[a]];
    if (findMatches(swapped).size === 0) return; // invalid swap, no match — snap back (no-op, grid unchanged)

    const { grid: resolved, score: gained, biggestGroup } = resolveGrid(swapped);
    setGrid(resolved);
    setScore((s) => s + gained);
    if (biggestGroup >= 4) {
      setComboFlash(biggestGroup >= 5 ? "5+ COMBO!" : "4 COMBO!");
      window.setTimeout(() => setComboFlash(null), 900);
    }
  };

  const clickTile = (i) => {
    if (done || !startedAt) return;
    if (selected === null) { setSelected(i); return; }
    if (selected === i) { setSelected(null); return; }
    const from = selected;
    setSelected(null);
    if (!areAdjacent(from, i)) { setSelected(i); return; }
    attemptSwap(from, i);
  };

  // Swipe alternative: swipe a tile in a direction to swap it with that
  // neighbor directly, instead of tap-tap-select. Only active when the
  // player has swipeControls on — tap-to-select above always still works.
  //
  // Deliberately NOT using the shared useSwipeControls hook here — that
  // hook is meant for a single, whole-board swipe target (see the maze
  // games), and calling it once per tile inside the grid's .map() would
  // mean invoking a hook conditionally, inside a loop — a real React
  // Rules of Hooks violation, not just a style nitpick. This is the same
  // swipe-distance-and-direction logic, just as plain functions (backed
  // by one top-level ref) instead of a hook, so it's safe to use
  // per-tile.
  const swipeStartRef = useRef(null);
  const MIN_SWIPE_DISTANCE = 24;

  const neighborInDirection = (i, dir) => {
    const r = Math.floor(i / SIZE), c = i % SIZE;
    if (dir === "up") return r > 0 ? i - SIZE : null;
    if (dir === "down") return r < SIZE - 1 ? i + SIZE : null;
    if (dir === "left") return c > 0 ? i - 1 : null;
    return c < SIZE - 1 ? i + 1 : null;
  };

  const onTileTouchStart = (i) => (e) => {
    if (!swipeEnabled) return;
    const t = e.touches?.[0];
    if (t) swipeStartRef.current = { i, x: t.clientX, y: t.clientY };
  };

  const onTileTouchEnd = (i) => (e) => {
    if (!swipeEnabled || !swipeStartRef.current || swipeStartRef.current.i !== i) return;
    const t = e.changedTouches?.[0];
    const { x, y } = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!t) return;
    const dx = t.clientX - x, dy = t.clientY - y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < MIN_SWIPE_DISTANCE) return; // too short — treat as a tap
    const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
    const target = neighborInDirection(i, dir);
    if (target != null) { setSelected(null); attemptSwap(i, target); }
  };

  if (done) return <GameResultCard icon="💎" title="Time's Up" valueLabel={`${score} points`} />;

  if (!startedAt) {
    if (!checkedExisting) {
      return <Card style={{ marginBottom: 20, textAlign: "center" }}><p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic" }}>Loading...</p></Card>;
    }
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <h3 style={{ color: "#ff2d95", margin: "0 0 8px", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>💎 Match 3</h3>
        <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 14px" }}>
          You get 3 minutes on the clock from the moment you hit Start, no matter how long this round is.
          Match 4 or 5+ in a row for bonus points.
        </p>
        {!swipeEnabled && <SwipeControlsCallout player={player} onEnabled={() => setSwipeOverride(true)} />}
        <button onClick={handleStart} style={{
          padding: "10px 24px", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 700,
          background: "linear-gradient(135deg, #ff2d95, #b829ff)", border: "none", color: "#05010f",
          fontFamily: "'Orbitron', 'Segoe UI', sans-serif",
        }}>Start</button>
      </Card>
    );
  }

  return (
    <Card style={{ marginBottom: 20, textAlign: "center", position: "relative" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>💎 Match 3</h3>
        <Badge color={remainingSec != null && remainingSec <= 15 ? "#ff3860" : "#ff2d95"}>{remainingSec != null ? `${remainingSec}s` : ""} · {score} pts</Badge>
      </div>
      {comboFlash && (
        <div style={{
          position: "absolute", top: 40, left: "50%", transform: "translateX(-50%)", zIndex: 5,
          background: "rgba(255,45,149,0.9)", color: "#05010f", fontWeight: 900, fontSize: 14,
          padding: "4px 14px", borderRadius: 20, fontFamily: "'Orbitron', 'Segoe UI', sans-serif",
        }}>
          {comboFlash}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${SIZE}, 42px)`, gap: 3, margin: "0 auto", width: "fit-content" }}>
        {grid.map((v, i) => {
          const gem = GEMS[v];
          return (
            <button
              key={i} onClick={() => clickTile(i)}
              onTouchStart={onTileTouchStart(i)} onTouchEnd={onTileTouchEnd(i)}
              style={{
                width: 42, height: 42, fontSize: 20, borderRadius: 6, cursor: "pointer",
                background: selected === i ? "rgba(255,45,149,0.25)" : "#0d0618",
                border: `2px solid ${selected === i ? "#ff2d95" : gem.ring + "55"}`,
                color: gem.ring, touchAction: swipeEnabled ? "none" : "auto",
              }}
            >{gem.symbol}</button>
          );
        })}
      </div>
      <p style={{ color: "#6b4f99", fontSize: 11, marginTop: 8, fontStyle: "italic" }}>
        Tap two adjacent gems to swap them.{swipeEnabled && " Or swipe a gem in a direction to swap it that way."}
      </p>
    </Card>
  );
}
