import { useState, useEffect } from "react";
import { Card, Badge } from "./ui";
import { subscribeGameState } from "../lib/gameStorage";
import { KEY_CHALLENGE_HISTORY, KEY_EXILE_HISTORY, KEY_REENTRY, KEY_FINALE, KEY_FATES, KEY_EXILE } from "../lib/gameState";
import { GAME_REGISTRY } from "../lib/challengeGames";
import { formatPlacementValue } from "../lib/challengeScores";
import VotingHistorySpreadsheet from "./VotingHistorySpreadsheet";
import AnnouncementsFeed from "./AnnouncementsFeed";

function LiveNominationsCard({ round, nominatorOrder, nominations, byId }) {
  if (!nominatorOrder?.length) return null;
  return (
    <Card style={{ borderColor: "rgba(255,45,149,0.3)" }}>
      <h3 style={{ color: "#ff2d95", margin: "0 0 6px", fontSize: 14, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
        ⚖️ Round {round} — Nominations so far
      </h3>
      <p style={{ color: "#6b4f99", fontSize: 11, margin: "0 0 8px", fontStyle: "italic" }}>
        This round's ceremony hasn't wrapped up yet — nominations aren't secret, so they're shown here live.
      </p>
      <div style={{ display: "grid", gap: 3 }}>
        {nominatorOrder.map((n) => (
          <div key={n.playerId} style={{ fontSize: 12, color: "#f5f0ff" }}>
            <Badge>#{n.place}</Badge> {n.name}{" "}
            {nominations?.[n.playerId] ? (
              <>nominated <strong style={{ color: "#ff3860" }}>{byId[nominations[n.playerId]] || "?"}</strong></>
            ) : (
              <span style={{ color: "#6b4f99", fontStyle: "italic" }}>still deciding...</span>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function HistoryTab({ gameId, players, gameName, round }) {
  const [challengeHistory, setChallengeHistory] = useState([]);
  const [exileHistory, setExileHistory] = useState([]);
  const [reentry, setReentry] = useState([]);
  const [finaleState, setFinaleState] = useState(null);
  const [liveFates, setLiveFates] = useState(null);
  const [liveExile, setLiveExile] = useState(null);

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
  // Live (not-yet-history) nomination state — nominations aren't secret,
  // so this round's picks show up here as they happen, same as the
  // player-facing Ceremony tab, instead of waiting for the whole
  // ceremony (through the vote reveal) to finish.
  useEffect(() => {
    const unsubscribe = subscribeGameState(gameId, KEY_FATES, setLiveFates);
    return unsubscribe;
  }, [gameId, round?.round]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const unsubscribe = subscribeGameState(gameId, KEY_EXILE, setLiveExile);
    return unsubscribe;
  }, [gameId, round?.round]); // eslint-disable-line react-hooks/exhaustive-deps

  const byId = {};
  players.forEach((p) => (byId[p.id] = p.display_name));

  const currentRoundHasHistory = exileHistory.some((e) => e.round === round?.round);
  const liveNominatorOrder = round?.phase === "fates" ? liveFates?.nominatorOrder : round?.phase === "exile" ? liveExile?.fatesNominatorOrder : null;
  const liveNominations = round?.phase === "fates" ? liveFates?.nominations : round?.phase === "exile" ? liveExile?.fatesNominations : null;
  const showLiveNominations = !currentRoundHasHistory && liveNominatorOrder?.length > 0;

  if (challengeHistory.length === 0 && exileHistory.length === 0 && !showLiveNominations) {
    return (
      <div style={{ display: "grid", gap: 16 }}>
        <AnnouncementsFeed gameId={gameId} />
        <Card><p style={{ color: "#6b4f99", fontStyle: "italic" }}>No completed rounds yet.</p></Card>
      </div>
    );
  }

  const rounds = [...new Set([...challengeHistory.map((c) => c.round), ...exileHistory.map((e) => e.round)])].sort((a, b) => a - b);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <AnnouncementsFeed gameId={gameId} />

      {showLiveNominations && (
        <LiveNominationsCard round={round.round} nominatorOrder={liveNominatorOrder} nominations={liveNominations} byId={byId} />
      )}

      {rounds.map((r) => {
        const c = challengeHistory.find((x) => x.round === r);
        const e = exileHistory.find((x) => x.round === r);
        const registryEntry = c?.gameType && GAME_REGISTRY[c.gameType];
        const rankDirection = registryEntry?.rank === "time-asc" ? "time-asc" : "score-desc";
        const hasNominations = e?.fatesNominatorOrder?.length > 0;
        return (
          <Card key={r}>
            <h3 style={{ color: "#ff2d95", margin: "0 0 10px", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
              Round {r} {c?.finalFour && <Badge color="#ff3860">Final Four</Badge>}
            </h3>
            {c && (
              <div style={{ marginBottom: (e || hasNominations) ? 10 : 0 }}>
                <div style={{ fontSize: 11, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                  Challenge{c.gameType && registryEntry && ` — ${registryEntry.icon} ${registryEntry.label}`}
                </div>
                <div style={{ display: "grid", gap: 3 }}>
                  {[...(c.placements || [])].sort((a, b) => a.place - b.place).map((p) => {
                    const scoreLabel = formatPlacementValue(p, c.gameType, rankDirection);
                    return (
                      <div key={p.playerId} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12 }}>
                        <span style={{ color: p.place === 1 ? "#ff2d95" : "#a68fd6", fontWeight: p.place === 1 ? 700 : 500 }}>
                          #{p.place} {p.name}
                        </span>
                        {scoreLabel && <span style={{ color: p.forfeited ? "#ff3860" : "#6b4f99" }}>{scoreLabel}</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {hasNominations && (
              <div style={{ marginBottom: e ? 10 : 0 }}>
                <div style={{ fontSize: 11, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                  Fates Ceremony — Nominations
                </div>
                <div style={{ display: "grid", gap: 3 }}>
                  {e.fatesNominatorOrder.map((n) => {
                    const nomineeId = e.fatesNominations?.[n.playerId];
                    return (
                      <div key={n.playerId} style={{ fontSize: 12, color: "#f5f0ff" }}>
                        <Badge>#{n.place}</Badge> {n.name} nominated{" "}
                        <strong style={{ color: "#ff3860" }}>{nomineeId ? byId[nomineeId] || "?" : "no one"}</strong>
                      </div>
                    );
                  })}
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

      <VotingHistorySpreadsheet exileHistory={exileHistory} finaleState={finaleState} players={players} gameName={gameName} challengeHistory={challengeHistory} />
    </div>
  );
}
