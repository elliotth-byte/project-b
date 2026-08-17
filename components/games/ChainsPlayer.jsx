import { useState, useEffect, useRef } from "react";
import { Card, Badge } from "../ui";
import GameResultCard from "./GameResultCard";
import { reportScore } from "../../lib/challengeScores";
import { subscribeChains, submitChain, placementValue } from "../../lib/games/chainsData";

const SYMBOL_ICONS = { rock: "✊", paper: "✋", scissors: "✌️" };

export default function ChainsPlayer({ gameId, round, challenge, player, players }) {
  const [state, setState] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState([]); // [{opponentId, symbol}] — purely local until locked in, see chainsData.js
  const [pickingFor, setPickingFor] = useState(null); // opponentId currently choosing a symbol for
  const reportedRef = useRef(new Set());

  useEffect(() => {
    const unsubscribe = subscribeChains(gameId, round.round, (v) => { setState(v); setLoaded(true); });
    return unsubscribe;
  }, [gameId, round.round]);

  const byName = (id) => players?.find((p) => p.id === id)?.display_name || "?";

  const iHaveLockedIn = !!state?.chains?.[player.id];
  const myResult = state?.results?.[player.id];

  // Only one meaningful report: once everyone's revealed, or the whole
  // challenge's timer runs out. There's no partial/live score to report
  // along the way — results genuinely don't exist until the reveal.
  useEffect(() => {
    if (!state || reportedRef.current.has(player.id)) return;
    if (state.revealed) {
      reportedRef.current.add(player.id);
      reportScore(gameId, round.round, player.id, player.name, placementValue(state, player.id), { final: true });
    }
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!challenge?.active) return null;
  if (state === null && !loaded) {
    return <Card style={{ marginBottom: 20, textAlign: "center" }}><p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic" }}>Loading...</p></Card>;
  }
  if (state === null && loaded) {
    return <GameResultCard icon="✊" title="Not Enough Players" valueLabel="No one to face" />;
  }

  if (state.revealed) {
    if (!myResult) {
      return <GameResultCard icon="✊" title="Didn't Lock In" valueLabel="You never finished your chain" />;
    }
    return (
      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>✊ Chains — Results</h3>
          <Badge>{myResult.score} point{myResult.score === 1 ? "" : "s"}</Badge>
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          {myResult.steps.map((s) => (
            <div key={s.opponentId} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              background: "#0d0618", borderRadius: 6, padding: "8px 12px",
              border: `1px solid ${s.result === "win" ? "#00ff9d" : s.result === "loss" ? "#ff3860" : "#3d1f5c"}`,
            }}>
              <span style={{ fontSize: 13, color: "#f5f0ff" }}>
                {SYMBOL_ICONS[s.mySymbol]} vs {byName(s.opponentId)} {s.theirSymbol ? SYMBOL_ICONS[s.theirSymbol] : ""}
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: s.result === "win" ? "#00ff9d" : s.result === "loss" ? "#ff3860" : "#a68fd6" }}>
                {s.result === "win" ? "WIN" : s.result === "loss" ? "LOSS" : "DRAW"}
              </span>
            </div>
          ))}
        </div>
        {myResult.brokeAtOpponentId && (
          <p style={{ fontSize: 11, color: "#6b4f99", marginTop: 10, fontStyle: "italic" }}>
            Chain broke against {byName(myResult.brokeAtOpponentId)} — nothing past that point counted.
          </p>
        )}
      </Card>
    );
  }

  if (iHaveLockedIn) {
    const others = state.participantIds.filter((id) => id !== player.id);
    const lockedCount = others.filter((id) => !!state.chains[id]).length;
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <h3 style={{ color: "#ff2d95", margin: "0 0 8px", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>✊ Chains</h3>
        <p style={{ color: "#a68fd6", fontSize: 13, margin: 0 }}>
          Chain locked in. Waiting on {others.length - lockedCount} more player{others.length - lockedCount === 1 ? "" : "s"} before results are revealed.
        </p>
      </Card>
    );
  }

  // ─── Building the chain ───
  const others = state.participantIds.filter((id) => id !== player.id);
  const remaining = others.filter((id) => !draft.some((d) => d.opponentId === id));
  const chainComplete = draft.length === others.length;

  const addToChain = (opponentId, symbol) => {
    setDraft((prev) => [...prev, { opponentId, symbol }]);
    setPickingFor(null);
  };
  const removeFromChain = (opponentId) => setDraft((prev) => prev.filter((d) => d.opponentId !== opponentId));

  return (
    <Card style={{ marginBottom: 20 }}>
      <h3 style={{ color: "#ff2d95", margin: "0 0 4px", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif", textAlign: "center" }}>✊ Chains</h3>
      <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 12px", textAlign: "center" }}>
        Face everyone, in whatever order you want. Pick a symbol for each — a win keeps your chain going, a loss ends it right there.
      </p>

      {draft.length > 0 && (
        <div style={{ display: "grid", gap: 6, marginBottom: 14 }}>
          {draft.map((d, i) => (
            <div key={d.opponentId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 6, padding: "6px 10px" }}>
              <span style={{ fontSize: 12, color: "#f5f0ff" }}>{i + 1}. {SYMBOL_ICONS[d.symbol]} vs {byName(d.opponentId)}</span>
              <button onClick={() => removeFromChain(d.opponentId)} style={{ background: "none", border: "none", color: "#ff3860", fontSize: 12, cursor: "pointer" }}>✕</button>
            </div>
          ))}
        </div>
      )}

      {!chainComplete && (
        <div>
          <p style={{ fontSize: 12, color: "#a68fd6", margin: "0 0 8px" }}>Add next:</p>
          {pickingFor ? (
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: 13, color: "#f5f0ff", margin: "0 0 10px" }}>Your symbol against {byName(pickingFor)}:</p>
              <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 8 }}>
                {["rock", "paper", "scissors"].map((sym) => (
                  <button key={sym} onClick={() => addToChain(pickingFor, sym)} style={{
                    padding: "12px 16px", borderRadius: 8, cursor: "pointer", background: "#0d0618",
                    border: "2px solid #3d1f5c", color: "#f5f0ff", fontSize: 20,
                  }}>
                    {SYMBOL_ICONS[sym]}
                  </button>
                ))}
              </div>
              <button onClick={() => setPickingFor(null)} style={{ background: "none", border: "none", color: "#6b4f99", fontSize: 11, cursor: "pointer" }}>← back</button>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6 }}>
              {remaining.map((id) => (
                <button key={id} onClick={() => setPickingFor(id)} style={{
                  padding: "10px 8px", borderRadius: 8, cursor: "pointer", background: "#0d0618",
                  border: "2px solid #3d1f5c", color: "#f5f0ff", fontSize: 13, fontWeight: 700,
                }}>{byName(id)}</button>
              ))}
            </div>
          )}
        </div>
      )}

      {chainComplete && (
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: 12, color: "#ff3860", margin: "0 0 10px", fontStyle: "italic" }}>
            Once you lock in, your chain can't be changed.
          </p>
          <button
            onClick={() => submitChain(gameId, round.round, player.id, draft)}
            style={{
              padding: "12px 28px", borderRadius: 8, cursor: "pointer", background: "linear-gradient(135deg, #ff2d95, #b829ff)",
              border: "none", color: "#05010f", fontSize: 14, fontWeight: 700,
            }}
          >
            Lock In Chain
          </button>
        </div>
      )}
    </Card>
  );
}
