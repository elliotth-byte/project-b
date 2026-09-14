import { useState, useEffect, useRef } from "react";
import { Card, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { reportScore } from "../../lib/challengeScores";
import {
  subscribeTorched, placeMarker, startShootingPhase, submitShotForRound, isValidPlacement, placementValue,
  TORCHED_TARGET_ROUNDS_ESTIMATE, TORCHED_MIN_ROUND_SEC, TORCHED_MAX_ROUND_SEC,
} from "../../lib/games/torchedData";

// Mirrors resolveRound's own clamp exactly (see that function's own
// comment) — this is purely for the player-facing countdown display,
// never used to decide anything about whether a round is actually
// over; that's entirely server-side, this just has to render the same
// number so the countdown the player sees matches reality.
function perRoundMs(challengeDurationSec) {
  const totalSec = challengeDurationSec || 900;
  return Math.max(TORCHED_MIN_ROUND_SEC, Math.min(TORCHED_MAX_ROUND_SEC, totalSec / TORCHED_TARGET_ROUNDS_ESTIMATE)) * 1000;
}

function formatCountdown(ms) {
  if (ms <= 0) return "0:00";
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function TorchedPlayer({ gameId, round, challenge, player, players, settings }) {
  const [state, setState] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [placeRow, setPlaceRow] = useState(null);
  const [placeCol, setPlaceCol] = useState(null);
  const [orientation, setOrientation] = useState("horizontal");
  const [now, setNow] = useState(Date.now());
  const reportedRef = useRef(new Set());

  useEffect(() => {
    const unsubscribe = subscribeTorched(gameId, round.round, (v) => { setState(v); setLoaded(true); });
    return unsubscribe;
  }, [gameId, round.round]);

  // Only actually needed while shooting (for the countdown) — cheap
  // enough as a 1s interval either way, and simpler than mounting/
  // unmounting the timer based on phase.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const byName = (id) => players?.find((p) => p.id === id)?.display_name || "?";

  const myMarker = state?.markers?.[player.id];
  const iHavePlaced = !!myMarker;
  const iAmAlive = myMarker?.alive !== false && iHavePlaced;
  const gameOver = !!state?.winnerId;
  const iWon = state?.winnerId === player.id;
  const iAmEliminated = iHavePlaced && !iAmAlive;

  // Report my own final score once I'm eliminated, the game's decided a
  // winner, or the whole challenge's timer runs out.
  useEffect(() => {
    if (!state || reportedRef.current.has(player.id)) return;
    if (iAmEliminated || gameOver) {
      reportedRef.current.add(player.id);
      reportScore(gameId, round.round, player.id, player.name, placementValue(state, player.id), { final: true });
    }
  }, [state, iAmEliminated, gameOver]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!state || iAmEliminated || gameOver) return;
    reportScore(gameId, round.round, player.id, player.name, placementValue(state, player.id), { final: false });
  }, [state?.roundNum]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!challenge?.active) return null;
  if (state === null && !loaded) {
    return <Card style={{ marginBottom: 20, textAlign: "center" }}><p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic" }}>Loading...</p></Card>;
  }
  if (state === null && loaded) {
    return <GameResultCard icon="🔥" title="Not Enough Players" valueLabel="Nobody to torch" />;
  }

  const gridSize = state.gridSize;
  const cells = Array.from({ length: gridSize }, (_, r) => Array.from({ length: gridSize }, (_, c) => [r, c]));

  // Fine-grained hit/miss lookups for rendering the board — every past
  // (resolved) shot shows for everyone, since the shot log itself is
  // public; only UN-hit live markers, and any of THIS round's still-
  // pending calls, stay hidden.
  const shotAt = (r, c) => state.shotsLog.find((s) => s.at[0] === r && s.at[1] === c);
  const myMarkerHas = (r, c) => myMarker?.cells?.some(([mr, mc]) => mr === r && mc === c);

  if (gameOver) {
    return (
      <GameResultCard
        icon={iWon ? "🏆" : "🔥"}
        title={iWon ? "Last Marker Standing!" : iAmEliminated ? "Torched" : "Game Over"}
        valueLabel={iWon ? "You won" : iAmEliminated ? `Eliminated in round ${state.eliminatedInRound?.[player.id] ?? "?"}` : `${byName(state.winnerId)} wins`}
      />
    );
  }

  if (iAmEliminated) {
    return <GameResultCard icon="🔥" title="Torched" valueLabel="Your marker was hit — you're out, but the game continues without you." />;
  }

  // ─── Placement phase ───
  if (!state.shooting) {
    if (iHavePlaced) {
      return (
        <Card style={{ marginBottom: 20, textAlign: "center" }}>
          <h3 style={{ color: "#ff2d95", margin: "0 0 8px", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🔥 Torched</h3>
          <p style={{ color: "#a68fd6", fontSize: 13, margin: 0 }}>
            Marker placed and hidden. Waiting on {state.placedIds.length} of {Object.keys(players || {}).length || "?"} players to place theirs before shooting begins...
          </p>
        </Card>
      );
    }

    const previewCells = placeRow !== null && placeCol !== null
      ? (orientation === "horizontal" ? [[placeRow, placeCol], [placeRow, placeCol + 1], [placeRow, placeCol + 2]] : [[placeRow, placeCol], [placeRow + 1, placeCol], [placeRow + 2, placeCol]])
      : [];
    const previewValid = previewCells.length > 0 && isValidPlacement(gridSize, previewCells);
    const previewHas = (r, c) => previewCells.some(([pr, pc]) => pr === r && pc === c);

    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <h3 style={{ color: "#ff2d95", margin: "0 0 4px", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🔥 Torched</h3>
        <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 10px" }}>
          Secretly place your 3-cell marker on the shared grid. Tap a starting cell, pick a direction, then confirm.
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 10 }}>
          <button onClick={() => setOrientation("horizontal")} style={{
            padding: "6px 14px", borderRadius: 6, cursor: "pointer",
            background: orientation === "horizontal" ? "rgba(255,45,149,0.2)" : "#0d0618",
            border: `2px solid ${orientation === "horizontal" ? "#ff2d95" : "#3d1f5c"}`,
            color: orientation === "horizontal" ? "#ff2d95" : "#a68fd6", fontSize: 12, fontWeight: 700,
          }}>↔ Horizontal</button>
          <button onClick={() => setOrientation("vertical")} style={{
            padding: "6px 14px", borderRadius: 6, cursor: "pointer",
            background: orientation === "vertical" ? "rgba(255,45,149,0.2)" : "#0d0618",
            border: `2px solid ${orientation === "vertical" ? "#ff2d95" : "#3d1f5c"}`,
            color: orientation === "vertical" ? "#ff2d95" : "#a68fd6", fontSize: 12, fontWeight: 700,
          }}>↕ Vertical</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${gridSize}, 1fr)`, gap: 3, maxWidth: 320, margin: "0 auto 12px" }}>
          {cells.flat().map(([r, c]) => (
            <button
              key={`${r}-${c}`}
              onClick={() => { setPlaceRow(r); setPlaceCol(c); }}
              style={{
                aspectRatio: "1", borderRadius: 3, cursor: "pointer", padding: 0,
                background: previewHas(r, c) ? (previewValid ? "rgba(0,255,157,0.35)" : "rgba(255,56,96,0.35)") : "#0d0618",
                border: `1px solid ${previewHas(r, c) ? (previewValid ? "#00ff9d" : "#ff3860") : "#3d1f5c"}`,
              }}
            />
          ))}
        </div>
        <button
          onClick={() => placeMarker(gameId, round.round, player.id, placeRow, placeCol, orientation)}
          disabled={!previewValid}
          style={{
            padding: "10px 24px", borderRadius: 8, cursor: previewValid ? "pointer" : "default",
            background: previewValid ? "linear-gradient(135deg, #ff2d95, #b829ff)" : "#3d1f5c",
            border: "none", color: previewValid ? "#05010f" : "#a68fd6", fontSize: 14, fontWeight: 700,
          }}
        >
          Confirm Placement
        </button>
        {state.placedIds.length >= 2 && (
          <p style={{ marginTop: 10 }}>
            <button
              onClick={() => startShootingPhase(gameId, round.round)}
              style={{ background: "none", border: "1px solid #3d1f5c", borderRadius: 6, padding: "6px 14px", color: "#a68fd6", fontSize: 12, cursor: "pointer" }}
            >
              Everyone's placed — start shooting →
            </button>
          </p>
        )}
      </Card>
    );
  }

  // ─── Shooting phase — simultaneous, timed rounds ───
  const iHaveSubmitted = !!state.pendingShots?.[player.id];
  const aliveCount = Object.values(state.markers).filter((m) => m.alive).length;
  const submittedCount = Object.keys(state.pendingShots || {}).length;
  const windowMs = perRoundMs(settings?.challengeDurationSec);
  const elapsed = state.roundStartedAt ? now - state.roundStartedAt : 0;
  const remainingMs = windowMs - elapsed;

  if (iHaveSubmitted) {
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🔥 Torched — Round {state.roundNum}</h3>
          <Badge>{formatCountdown(remainingMs)}</Badge>
        </div>
        <p style={{ color: "#a68fd6", fontSize: 13, margin: 0 }}>
          Your call is locked in for this round. Waiting on {Math.max(0, aliveCount - submittedCount)} more player{Math.max(0, aliveCount - submittedCount) === 1 ? "" : "s"} (or the round's timer) before it resolves.
        </p>
      </Card>
    );
  }

  const fire = (r, c) => {
    if (shotAt(r, c)) return; // already called in an earlier round
    submitShotForRound(gameId, round.round, player.id, r, c);
  };

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🔥 Torched — Round {state.roundNum}</h3>
        <Badge>{formatCountdown(remainingMs)}</Badge>
      </div>
      <p style={{ fontSize: 11, color: "#a68fd6", margin: "0 0 8px" }}>
        Everyone alive calls one cell this round, at the same time — {submittedCount} of {aliveCount} in so far.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${gridSize}, 1fr)`, gap: 3, maxWidth: 320, margin: "0 auto 10px" }}>
        {cells.flat().map(([r, c]) => {
          const shot = shotAt(r, c);
          const isMine = myMarkerHas(r, c);
          let bg = "#0d0618";
          let border = "#3d1f5c";
          let boxShadow = "none";
          if (shot?.hitPlayerId) {
            // A scorch/ember burst — a hot orange-white core fading to
            // red, with a glow — instead of a flat red tint, so a hit
            // actually reads as something that just caught fire.
            bg = "radial-gradient(circle at 50% 40%, #fff3c4, #ff9f4d 40%, #ff3860 75%)";
            border = "#ff3860";
            boxShadow = "0 0 8px rgba(255,56,96,0.7)";
          } else if (shot) {
            bg = "radial-gradient(circle at 50% 40%, rgba(107,79,153,0.55), rgba(107,79,153,0.2))";
            border = "#6b4f99";
          } else if (isMine) {
            bg = "radial-gradient(circle at 50% 40%, rgba(0,255,157,0.3), rgba(0,255,157,0.1))";
            border = "#00ff9d";
          }
          const canFire = !shot;
          return (
            <button
              key={`${r}-${c}`}
              onClick={() => canFire && fire(r, c)}
              disabled={!canFire}
              style={{ aspectRatio: "1", borderRadius: 3, padding: 0, background: bg, border: `1px solid ${border}`, boxShadow, cursor: canFire ? "pointer" : "default" }}
            />
          );
        })}
      </div>
      <p style={{ fontSize: 11, color: "#6b4f99", margin: 0 }}>
        🟢 your marker · 🟣 a miss · 🔴 a hit — {aliveCount} markers still standing
      </p>
    </Card>
  );
}
