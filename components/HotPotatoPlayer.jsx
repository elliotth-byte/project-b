import { useState, useEffect } from "react";
import { Card, PausedBanner } from "./traitorsUi";
import { storageUpdate, subscribeGameState } from "../lib/gameStorage";
import { fmtTime, tickHotPotato, STORAGE_KEY_HOT_POTATO } from "../lib/hotPotatoData";
import { TRAITORS_GAME_REGISTRY } from "../lib/traitorsMiniGames";
import TraitorsRulesGate from "./games/TraitorsRulesGate";

// ─── Hot Potato: Player View ───
export default function HotPotatoPlayer({ gameId, playerName }) {
  const [st, setSt] = useState(null);
  const [, forceTick] = useState(0);

  useEffect(() => {
    const unsubscribe = subscribeGameState(gameId, STORAGE_KEY_HOT_POTATO, setSt);
    return unsubscribe;
  }, [gameId]);

  // Same per-second explosion check as the host — see lib/hotPotatoData.js.
  // Having both host and every player's tab attempt this means the game
  // still progresses even if the host's own tab isn't open at the moment
  // a timer runs out.
  useEffect(() => {
    if (!st?.active || st.paused) return;
    const interval = window.setInterval(async () => {
      forceTick((x) => x + 1);
      const res = await tickHotPotato(gameId);
      if (res.ok) setSt(res.value);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [gameId, st?.active, st?.paused]);

  if (!st || !st.active) return null;
  if (st.paused) return <PausedBanner icon="🥔" title="Hot Potato" />;

  const isParticipant = !st.participants || st.participants.includes(playerName);
  if (st.participants && !isParticipant) {
    return (
      <Card style={{ marginBottom: 20, borderColor: "rgba(196,92,60,0.3)", textAlign: "center" }}>
        <h3 style={{ color: "#c9a84c", margin: "0 0 6px", fontSize: 15, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>🥔 Hot Potato</h3>
        <p style={{ color: "#a09080", fontSize: 13, margin: 0, fontStyle: "italic" }}>
          {st.winner ? `${(Array.isArray(st.winner) ? st.winner : [st.winner]).join(", ")} survived.` : "You're spectating — no potato for you this round."}
        </p>
      </Card>
    );
  }

  const eliminated = st.eliminated.includes(playerName);
  const remaining = st.players.filter((p) => !st.eliminated.includes(p.name) && p.name !== playerName);

  const pass = async (potId, target) => {
    if (st.paused) return;
    const res = await storageUpdate(gameId, STORAGE_KEY_HOT_POTATO, (fresh) => {
      if (!fresh) return null;
      const pot = fresh.potatoes.find((p) => p.id === potId);
      if (!pot || pot.holder !== playerName || pot.exploded || fresh.eliminated.includes(target)) return null;
      pot.holder = target;
      return fresh;
    });
    if (res.ok) setSt(res.value);
  };

  const registryEntry = TRAITORS_GAME_REGISTRY[STORAGE_KEY_HOT_POTATO];

  return (
    <TraitorsRulesGate icon={registryEntry.icon} label={registryEntry.label} blurb={registryEntry.blurb} resetKey={st.createdAt}>
    <Card style={{ marginBottom: 20, borderColor: "rgba(196,92,60,0.3)" }}>
      <h3 style={{ color: "#c9a84c", margin: "0 0 6px", fontSize: 15, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>🥔 Hot Potato</h3>
      {st.winner ? (
        <p style={{ textAlign: "center", color: "#c9a84c", padding: 10 }}>🏆 {(Array.isArray(st.winner) ? st.winner : [st.winner]).join(", ")} survive{(Array.isArray(st.winner) ? st.winner.length : 1) === 1 ? "s" : ""}!</p>
      ) : eliminated ? (
        <p style={{ textAlign: "center", color: "#c45c3c", padding: 10 }}>💥 A potato went off in your hands. Eliminated.</p>
      ) : (
        <>
          {st.potatoes.map((pot) => (
            <div key={pot.id} style={{ background: "#0a1020", borderRadius: 8, padding: 10, marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 13, color: "#f0e6d3" }}>
                  🥔 Potato {pot.id} — {pot.exploded ? "exploded" : pot.holder === playerName ? "YOU HOLD IT" : pot.holder || "—"}
                </span>
                <span style={{ fontSize: 14, fontWeight: 700, color: pot.expiresAt - Date.now() < 60000 ? "#c45c3c" : "#c9a84c", fontFamily: "'Courier New', monospace" }}>
                  {pot.exploded ? "💥" : fmtTime(pot.expiresAt - Date.now())}
                </span>
              </div>
              {pot.holder === playerName && !pot.exploded && (
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, color: "#a09080", alignSelf: "center" }}>Pass to:</span>
                  {remaining.map((p) => (
                    <button key={p.id} onClick={() => pass(pot.id, p.name)} style={{
                      fontSize: 11, padding: "4px 8px", borderRadius: 5, background: "#132038",
                      border: "1px solid #c9a84c55", color: "#f0e6d3", cursor: "pointer",
                    }}>{p.name}</button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </Card>
    </TraitorsRulesGate>
  );
}
