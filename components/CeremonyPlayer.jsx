import { useState, useEffect } from "react";
import { Card, Badge } from "./ui";
import { subscribeGameState } from "../lib/gameStorage";
import { KEY_EXILE_HISTORY, KEY_FINALE, KEY_CHALLENGE_HISTORY, KEY_EXILE, KEY_FATES } from "../lib/gameState";
import { GAME_REGISTRY } from "../lib/challengeGames";
import { formatPlacementValue } from "../lib/challengeScores";
import { buildVotingRows } from "../lib/votingSpreadsheet";
import AnnouncementsFeed from "./AnnouncementsFeed";

// ─── Player-facing Ceremony tab ───
// Unlike FatesPlayer/ExileVotePlayer/FinalePlayer (which only render while
// their phase is active, and disappear the instant the round moves on),
// this tab is meant to stay available the whole game — including after
// the game itself has ended — so players can always look back at what
// happened at any Challenge, Fates Ceremony, Exile Vote, or the Finale.
//
// It intentionally does NOT show live/in-progress vote tallies (that would
// spoil an ongoing vote); a round's Fates/Exile detail only shows up once
// it's actually been revealed, which is exactly when it lands in
// KEY_EXILE_HISTORY / gets `revealed: true` on KEY_FINALE. Challenge
// results are different — those are never secret — so they show up here
// the moment a challenge finishes, even before that round's ceremony has.
export default function CeremonyPlayer({ gameId, players, round }) {
  const [exileHistory, setExileHistory] = useState([]);
  const [challengeHistory, setChallengeHistory] = useState([]);
  const [finale, setFinale] = useState(null);
  const [liveExile, setLiveExile] = useState(null);
  const [liveFates, setLiveFates] = useState(null);
  const [showComments, setShowComments] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeGameState(gameId, KEY_EXILE_HISTORY, (v) => setExileHistory(v || []));
    return unsubscribe;
  }, [gameId]);

  useEffect(() => {
    const unsubscribe = subscribeGameState(gameId, KEY_CHALLENGE_HISTORY, (v) => setChallengeHistory(v || []));
    return unsubscribe;
  }, [gameId]);

  useEffect(() => {
    const unsubscribe = subscribeGameState(gameId, KEY_FINALE, setFinale);
    return unsubscribe;
  }, [gameId]);

  // The CURRENT (not-yet-history) exile record — used only to surface this
  // round's Fates nominations while the Exile Vote is still open (that
  // detail isn't secret, so it doesn't need to wait for the vote itself
  // to be revealed the way the vote tally does).
  useEffect(() => {
    const unsubscribe = subscribeGameState(gameId, KEY_EXILE, setLiveExile);
    return unsubscribe;
  }, [gameId, round?.round]); // eslint-disable-line react-hooks/exhaustive-deps

  // Same idea, one step earlier — nominations submitted during the Fates
  // Ceremony itself (before anyone's even reached the vote) are just as
  // public, so this makes them visible here live too, not only on the
  // Game tab.
  useEffect(() => {
    const unsubscribe = subscribeGameState(gameId, KEY_FATES, setLiveFates);
    return unsubscribe;
  }, [gameId, round?.round]); // eslint-disable-line react-hooks/exhaustive-deps

  const byId = {};
  (players || []).forEach((p) => (byId[p.id] = p.display_name));

  const votingRows = buildVotingRows(exileHistory, finale?.revealed ? finale : null, byId);
  const rowsForRound = (r) => votingRows.filter((row) => row.context === `Round ${r}`);
  const finaleRows = votingRows.filter((row) => row.context === "Finale");

  const roundsDesc = [...exileHistory].sort((a, b) => b.round - a.round);
  // Challenges whose round hasn't reached a revealed ceremony yet (still
  // mid Fates/Exile, or this was the Final Four and skipped straight to
  // a vote) — shown as their own standalone card so results don't wait
  // on the rest of the round to finish.
  const standaloneChallenges = [...challengeHistory]
    .filter((c) => !exileHistory.some((e) => e.round === c.round))
    .sort((a, b) => b.round - a.round);

  const currentRoundHasHistory = exileHistory.some((e) => e.round === round?.round);
  const ceremonyInProgress = !finale && (round?.phase === "fates" || round?.phase === "exile") && !currentRoundHasHistory;

  const nothingYet = !finale && roundsDesc.length === 0 && standaloneChallenges.length === 0 && !ceremonyInProgress;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <AnnouncementsFeed gameId={gameId} />

      <button
        onClick={() => setShowComments(!showComments)}
        style={{
          justifySelf: "start", background: showComments ? "rgba(255,45,149,0.13)" : "transparent",
          border: "1px solid #3d1f5c", borderRadius: 8, padding: "6px 12px",
          color: showComments ? "#ff2d95" : "#a68fd6", fontSize: 12, cursor: "pointer",
          fontFamily: "'Orbitron', 'Segoe UI', sans-serif",
        }}
      >
        💬 {showComments ? "Hide" : "Show"} all comments
      </button>

      {finale && (
        <FinaleCard finale={finale} rows={finaleRows} byId={byId} showComments={showComments} />
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
          <LiveNominationsRecap
            nominatorOrder={round.phase === "fates" ? liveFates?.nominatorOrder : liveExile?.fatesNominatorOrder}
            nominations={round.phase === "fates" ? liveFates?.nominations : liveExile?.fatesNominations}
            nominationReasons={round.phase === "fates" ? liveFates?.nominationReasons : liveExile?.fatesNominationReasons}
            byId={byId}
            showComments={showComments}
          />
        </Card>
      )}

      {standaloneChallenges.map((c) => (
        <ChallengeResultsCard key={`challenge-${c.round}`} entry={c} />
      ))}

      {roundsDesc.map((e) => (
        <RoundCeremonyCard key={e.round} entry={e} challenge={challengeHistory.find((c) => c.round === e.round)} rows={rowsForRound(e.round)} byId={byId} showComments={showComments} />
      ))}

      {nothingYet && (
        <Card><p style={{ color: "#6b4f99", fontStyle: "italic", margin: 0 }}>No ceremonies yet — they'll show up here once Round 1's Challenge wraps up.</p></Card>
      )}
    </div>
  );
}

