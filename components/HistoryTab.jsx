import { useState, useEffect } from "react";
import { Card, Badge } from "./ui";
import { subscribeGameState } from "../lib/gameStorage";
import { KEY_CHALLENGE_HISTORY, KEY_EXILE_HISTORY, KEY_REENTRY, KEY_FINALE } from "../lib/gameState";
import { GAME_REGISTRY } from "../lib/challengeGames";
import VotingHistorySpreadsheet from "./VotingHistorySpreadsheet";

export default function HistoryTab({ gameId, players, gameName }) {
  const [challengeHistory, setChallengeHistory] = useState([]);
  const [exileHistory, setExileHistory] = useState([]);
  const [reentry, setReentry] = useState([]);
  const [finaleState, setFinaleState] = useState(null);

  useEffect(() => {
    const unsubscribe = subscribeGameState(gameId, KEY_CHALLENGE_HISTORY, (v) => setChallengeHistory(v || []));
    return unsubscribe;
  }, [gameId]);
  useEffect(() => {
    const unsubscribe = subscribeGameState(gameId, KEY_EXILE_HISTORY, (v) => setExileHistory(v || []));
    return unsubscribe;
  }, [gameId]);
  useEffect(() => {
    const unsubscribe = subscribeGameState(gameId, KEY_REENTRY, (v) => setReentry(v || []));
    return unsubscribe;
  }, [gameId]);
  useEffect(() => {
    const unsubscribe = subscribeGameState(gameId, KEY_FINALE, setFinaleState);
    return unsubscribe;
  }, [gameId]);

  const byId = {};
  players.forEach((p) => (byId[p.id] = p.display_name));

  if (challengeHistory.length === 0 && exileHistory.length === 0) {
    return <Card><p style={{ color: "#6b4f99", fontStyle: "italic" }}>No completed rounds yet.</p></Card>;
  }

  const rounds = [...new Set([...challengeHistory.map((c) => c.round), ...exileHistory.map((e) => e.round)])].sort((a, b) => a - b);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {rounds.map((r) => {
        const c = challengeHistory.find((x) => x.round === r);
        const e = exileHistory.find((x) => x.round === r);
        return (
          <Card key={r}>
            <h3 style={{ color: "#ff2d95", margin: "0 0 10px", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
              Round {r} {c?.finalFour && <Badge color="#ff3860">Final Four</Badge>}
            </h3>
            {c && (
              <div style={{ marginBottom: e ? 10 : 0 }}>
                <div style={{ fontSize: 11, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                  Challenge{c.gameType && GAME_REGISTRY[c.gameType] && ` — ${GAME_REGISTRY[c.gameType].icon} ${GAME_REGISTRY[c.gameType].label}`}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {[...(c.placements || [])].sort((a, b) => a.place - b.place).map((p) => (
                    <span key={p.playerId} style={{ fontSize: 12, color: p.place === 1 ? "#ff2d95" : "#a68fd6", fontWeight: p.place === 1 ? 700 : 500 }}>
                      #{p.place} {p.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {e && (
              <div>
                <div style={{ fontSize: 11, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                  Exile Vote {e.mode === "save" && <Badge color="#ff3860">Double Elimination</Badge>}
                </div>
                <p style={{ fontSize: 12, color: "#f5f0ff", margin: 0 }}>
                  Nominees: {(e.nominees || []).map((n) => n.name).join(", ")}
                  {e.exiledIds?.length > 0 && (
                    <> — <strong style={{ color: "#ff3860" }}>{e.exiledIds.map((id) => byId[id] || "?").join(", ")}</strong> exiled</>
                  )}
                </p>
                {e.nullifiedId && (
                  <p style={{ fontSize: 11, color: "#a68fd6", margin: "4px 0 0", fontStyle: "italic" }}>
                    🃏 Power of Chaos nullified {byId[e.nullifiedId] || "?"}
                  </p>
                )}
              </div>
            )}
          </Card>
        );
      })}

      {reentry.length > 0 && (
        <Card>
          <h3 style={{ color: "#f5f0ff", margin: "0 0 8px", fontSize: 14, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🔥 Re-entry attempts</h3>
          <div style={{ display: "grid", gap: 4 }}>
            {reentry.map((r) => (
              <div key={r.playerId} style={{ fontSize: 12, color: "#a68fd6" }}>
                <strong style={{ color: "#f5f0ff" }}>{r.name}</strong> — exiled round {r.exiledRound} —{" "}
                <span style={{ color: r.status === "returned" ? "#00ff9d" : r.status === "eliminated_forever" ? "#ff3860" : "#ff2d95" }}>
                  {r.status.replace("_", " ")}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <VotingHistorySpreadsheet exileHistory={exileHistory} finaleState={finaleState} players={players} gameName={gameName} />
    </div>
  );
}
