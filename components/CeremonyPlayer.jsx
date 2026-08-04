import { useState, useEffect } from "react";
import { Card, Badge } from "./ui";
import { subscribeGameState } from "../lib/gameStorage";
import { KEY_EXILE_HISTORY, KEY_FINALE } from "../lib/gameState";
import { buildVotingRows } from "../lib/votingSpreadsheet";

// ─── Player-facing Ceremony tab ───
// Unlike FatesPlayer/ExileVotePlayer/FinalePlayer (which only render while
// their phase is active, and disappear the instant the round moves on),
// this tab is meant to stay available the whole game — including after
// the game itself has ended — so players can always look back at what
// happened at any Fates Ceremony, Exile Vote, or the Finale.
//
// It intentionally does NOT show live/in-progress tallies (that would
// spoil an ongoing vote); it only shows a round once it's actually been
// revealed, which is exactly when it lands in KEY_EXILE_HISTORY / gets
// `revealed: true` on KEY_FINALE.
export default function CeremonyPlayer({ gameId, players, round }) {
  const [exileHistory, setExileHistory] = useState([]);
  const [finale, setFinale] = useState(null);

  useEffect(() => {
    const unsubscribe = subscribeGameState(gameId, KEY_EXILE_HISTORY, (v) => setExileHistory(v || []));
    return unsubscribe;
  }, [gameId]);

  useEffect(() => {
    const unsubscribe = subscribeGameState(gameId, KEY_FINALE, setFinale);
    return unsubscribe;
  }, [gameId]);

  const byId = {};
  (players || []).forEach((p) => (byId[p.id] = p.display_name));

  const votingRows = buildVotingRows(exileHistory, finale?.revealed ? finale : null, byId);
  const rowsForRound = (r) => votingRows.filter((row) => row.context === `Round ${r}`);
  const finaleRows = votingRows.filter((row) => row.context === "Finale");

  const roundsDesc = [...exileHistory].sort((a, b) => b.round - a.round);
  const currentRoundHasHistory = exileHistory.some((e) => e.round === round?.round);
  const ceremonyInProgress = !finale && (round?.phase === "fates" || round?.phase === "exile") && !currentRoundHasHistory;

  const nothingYet = !finale && roundsDesc.length === 0 && !ceremonyInProgress;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {finale && (
        <FinaleCard finale={finale} rows={finaleRows} byId={byId} />
      )}

      {ceremonyInProgress && (
        <Card style={{ textAlign: "center", borderColor: "rgba(255,45,149,0.3)" }}>
          <div style={{ fontSize: 24, marginBottom: 4 }}>{round.phase === "fates" ? "⚖️" : "🃏"}</div>
          <p style={{ color: "#f5f0ff", fontSize: 14, fontWeight: 700, margin: "0 0 4px", fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
            Round {round.round}'s {round.phase === "fates" ? "Fates Ceremony" : "Exile Vote"} is underway
          </p>
          <p style={{ color: "#6b4f99", fontSize: 12, fontStyle: "italic", margin: 0 }}>
            Head to the Game tab to take part. The full breakdown shows up here once it's revealed.
          </p>
        </Card>
      )}

      {roundsDesc.map((e) => (
        <RoundCeremonyCard key={e.round} entry={e} rows={rowsForRound(e.round)} byId={byId} />
      ))}

      {nothingYet && (
        <Card><p style={{ color: "#6b4f99", fontStyle: "italic", margin: 0 }}>No ceremonies yet — they'll show up here once Round 1's Challenge wraps up.</p></Card>
      )}
    </div>
  );
}

function VoteRowsList({ rows }) {
  if (rows.length === 0) return null;
  return (
    <div style={{ display: "grid", gap: 4, marginTop: 6 }}>
      {rows.map((r, i) => (
        <div key={i} style={{ fontSize: 12, color: "#a68fd6", padding: "4px 8px", background: "#0d0618", borderRadius: 6 }}>
          <strong style={{ color: "#f5f0ff" }}>{r.voter}</strong> → <span style={{ color: r.nullified ? "#6b4f99" : "#ff3860" }}>{r.target}</span>
          {r.nullified && <span style={{ color: "#6b4f99" }}> (nullified)</span>}
          {r.reason && <div style={{ fontStyle: "italic", marginTop: 2 }}>"{r.reason}"</div>}
        </div>
      ))}
    </div>
  );
}

function RoundCeremonyCard({ entry: e, rows, byId }) {
  const nominatorOrder = e.fatesNominatorOrder || [];
  const nominations = e.fatesNominations || {};
  const exiledNames = (e.exiledIds || []).map((id) => byId[id] || "?");

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
          Round {e.round} Ceremony
        </h3>
        {e.mode === "save" && <Badge color="#ff3860">Double Elimination</Badge>}
      </div>

      {/* Fates section — who nominated whom, in finishing order */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
          ⚖️ Fates Ceremony
        </div>
        {nominatorOrder.length > 0 ? (
          <div style={{ display: "grid", gap: 4 }}>
            {nominatorOrder.map((n) => (
              <p key={n.playerId} style={{ fontSize: 12, color: "#f5f0ff", margin: 0 }}>
                #{n.place} <strong>{n.name}</strong> nominated{" "}
                <span style={{ color: "#ff3860" }}>{byId[nominations[n.playerId]] || "—"}</span>
              </p>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: 12, color: "#6b4f99", fontStyle: "italic", margin: 0 }}>
            Final Four — everyone besides the Challenge winner was automatically nominated.
          </p>
        )}
      </div>

      {/* Exile Vote section */}
      <div>
        <div style={{ fontSize: 11, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
          🃏 Exile Vote {e.mode === "save" ? "(voting to SAVE)" : "(voting to eliminate)"}
        </div>
        <p style={{ fontSize: 12, color: "#a68fd6", margin: "0 0 4px" }}>
          Nominees: {(e.nominees || []).map((n) => n.name).join(", ")}
        </p>
        {e.chaosHolderId && (
          <p style={{ fontSize: 11, color: "#a68fd6", fontStyle: "italic", margin: "0 0 4px" }}>
            🃏 Power of Chaos held by {byId[e.chaosHolderId] || "?"}
            {e.nullifiedId && <> — nullified <strong>{byId[e.nullifiedId] || "?"}</strong>'s votes</>}
          </p>
        )}
        <VoteRowsList rows={rows} />
        <p style={{ fontSize: 13, color: "#f5f0ff", margin: "8px 0 0", fontWeight: 700 }}>
          {exiledNames.length > 0
            ? <>💀 <span style={{ color: "#ff3860" }}>{exiledNames.join(" and ")}</span> {exiledNames.length > 1 ? "were" : "was"} exiled.</>
            : "No one was exiled this round."}
        </p>
      </div>
    </Card>
  );
}

function FinaleCard({ finale, rows, byId }) {
  const winnerName = finale.winnerId ? byId[finale.winnerId] : null;
  return (
    <Card style={{ borderColor: "rgba(255,45,149,0.5)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>🔥 The Finale</h3>
        {winnerName && <Badge color="#00ff9d">Winner: {winnerName}</Badge>}
      </div>
      <p style={{ fontSize: 12, color: "#a68fd6", margin: "0 0 4px" }}>
        Finalists: {(finale.finalists || []).map((f) => f.name).join(", ")}
      </p>
      {finale.chaosHolderId && (
        <p style={{ fontSize: 11, color: "#a68fd6", fontStyle: "italic", margin: "0 0 4px" }}>
          🃏 Power of Chaos held by {byId[finale.chaosHolderId] || "?"}
          {finale.nullifiedFinalistId && <> — nullified <strong>{byId[finale.nullifiedFinalistId] || "?"}</strong>, who couldn't win</>}
        </p>
      )}
      {finale.revealed ? (
        <>
          <VoteRowsList rows={rows} />
          {winnerName && (
            <p style={{ fontSize: 15, color: "#f5f0ff", margin: "10px 0 0", fontWeight: 700, textAlign: "center" }}>
              🏆 <span style={{ color: "#00ff9d" }}>{winnerName}</span> wins Project B!
            </p>
          )}
        </>
      ) : (
        <p style={{ fontSize: 12, color: "#6b4f99", fontStyle: "italic", margin: "6px 0 0" }}>
          Every exiled player is voting right now. The breakdown shows up here once it's revealed.
        </p>
      )}
    </Card>
  );
}