function LiveNominationsRecap({ nominatorOrder, nominations, nominationReasons, byId, showComments }) {
  if (!nominatorOrder?.length) return null;
  return (
    <div style={{ textAlign: "left", marginTop: 12 }}>
      <div style={{ fontSize: 11, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
        ⚖️ Who nominated whom
      </div>
      <div style={{ display: "grid", gap: 4 }}>
        {nominatorOrder.map((n) => (
          <div key={n.playerId}>
            <p style={{ fontSize: 12, color: "#f5f0ff", margin: 0 }}>
              #{n.place} <strong>{n.name}</strong>{" "}
              {nominations?.[n.playerId] ? (
                <>nominated <span style={{ color: "#ff3860" }}>{byId[nominations[n.playerId]] || "—"}</span></>
              ) : (
                <span style={{ color: "#6b4f99", fontStyle: "italic" }}>still deciding...</span>
              )}
            </p>
            {showComments && nominations?.[n.playerId] && nominationReasons?.[n.playerId] && (
              <p style={{ fontSize: 11, color: "#a68fd6", fontStyle: "italic", margin: "2px 0 0" }}>"{nominationReasons[n.playerId]}"</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ChallengeResultsCard({ entry: c }) {
  const registryEntry = c.gameType && GAME_REGISTRY[c.gameType];
  const rankDirection = registryEntry?.rank === "time-asc" ? "time-asc" : "score-desc";
  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
          ⚔️ Round {c.round} Challenge{registryEntry && ` — ${registryEntry.icon} ${registryEntry.label}`}
        </h3>
        {c.finalFour && <Badge color="#ff3860">Final Four</Badge>}
      </div>
      <ChallengePlacementsList placements={c.placements} gameType={c.gameType} rankDirection={rankDirection} />
    </Card>
  );
}

function ChallengePlacementsList({ placements, gameType, rankDirection }) {
  return (
    <div style={{ display: "grid", gap: 3 }}>
      {[...(placements || [])].sort((a, b) => a.place - b.place).map((p) => {
        const scoreLabel = formatPlacementValue(p, gameType, rankDirection);
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
  );
}

function VoteRowsList({ rows, showComments }) {
  if (rows.length === 0) return null;
  return (
    <div style={{ display: "grid", gap: 4, marginTop: 6 }}>
      {rows.map((r, i) => (
        <div key={i} style={{ fontSize: 12, color: "#a68fd6", padding: "4px 8px", background: "#0d0618", borderRadius: 6 }}>
          <strong style={{ color: "#f5f0ff" }}>{r.voter}</strong> → <span style={{ color: r.nullified ? "#6b4f99" : "#ff3860" }}>{r.target}</span>
          {r.nullified && <span style={{ color: "#6b4f99" }}> (nullified)</span>}
          {showComments && r.reason && <div style={{ fontStyle: "italic", marginTop: 2 }}>"{r.reason}"</div>}
        </div>
      ))}
    </div>
  );
}

function RoundCeremonyCard({ entry: e, challenge, rows, byId, showComments }) {
  const nominatorOrder = e.fatesNominatorOrder || [];
  const nominations = e.fatesNominations || {};
  const nominationReasons = e.fatesNominationReasons || {};
  const exiledNames = (e.exiledIds || []).map((id) => byId[id] || "?");
  const registryEntry = challenge?.gameType && GAME_REGISTRY[challenge.gameType];
  const rankDirection = registryEntry?.rank === "time-asc" ? "time-asc" : "score-desc";

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h3 style={{ color: "#ff2d95", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
          Round {e.round} Ceremony
        </h3>
        {e.mode === "save" && <Badge color="#ff3860">Double Elimination</Badge>}
      </div>

      {/* Challenge section — placements and scores */}
      {challenge && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
            ⚔️ Challenge{registryEntry && ` — ${registryEntry.icon} ${registryEntry.label}`}
          </div>
          <ChallengePlacementsList placements={challenge.placements} gameType={challenge.gameType} rankDirection={rankDirection} />
        </div>
      )}

      {/* Fates section — who nominated whom, in finishing order */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
          ⚖️ Fates Ceremony
        </div>
        {nominatorOrder.length > 0 ? (
          <div style={{ display: "grid", gap: 4 }}>
            {nominatorOrder.map((n) => (
              <div key={n.playerId}>
                <p style={{ fontSize: 12, color: "#f5f0ff", margin: 0 }}>
                  #{n.place} <strong>{n.name}</strong> nominated{" "}
                  <span style={{ color: "#ff3860" }}>{byId[nominations[n.playerId]] || "—"}</span>
                </p>
                {showComments && nominationReasons[n.playerId] && (
                  <p style={{ fontSize: 11, color: "#a68fd6", fontStyle: "italic", margin: "2px 0 0" }}>"{nominationReasons[n.playerId]}"</p>
                )}
              </div>
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
          <div style={{ margin: "0 0 4px" }}>
            <p style={{ fontSize: 11, color: "#a68fd6", fontStyle: "italic", margin: 0 }}>
              🃏 Power of Chaos held by {byId[e.chaosHolderId] || "?"}
              {e.nullifiedId && <> — nullified <strong>{byId[e.nullifiedId] || "?"}</strong>'s votes</>}
            </p>
            {showComments && e.nullifiedReason && (
              <p style={{ fontSize: 11, color: "#a68fd6", fontStyle: "italic", margin: "2px 0 0" }}>"{e.nullifiedReason}"</p>
            )}
          </div>
        )}
        <VoteRowsList rows={rows} showComments={showComments} />
        <p style={{ fontSize: 13, color: "#f5f0ff", margin: "8px 0 0", fontWeight: 700 }}>
          {exiledNames.length > 0
            ? <>💀 <span style={{ color: "#ff3860" }}>{exiledNames.join(" and ")}</span> {exiledNames.length > 1 ? "were" : "was"} exiled.</>
            : "No one was exiled this round."}
        </p>
      </div>
    </Card>
  );
}

function FinaleCard({ finale, rows, byId, showComments }) {
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
        <div style={{ margin: "0 0 4px" }}>
          <p style={{ fontSize: 11, color: "#a68fd6", fontStyle: "italic", margin: 0 }}>
            🃏 Power of Chaos held by {byId[finale.chaosHolderId] || "?"}
            {finale.nullifiedFinalistId && <> — nullified <strong>{byId[finale.nullifiedFinalistId] || "?"}</strong>, who couldn't win</>}
          </p>
          {showComments && finale.nullifiedReason && (
            <p style={{ fontSize: 11, color: "#a68fd6", fontStyle: "italic", margin: "2px 0 0" }}>"{finale.nullifiedReason}"</p>
          )}
        </div>
      )}
      {finale.revealed ? (
        <>
          <VoteRowsList rows={rows} showComments={showComments} />
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
