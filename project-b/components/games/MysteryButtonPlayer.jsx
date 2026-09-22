import { useState, useEffect, useRef } from "react";
import { Card, Badge } from "../ui";
import { reportScore } from "../../lib/challengeScores";
import {
  subscribeMysteryButton, pressButton, submitPass, autoPassIfDue, placementValue,
} from "../../lib/games/mysteryButtonData";

// ─── Mystery Button ───
// See lib/games/mysteryButtonData.js for the full rules of both
// scenarios and why neither is ever named anywhere in this file's own
// text either — everything a player sees before their own first press
// (or before someone tags them, in Scenario B) is deliberately
// identical regardless of which one is actually live.
export default function MysteryButtonPlayer({ gameId, round, challenge, player, players }) {
  const [state, setState] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [, forceTick] = useState(0);
  const reportedRef = useRef(false);

  useEffect(() => {
    const unsubscribe = subscribeMysteryButton(gameId, round.round, (v) => { setState(v); setLoaded(true); });
    return unsubscribe;
  }, [gameId, round.round]);

  const byName = (id) => players?.find((p) => p.id === id)?.display_name || "?";

  // Only relevant once Scenario B has actually revealed itself and has
  // a live holder — a no-op otherwise, same adaptive-poll shape
  // components/games/MusicalChairsPlayer.jsx already uses.
  useEffect(() => {
    if (!state || state.scenario !== "B" || state.phase !== "active" || !state.holderId) return;
    let timeoutId;
    const tick = () => {
      forceTick((t) => t + 1);
      autoPassIfDue(gameId, round.round);
      const msRemaining = Math.max(0, (state.passDeadline || 0) - Date.now());
      timeoutId = window.setTimeout(tick, Math.max(400, Math.min(30000, msRemaining / 10)));
    };
    tick();
    return () => window.clearTimeout(timeoutId);
  }, [gameId, round.round, state?.scenario, state?.phase, state?.holderId, state?.passDeadline]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!state || reportedRef.current) return;
    if (state.phase === "revealed") {
      reportedRef.current = true;
      reportScore(gameId, round.round, player.id, player.name, placementValue(state, player.id), { final: true });
    }
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!challenge?.active) return null;
  if (state === null && !loaded) {
    return <Card style={{ marginBottom: 20, textAlign: "center" }}><p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic" }}>Loading...</p></Card>;
  }
  if (state === null && loaded) {
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <div style={{ fontSize: 28, marginBottom: 6 }}>🔴</div>
        <div style={{ fontSize: 12, letterSpacing: 4, textTransform: "uppercase", color: "#00ff9d" }}>Not Enough Players</div>
        <p style={{ color: "#6b4f99", fontSize: 12, marginTop: 10, fontStyle: "italic" }}>This one needs at least 2 players.</p>
      </Card>
    );
  }

  // ─── Revealed ───
  if (state.phase === "revealed") {
    const myResult = state.results?.[player.id];
    const ranked = state.participantIds
      .map((id) => ({ id, ...state.results[id] }))
      .filter((r) => r.placement != null)
      .sort((a, b) => a.placement - b.placement);
    return (
      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🔴 Mystery Button — Revealed</h3>
          <Badge>{myResult?.placement ? `#${myResult.placement}` : "—"}</Badge>
        </div>
        <p style={{ textAlign: "center", color: "#a68fd6", fontSize: 12, margin: "0 0 12px", fontStyle: "italic" }}>
          {state.scenario === "A" ? "It was a race — first to press won." : "It was \"Passing the Bug\" — last one holding it, with nobody left to pass to, won."}
        </p>
        {state.timedOut && (
          <p style={{ color: "#ff9f4d", fontSize: 11, margin: "0 0 10px", fontStyle: "italic" }}>Time ran out before this fully resolved — scored on whatever happened.</p>
        )}
        {state.winnerId && (
          <p style={{ textAlign: "center", color: "#00ff9d", fontSize: 14, fontWeight: 700, margin: "0 0 14px" }}>🏆 {byName(state.winnerId)}</p>
        )}
        <div style={{ display: "grid", gap: 6 }}>
          {ranked.map((r) => (
            <div key={r.id} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              background: r.id === player.id ? "rgba(255,45,149,0.12)" : "#0d0618",
              border: `1px solid ${r.id === player.id ? "#ff2d95" : "#3d1f5c"}`, borderRadius: 6, padding: "8px 12px",
            }}>
              <span style={{ fontSize: 13, color: "#f5f0ff" }}>#{r.placement} {byName(r.id)}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#a68fd6" }}>{r.points} pt{r.points === 1 ? "" : "s"}</span>
            </div>
          ))}
        </div>
      </Card>
    );
  }

  // ─── Scenario A, not yet revealed — deliberately the EXACT SAME
  // screen whether nobody's pressed yet, or two other people already
  // have: no press counts, no "it's a race," nothing. The whole point
  // is that a player who presses (or watches someone else press)
  // learns nothing about what actually happens until the full 3-press
  // resolution reveals it. Scenario B, by contrast, is SUPPOSED to
  // reveal itself progressively once it's live (that's the twist THAT
  // scenario delivers) — so this branch only ever applies when
  // state.scenario === "A".
  if (state.scenario === "A" && state.phase !== "revealed") {
    const iHavePressed = state.pressOrder.includes(player.id);
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>🔴</div>
        <h3 style={{ color: "#ff2d95", margin: "0 0 8px", fontSize: 16, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>A Mysterious Button Has Appeared</h3>
        <p style={{ color: "#6b4f99", fontSize: 12, margin: "0 0 16px", fontStyle: "italic" }}>Nobody knows what it does. Only one way to find out.</p>
        {iHavePressed ? (
          <p style={{ color: "#a68fd6", fontSize: 13, fontStyle: "italic", margin: 0 }}>You pressed it. Nothing seems to happen... yet.</p>
        ) : (
          <button
            onClick={() => pressButton(gameId, round.round, player.id)}
            style={{
              width: 120, height: 120, borderRadius: "50%", cursor: "pointer", margin: "0 auto",
              background: "radial-gradient(circle at 35% 30%, #ff5a7a, #ff2d95 60%, #b8004f)",
              border: "4px solid rgba(255,255,255,0.3)", boxShadow: "0 0 30px rgba(255,45,149,0.6)",
              color: "#05010f", fontSize: 16, fontWeight: 900, fontFamily: "'Orbitron', 'Segoe UI', sans-serif",
            }}
          >
            PRESS
          </button>
        )}
      </Card>
    );
  }

  // ─── Waiting — Scenario B, pre-reveal: identical to the screen
  // above on purpose, since neither scenario can look different before
  // the first press happens at all ───
  if (state.phase === "waiting") {
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>🔴</div>
        <h3 style={{ color: "#ff2d95", margin: "0 0 8px", fontSize: 16, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>A Mysterious Button Has Appeared</h3>
        <p style={{ color: "#6b4f99", fontSize: 12, margin: "0 0 16px", fontStyle: "italic" }}>Nobody knows what it does. Only one way to find out.</p>
        <button
          onClick={() => pressButton(gameId, round.round, player.id)}
          style={{
            width: 120, height: 120, borderRadius: "50%", cursor: "pointer", margin: "0 auto",
            background: "radial-gradient(circle at 35% 30%, #ff5a7a, #ff2d95 60%, #b8004f)",
            border: "4px solid rgba(255,255,255,0.3)", boxShadow: "0 0 30px rgba(255,45,149,0.6)",
            color: "#05010f", fontSize: 16, fontWeight: 900, fontFamily: "'Orbitron', 'Segoe UI', sans-serif",
          }}
        >
          PRESS
        </button>
      </Card>
    );
  }

  // ─── Active — Scenario B ───
  const amHolder = state.holderId === player.id;
  const amCleared = state.clearOrder.includes(player.id);

  if (amHolder) {
    const eligible = state.participantIds.filter((id) => id !== player.id && !state.clearOrder.includes(id));
    const secLeft = Math.max(0, Math.ceil((state.passDeadline - Date.now()) / 1000));
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 6 }}>🦠</div>
        <h3 style={{ color: "#ff3860", margin: "0 0 6px", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>You've Got It!</h3>
        <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 14px" }}>Pass it to someone before time's up — {secLeft}s left.</p>
        <div style={{ display: "grid", gap: 6 }}>
          {eligible.map((id) => (
            <button key={id} onClick={() => submitPass(gameId, round.round, player.id, id)} style={{
              padding: "10px 12px", borderRadius: 8, cursor: "pointer", background: "#0d0618",
              border: "2px solid #ff3860", color: "#f5f0ff", fontSize: 13, fontWeight: 700,
            }}>{byName(id)}</button>
          ))}
        </div>
      </Card>
    );
  }

  if (amCleared) {
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <div style={{ fontSize: 28, marginBottom: 6 }}>😌</div>
        <p style={{ color: "#a68fd6", fontSize: 13, margin: 0 }}>You're safe now — just watching from here.</p>
      </Card>
    );
  }

  return (
    <Card style={{ marginBottom: 20, textAlign: "center" }}>
      <div style={{ fontSize: 28, marginBottom: 6 }}>😬</div>
      <p style={{ color: "#f5f0ff", fontSize: 13, margin: "0 0 6px", fontWeight: 700 }}>{byName(state.holderId)} has it right now.</p>
      <p style={{ color: "#a68fd6", fontSize: 12, margin: 0 }}>Stay alert — it could be headed your way.</p>
    </Card>
  );
}
