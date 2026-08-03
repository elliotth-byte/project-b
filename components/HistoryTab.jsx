import { useState, useEffect } from "react";
import { Card, Badge } from "./ui";
import { subscribeGameState } from "../lib/gameStorage";
import { KEY_CHALLENGE_HISTORY, KEY_EXILE_HISTORY, KEY_REENTRY } from "../lib/gameState";
import { GAME_REGISTRY } from "../lib/challengeGames";

export default function HistoryTab({ gameId, players }) {
  const [challengeHistory, setChallengeHistory] = useState([]);
  const [exileHistory, setExileHistory] = useState([]);
  const [reentry, setReentry] = useState([]);

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

  const byId = {};
  players.forEach((p) => (byId[p.id] = p.display_name));

  if (challengeHistory.length === 0 && exileHistory.length === 0) {
    return <Card><p style={{ color: "#706050", fontStyle: "italic" }}>No completed rounds yet.</p></Card>;
  }

  const rounds = [...new Set([...challengeHistory.map((c) => c.round), ...exileHistory.map((e) => e.round)])].sort((a, b) => a - b);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {rounds.map((r) => {
        const c = challengeHistory.find((x) => x.round === r);
        const e = exileHistory.find((x) => x.round === r);
        return (
          <Card key={r}>
            <h3 style={{ color: "#c9a84c", margin: "0 0 10px", fontSize: 15, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>
              Round {r} {c?.finalFour && <Badge color="#c45c3c">Final Four</Badge>}
            </h3>
            {c && (
              <div style={{ marginBottom: e ? 10 : 0 }}>
                <div style={{ fontSize: 11, color: "#a09080", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                  Challenge{c.gameType && GAME_REGISTRY[c.gameType] && ` — ${GAME_REGISTRY[c.gameType].icon} ${GAME_REGISTRY[c.gameType].label}`}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {[...(c.placements || [])].sort((a, b) => a.place - b.place).map((p) => (
                    <span key={p.playerId} style={{ fontSize: 12, color: p.place === 1 ? "#c9a84c" : "#a09080", fontWeight: p.place === 1 ? 700 : 500 }}>
                      #{p.place} {p.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {e && (
              <div>
                <div style={{ fontSize: 11, color: "#a09080", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                  Exile Vote {e.mode === "save" && <Badge color="#c45c3c">Double Elimination</Badge>}
                </div>
                <p style={{ fontSize: 12, color: "#f0e6d3", margin: 0 }}>
                  Nominees: {(e.nominees || []).map((n) => n.name).join(", ")}
                  {e.exiledIds?.length > 0 && (
                    <> — <strong style={{ color: "#c45c3c" }}>{e.exiledIds.map((id) => byId[id] || "?").join(", ")}</strong> exiled</>
                  )}
                </p>
              </div>
            )}
          </Card>
        );
      })}

      {reentry.length > 0 && (
        <Card>
          <h3 style={{ color: "#f0e6d3", margin: "0 0 8px", fontSize: 14, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>🔥 Re-entry attempts</h3>
          <div style={{ display: "grid", gap: 4 }}>
            {reentry.map((r) => (
              <div key={r.playerId} style={{ fontSize: 12, color: "#a09080" }}>
                <strong style={{ color: "#f0e6d3" }}>{r.name}</strong> — exiled round {r.exiledRound} —{" "}
                <span style={{ color: r.status === "returned" ? "#7a9a5c" : r.status === "eliminated_forever" ? "#c45c3c" : "#c9a84c" }}>
                  {r.status.replace("_", " ")}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
