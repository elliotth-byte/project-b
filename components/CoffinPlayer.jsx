import { useState, useEffect, useRef } from "react";
import { Btn, Card, PausedBanner } from "./traitorsUi";
import { storageUpdate, subscribeGameState } from "../lib/gameStorage";
import {
  COFFIN_LAYOUTS, COFFIN_COLORS,
  coffinIsSolved, coffinCanMove, STORAGE_KEY_COFFIN,
} from "../lib/coffinData";
import { TRAITORS_GAME_REGISTRY } from "../lib/traitorsMiniGames";
import TraitorsRulesGate from "./games/TraitorsRulesGate";
import { useTraitorsPersistedStart } from "./games/useTraitorsPersistedStart";

// ─── Coffin Slide (Escape from the Crypt): Player View ───
export default function CoffinPlayer({ gameId, playerName }) {
  const [st, setSt] = useState(null);
  const [pieces, setPieces] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [moves, setMoves] = useState(0);
  const [finishTime, setFinishTime] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef(null);
  const pausedMsRef = useRef(0);
  const pauseStartRef = useRef(null);

  useEffect(() => {
    const unsubscribe = subscribeGameState(gameId, STORAGE_KEY_COFFIN, setSt);
    return unsubscribe;
  }, [gameId]);

  const layout = COFFIN_LAYOUTS[st?.difficulty || "medium"];

  // Lay out fresh pieces the first time we see an active game (or a new
  // one after a previous finish) — can't do this at useState-init time
  // since we don't know the difficulty until `st` loads.
  useEffect(() => {
    if (st?.active && !pieces) setPieces(layout.pieces.map((p) => ({ ...p })));
  }, [st?.active, st?.difficulty]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (st?.paused) { if (!pauseStartRef.current) pauseStartRef.current = Date.now(); }
    else if (pauseStartRef.current) { pausedMsRef.current += Date.now() - pauseStartRef.current; pauseStartRef.current = null; }
  }, [st?.paused]);

  // Durable start — survives a tab switch or remount instead of quietly
  // restarting this player's own escape-time clock. Keyed to this
  // specific run of the game (st?.createdAt), so a fresh restart by the
  // host still gets a genuinely new clock.
  const startTime = useTraitorsPersistedStart(gameId, STORAGE_KEY_COFFIN, st?.createdAt, playerName);

  useEffect(() => {
    if (st?.times?.[playerName] != null && !finishTime) setFinishTime(st.times[playerName]);
  }, [st?.active]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (startTime && !finishTime && !st?.paused) {
      timerRef.current = window.setInterval(() => setElapsed(Date.now() - startTime - pausedMsRef.current), 50);
      return () => window.clearInterval(timerRef.current);
    }
  }, [startTime, finishTime, st?.paused]);

  const tryMove = (id, delta) => {
    if (finishTime || !pieces) return;
    const next = coffinCanMove(pieces, id, delta, layout.grid);
    if (!next) return;
    setPieces(next);
    setMoves((m) => m + 1);
    if (coffinIsSolved(next, layout.grid)) {
      const time = Date.now() - startTime - pausedMsRef.current;
      setFinishTime(time);
      setElapsed(time);
      (async () => {
        await storageUpdate(gameId, STORAGE_KEY_COFFIN, (fresh) => {
          if (!fresh) return null;
          fresh.times = { ...(fresh.times || {}), [playerName]: time };
          return fresh;
        });
      })();
    }
  };

  // WASD / arrow keys move whichever coffin is currently selected, along
  // its own axis — up/down (or W/S) for vertical pieces, left/right (or
  // A/D) for horizontal ones. Same guard pattern as the 3D Maze: skip
  // while typing in any text field, and only while this challenge is
  // actually live for this player.
  useEffect(() => {
    const h = (e) => {
      if (!st?.active || finishTime || st?.paused || !selectedId || !pieces) return;
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.target?.isContentEditable) return;
      const piece = pieces.find((p) => p.id === selectedId);
      if (!piece) return;
      if (piece.orientation === "v") {
        if (["ArrowUp", "w", "W"].includes(e.key)) { e.preventDefault(); tryMove(selectedId, -1); }
        if (["ArrowDown", "s", "S"].includes(e.key)) { e.preventDefault(); tryMove(selectedId, 1); }
      } else {
        if (["ArrowLeft", "a", "A"].includes(e.key)) { e.preventDefault(); tryMove(selectedId, -1); }
        if (["ArrowRight", "d", "D"].includes(e.key)) { e.preventDefault(); tryMove(selectedId, 1); }
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  if (!st || !st.active || !pieces) return null;
  if (st.paused) return <PausedBanner icon="⚰️" title="Escape from the Crypt" />;

  const isParticipant = !st.participants || st.participants.includes(playerName);
  if (st.participants && !isParticipant) {
    return (
      <Card style={{ marginBottom: 20, borderColor: "rgba(201,168,76,0.3)", textAlign: "center" }}>
        <h3 style={{ color: "#c9a84c", margin: "0 0 6px", fontSize: 15, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>⚰️ Escape from the Crypt</h3>
        <p style={{ color: "#a09080", fontSize: 13, margin: 0, fontStyle: "italic" }}>You're spectating this round.</p>
      </Card>
    );
  }

  const cell = Math.min(38, Math.floor(300 / layout.grid));
  const registryEntry = TRAITORS_GAME_REGISTRY[STORAGE_KEY_COFFIN];

  return (
    <TraitorsRulesGate icon={registryEntry.icon} label={registryEntry.label} blurb={registryEntry.blurb} resetKey={st.createdAt}>
    <Card style={{ marginBottom: 20, borderColor: "rgba(201,168,76,0.3)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ color: "#c9a84c", margin: 0, fontSize: 15, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>⚰️ Escape from the Crypt</h3>
        <span style={{ fontSize: 16, fontWeight: 700, color: finishTime ? "#7a9a5c" : "#c9a84c", fontFamily: "'Courier New', Courier, monospace" }}>
          {finishTime ? `${(finishTime / 1000).toFixed(2)}s` : startTime ? `${(elapsed / 1000).toFixed(1)}s` : "—"}
        </span>
      </div>
      {finishTime ? (
        <div style={{ textAlign: "center", padding: "14px 0" }}>
          <div style={{ fontSize: 12, color: "#7a9a5c", textTransform: "uppercase", letterSpacing: 2, fontWeight: 700 }}>✦ Coffin Freed ✦</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#c9a84c", margin: "8px 0", fontFamily: "'Courier New', Courier, monospace" }}>{(finishTime / 1000).toFixed(2)}s</div>
          <div style={{ fontSize: 12, color: "#a09080" }}>{moves} moves to clear the way.</div>
        </div>
      ) : (
        <>
          <p style={{ textAlign: "center", fontSize: 11, color: "#706050", margin: "0 0 6px" }}>{layout.label} · Tap a coffin, then use WASD/arrows or the buttons below.</p>
          <div style={{ position: "relative", width: cell * layout.grid, height: cell * layout.grid, margin: "0 auto 10px", background: "#060e1a", borderRadius: 8, border: "1px solid #253550", overflow: "visible" }}>
            <div style={{ position: "absolute", right: -6, top: (pieces.find((p) => p.isTarget)?.row ?? 2) * cell + 6, width: 6, height: cell - 12, background: "#c9a84c", borderRadius: 3, boxShadow: "0 0 6px #c9a84c99" }} />
            {pieces.map((p) => {
              const w = p.orientation === "h" ? p.length * cell - 4 : cell - 4;
              const h = p.orientation === "v" ? p.length * cell - 4 : cell - 4;
              return (
                <div key={p.id} onClick={() => setSelectedId(p.id === selectedId ? null : p.id)} style={{
                  position: "absolute", left: p.col * cell + 2, top: p.row * cell + 2, width: w, height: h, borderRadius: 6,
                  background: p.isTarget ? "linear-gradient(135deg, #d4b45c, #c9a84c)" : COFFIN_COLORS[p.id] || "#4a4a4a",
                  border: selectedId === p.id ? "2px solid #fff" : "1px solid rgba(0,0,0,0.4)",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: Math.min(16, cell * 0.4), cursor: "pointer",
                  boxShadow: selectedId === p.id ? "0 0 8px rgba(255,255,255,0.5)" : "none", transition: "left 0.15s, top 0.15s",
                }}>⚰️</div>
              );
            })}
          </div>
          {selectedId ? (() => {
            const p = pieces.find((x) => x.id === selectedId);
            const negOk = !!coffinCanMove(pieces, selectedId, -1, layout.grid);
            const posOk = !!coffinCanMove(pieces, selectedId, 1, layout.grid);
            return (
              <div style={{ display: "flex", gap: 8, justifyContent: "center", alignItems: "center", marginBottom: 8 }}>
                <Btn small variant="ghost" disabled={!negOk} onClick={() => tryMove(selectedId, -1)}>{p.orientation === "h" ? "◀ A" : "▲ W"}</Btn>
                <span style={{ fontSize: 12, color: "#a09080" }}>{p.isTarget ? "The Traitor's Coffin" : `Coffin ${selectedId}`}</span>
                <Btn small variant="ghost" disabled={!posOk} onClick={() => tryMove(selectedId, 1)}>{p.orientation === "h" ? "D ▶" : "S ▼"}</Btn>
              </div>
            );
          })() : (
            <div style={{ textAlign: "center", fontSize: 11, color: "#706050", marginBottom: 8 }}>Tap a coffin to select it, then slide it with WASD/arrows or the buttons.</div>
          )}
          <div style={{ textAlign: "center", fontSize: 11, color: "#706050" }}>{moves} moves so far</div>
        </>
      )}
    </Card>
    </TraitorsRulesGate>
  );
}
