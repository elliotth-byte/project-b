import { useState, useEffect } from "react";
import { Card } from "./traitorsUi";
import { subscribeGameState } from "../lib/gameStorage";
import { STORAGE_KEY_VOTE_HISTORY } from "../lib/roundtableData";
import { STORAGE_KEY_CHALLENGE_HISTORY } from "../lib/challengeHistory";
import { isTraitor, factionColor, factionLabel, roleDisplay } from "../lib/traitorData";
import ChallengeArchiveList from "./ChallengeArchiveList";

// Was a player eliminated as of `round` and NOT yet returned by then?
function isOutAtRound(name, eliminations, returns, round) {
  const relevant = eliminations.filter((e) => e.name === name && e.round <= round).sort((a, b) => b.round - a.round);
  if (!relevant.length) return false;
  const lastElim = relevant[0];
  const laterReturn = returns.find((r) => r.name === name && r.round > lastElim.round && r.round <= round);
  return !laterReturn;
}

export default function HistoryTab({ gameId, players, tr, challengeArchive = [] }) {
  const [voteHistory, setVoteHistory] = useState([]);
  const [challengeHistory, setChallengeHistory] = useState([]);

  useEffect(() => {
    const unsub1 = subscribeGameState(gameId, STORAGE_KEY_VOTE_HISTORY, (v) => setVoteHistory(v || []));
    const unsub2 = subscribeGameState(gameId, STORAGE_KEY_CHALLENGE_HISTORY, (v) => setChallengeHistory(v || []));
    return () => { unsub1(); unsub2(); };
  }, [gameId]);

  const eliminations = tr?.eliminations || [];
  const returns = tr?.returns || [];
  const shieldHistory = tr?.shieldHistory || {};

  const maxRound = Math.max(
    1, tr?.round || 1,
    ...voteHistory.map((v) => v.round),
    ...eliminations.map((e) => e.round),
    ...returns.map((r) => r.round)
  );
  const roundNums = Array.from({ length: maxRound }, (_, i) => i + 1);

  const votesByRound = {};
  voteHistory.forEach((vh) => { votesByRound[vh.round] = vh.votes; });

  const elimMap = {};
  eliminations.forEach((e) => { elimMap[e.name] = e; }); // most recent wins, matches original

  const roundBanished = {};
  eliminations.filter((e) => e.type === "Banished" || e.type === "banished").forEach((e) => { roundBanished[e.round] = e.name; });

  const roundTallies = {};
  Object.entries(votesByRound).forEach(([round, votes]) => {
    const tally = {};
    Object.values(votes).forEach((v) => { tally[v.target] = (tally[v.target] || 0) + 1; });
    roundTallies[round] = Object.values(tally).sort((a, b) => b - a).join(" - ");
  });

  const lastElimRound = (name) => {
    const elims = eliminations.filter((e) => e.name === name);
    return elims.length ? elims[elims.length - 1].round : 0;
  };
  const sortedPlayers = [
    ...players.filter((p) => p.alive).sort((a, b) => a.display_name.localeCompare(b.display_name)),
    ...players.filter((p) => !p.alive).sort((a, b) => lastElimRound(b.display_name) - lastElimRound(a.display_name)),
  ];

  const cellStyle = { padding: "4px 8px", fontSize: 11, borderBottom: "1px solid #1a2845", borderRight: "1px solid #1a2845", whiteSpace: "nowrap" };
  const headerCellStyle = { ...cellStyle, color: "#c9a84c", fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, background: "#0a1020" };
  const typeIcon = { Murdered: "💀", murdered: "💀", Banished: "⚖️", banished: "⚖️", Walked: "🚪", walked: "🚪" };
  const typeColor = { Murdered: "#c45c3c", murdered: "#c45c3c", Banished: "#c9a84c", banished: "#c9a84c", Walked: "#706050", walked: "#706050" };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Card>
        <h3 style={{ color: "#f0e6d3", margin: "0 0 4px", fontSize: 14, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>Game Matrix</h3>
        <p style={{ color: "#706050", fontSize: 12, margin: "0 0 12px", fontStyle: "italic" }}>
          Players × Rounds — the same spreadsheet format from the original artifact. Scroll horizontally for all rounds.
        </p>
        {!tr ? (
          <p style={{ color: "#706050", fontSize: 12, fontStyle: "italic" }}>Start tracking roles (Traitor Roles tab) to build this out.</p>
        ) : (
          <div style={{ overflowX: "auto", borderRadius: 8, border: "1px solid #253550" }}>
            <table style={{ borderCollapse: "collapse", fontSize: 11, minWidth: "100%" }}>
              <thead>
                <tr>
                  <th style={{ ...headerCellStyle, position: "sticky", left: 0, zIndex: 2, minWidth: 90 }}></th>
                  {roundNums.map((r) => <th key={r} style={{ ...headerCellStyle, textAlign: "center", minWidth: 80 }}>Round {r}</th>)}
                </tr>
                <tr>
                  <td style={{ ...headerCellStyle, position: "sticky", left: 0, zIndex: 2 }}>🛡️ Shields</td>
                  {roundNums.map((r) => (
                    <td key={r} style={{ ...cellStyle, color: "#7a9a5c", fontSize: 10, textAlign: "center", background: "#0a1020" }}>
                      {(shieldHistory[r] || []).length > 0 ? shieldHistory[r].join(", ") : "—"}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td style={{ ...headerCellStyle, position: "sticky", left: 0, zIndex: 2 }}>💀 Murders</td>
                  {roundNums.map((r) => {
                    const murders = eliminations.filter((e) => e.round === r && (e.type === "Murdered" || e.type === "murdered"));
                    return (
                      <td key={r} style={{ ...cellStyle, fontSize: 10, textAlign: "center", background: "#0a1020" }}>
                        {murders.length > 0 ? murders.map((m, i) => (
                          <span key={i}>{i > 0 && ", "}<span style={{ color: m.killedBy ? factionColor(m.killedBy) : "#c45c3c" }}>{m.name}</span></span>
                        )) : "—"}
                      </td>
                    );
                  })}
                </tr>
                <tr>
                  <td style={{ ...headerCellStyle, position: "sticky", left: 0, zIndex: 2 }}>⚖️ Banished</td>
                  {roundNums.map((r) => (
                    <td key={r} style={{ ...cellStyle, color: "#c9a84c", fontWeight: 600, fontSize: 10, textAlign: "center", background: "#0a1020" }}>
                      {roundBanished[r] || "—"}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td style={{ ...headerCellStyle, position: "sticky", left: 0, zIndex: 2 }}>Vote split</td>
                  {roundNums.map((r) => (
                    <td key={r} style={{ ...cellStyle, color: "#706050", fontSize: 10, textAlign: "center", background: "#0a1020" }}>
                      {roundTallies[r] || "—"}
                    </td>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedPlayers.map((p) => {
                  const elim = !p.alive ? elimMap[p.display_name] : null;
                  return (
                    <tr key={p.id}>
                      <td style={{
                        ...cellStyle, position: "sticky", left: 0, zIndex: 1, fontWeight: 600,
                        color: p.alive ? "#f0e6d3" : "#706050",
                        background: isTraitor(elim?.role) ? `${factionColor(elim.role)}1A` : "#132038",
                        borderRight: "2px solid #253550",
                      }}>
                        {p.display_name}
                        {isTraitor(tr.roles?.[p.display_name]) && <span style={{ color: factionColor(tr.roles[p.display_name]), fontSize: 9, marginLeft: 4 }}>{factionLabel(tr.roles[p.display_name])}</span>}
                      </td>
                      {roundNums.map((r) => {
                        const elimThisRound = eliminations.find((e) => e.name === p.display_name && e.round === r);
                        const returnThisRound = returns.find((rt) => rt.name === p.display_name && rt.round === r);
                        if (elimThisRound) {
                          const icon = typeIcon[elimThisRound.type] || "❌";
                          const color = elimThisRound.killedBy ? factionColor(elimThisRound.killedBy) : (typeColor[elimThisRound.type] || "#706050");
                          return (
                            <td key={r} style={{ ...cellStyle, textAlign: "center", color, background: "rgba(10,16,32,0.6)", fontWeight: 600, fontSize: 10, fontStyle: "italic" }}>
                              {icon} {elimThisRound.type}
                            </td>
                          );
                        }
                        if (returnThisRound) {
                          return <td key={r} style={{ ...cellStyle, textAlign: "center", color: "#7a9a5c", background: "rgba(122,154,92,0.12)", fontWeight: 700, fontSize: 10, fontStyle: "italic" }}>🔁 Returned</td>;
                        }
                        if (isOutAtRound(p.display_name, eliminations, returns, r)) {
                          return <td key={r} style={{ ...cellStyle, textAlign: "center", background: "rgba(10,16,32,0.6)", color: "#706050" }}>—</td>;
                        }
                        const voted = votesByRound[r]?.[p.display_name]?.target;
                        return <td key={r} style={{ ...cellStyle, textAlign: "center", color: voted ? "#f0e6d3" : "#253550", background: "#132038" }}>{voted || "—"}</td>;
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <h3 style={{ color: "#f0e6d3", margin: "0 0 14px", fontSize: 14, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>Elimination Order</h3>
        {eliminations.length === 0 ? (
          <p style={{ color: "#706050", fontSize: 13, fontStyle: "italic" }}>No eliminations yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #253550" }}>
                  {["#", "Player", "Role", "Eliminated", "Round", "Return"].map((h) => (
                    <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: "#c9a84c", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {eliminations.map((e, i) => {
                  const laterElimRound = eliminations.filter((o) => o.name === e.name && o.round > e.round).reduce((min, o) => Math.min(min, o.round), Infinity);
                  const returnEvent = returns.filter((r) => r.name === e.name && r.round > e.round && r.round < laterElimRound).sort((a, b) => a.round - b.round)[0];
                  return (
                    <tr key={i} style={{ borderBottom: "1px solid #253550" }}>
                      <td style={{ padding: "6px 10px", color: "#706050", fontWeight: 600 }}>#{e.placement}</td>
                      <td style={{ padding: "6px 10px", color: "#f0e6d3", fontWeight: 600 }}>{e.name}</td>
                      <td style={{ padding: "6px 10px" }}>
                        <span style={{ color: isTraitor(e.role) ? factionColor(e.role) : "#7a9a5c", fontWeight: 700, fontSize: 11, textTransform: "uppercase" }}>{roleDisplay(e.role)}</span>
                      </td>
                      <td style={{ padding: "6px 10px", color: e.killedBy ? factionColor(e.killedBy) : (typeColor[e.type] || "#706050") }}>
                        {typeIcon[e.type] || ""} {e.type}{e.killedBy ? ` (${factionLabel(e.killedBy)})` : ""}
                      </td>
                      <td style={{ padding: "6px 10px", color: "#a09080" }}>Round {e.round}</td>
                      <td style={{ padding: "6px 10px", color: "#7a9a5c", fontWeight: 600, fontSize: 12 }}>{returnEvent ? `🔁 Returned R${returnEvent.round}` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {challengeArchive.length > 0 && <ChallengeArchiveList gameId={gameId} archive={challengeArchive} compact />}

      <Card>
        <h3 style={{ color: "#f0e6d3", margin: "0 0 8px", fontSize: 14, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>🏆 Challenge History</h3>
        <p style={{ color: "#706050", fontSize: 11, margin: "0 0 10px", fontStyle: "italic" }}>
          Word Scramble, Casino, Coffin Slide, and 3D Maze aren't logged here yet — they're continuous
          leaderboards with no single "it's over" moment, unlike the games below.
        </p>
        {challengeHistory.length === 0 ? (
          <p style={{ color: "#706050", fontSize: 12, fontStyle: "italic" }}>No completed challenges yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 4 }}>
            {challengeHistory.slice().reverse().map((c, i) => (
              <div key={i} style={{ fontSize: 12, color: "#a09080", padding: "4px 0", borderBottom: "1px solid #1a2845" }}>
                <strong style={{ color: "#f0e6d3" }}>{c.challenge}</strong>
                {c.winners?.length > 0 && <> — 🏆 {c.winners.join(", ")}</>}
                {c.note && <span style={{ color: "#706050" }}> ({c.note})</span>}
                <span style={{ color: "#706050", float: "right" }}>{c.time}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <h3 style={{ color: "#f0e6d3", margin: "0 0 8px", fontSize: 14, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>📋 Full Activity Log</h3>
        {!tr || tr.log.length === 0 ? (
          <p style={{ color: "#706050", fontSize: 12, fontStyle: "italic" }}>Nothing logged yet.</p>
        ) : (
          <div style={{ maxHeight: 300, overflowY: "auto", display: "grid", gap: 2 }}>
            {tr.log.map((l, i) => <div key={i} style={{ fontSize: 11, color: "#706050" }}>[R{l.round}] {l.text} <span style={{ opacity: 0.6 }}>{l.time}</span></div>)}
          </div>
        )}
      </Card>
    </div>
  );
}
