import { useState, useEffect } from "react";
import { Card } from "./ui";
import { subscribeGameState } from "../lib/gameStorage";
import { KEY_CHALLENGE_HISTORY, KEY_EXILE_HISTORY, KEY_REENTRY, KEY_FINALE, KEY_FATES, KEY_EXILE, PHASES } from "../lib/gameState";
import VotingHistorySpreadsheet from "./VotingHistorySpreadsheet";
import AnnouncementsFeed from "./AnnouncementsFeed";
import { LiveNominationsRecap, ChallengeResultsCard, RoundCeremonyCard, FinaleCard, IdentityRevealCard } from "./CeremonyCards";
import { subscribeFinaleQa } from "../lib/finaleQaData";
import { buildVotingRows } from "../lib/votingSpreadsheet";

// ─── Host: History tab ───
// Deliberately kept in lockstep with the player-facing Ceremony tab
// (CeremonyPlayer.jsx) — same round/finale/challenge cards (shared via
// CeremonyCards.jsx), same page-by-page navigation, same comments and
// voting-sheet toggles. The host gets two things on top of what players
// see: the "Re-entry attempts" summary below, and — like the Ceremony
// tab already did — nothing here shows a live vote tally before it's
// actually revealed; the host already has that live view on the Current
// Round tab, so this stays a clean recap rather than a duplicate.
export default function HistoryTab({ gameId, players, gameName, round, settings }) {
  const [challengeHistory, setChallengeHistory] = useState([]);
  const [exileHistory, setExileHistory] = useState([]);
  const [reentry, setReentry] = useState([]);
  const [finale, setFinale] = useState(null);
  const [finaleQa, setFinaleQa] = useState({ statements: {}, questions: [] });
  const [liveFates, setLiveFates] = useState(null);
  const [liveExile, setLiveExile] = useState(null);
  const [showComments, setShowComments] = useState(false);
  const [showVotingSheet, setShowVotingSheet] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);

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
    const unsubscribe = subscribeGameState(gameId, KEY_FINALE, setFinale);
    return unsubscribe;
  }, [gameId]);
  useEffect(() => {
    const unsubscribe = subscribeFinaleQa(gameId, setFinaleQa);
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

  const votingRows = buildVotingRows(exileHistory, finale?.revealed ? finale : null, byId);
  const rowsForRound = (r) => votingRows.filter((row) => row.context === `Round ${r}`);
  const finaleRows = votingRows.filter((row) => row.context === "Finale");

  const roundsDesc = [...exileHistory].sort((a, b) => b.round - a.round);
  const standaloneChallenges = [...challengeHistory]
    .filter((c) => !exileHistory.some((e) => e.round === c.round))
    .sort((a, b) => b.round - a.round);

  const currentRoundHasHistory = exileHistory.some((e) => e.round === round?.round);
  const ceremonyInProgress = !finale && (round?.phase === "fates" || round?.phase === "exile") && !currentRoundHasHistory;

  const nothingYet = !finale && roundsDesc.length === 0 && standaloneChallenges.length === 0 && !ceremonyInProgress;

  const pages = [];
  if (finale) pages.push({ type: "finale" });
  if (ceremonyInProgress) pages.push({ type: "inProgress" });
  const roundNumbers = [...new Set([...standaloneChallenges.map((c) => c.round), ...roundsDesc.map((e) => e.round)])].sort((a, b) => b - a);
  roundNumbers.forEach((r) => {
    pages.push(roundsDesc.some((e) => e.round === r) ? { type: "round", round: r } : { type: "challenge", round: r });
  });

  useEffect(() => { setPageIndex(0); }, [pages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const clampedIndex = Math.min(pageIndex, Math.max(0, pages.length - 1));
  const currentPage = pages[clampedIndex];

  const pageLabel = (p) => {
    if (!p) return "";
    if (p.type === "finale") return "Finale";
    if (p.type === "inProgress") return `Round ${round.round} — in progress`;
    return `Round ${p.round}`;
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <AnnouncementsFeed gameId={gameId} />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          onClick={() => setShowComments(!showComments)}
          style={{
            background: showComments ? "rgba(255,45,149,0.13)" : "transparent",
            border: "1px solid #3d1f5c", borderRadius: 8, padding: "6px 12px",
            color: showComments ? "#ff2d95" : "#a68fd6", fontSize: 12, cursor: "pointer",
            fontFamily: "'Orbitron', 'Segoe UI', sans-serif",
          }}
        >
          💬 {showComments ? "Hide" : "Show"} all comments
        </button>
        <button
          onClick={() => setShowVotingSheet(!showVotingSheet)}
          style={{
            background: showVotingSheet ? "rgba(255,45,149,0.13)" : "transparent",
            border: "1px solid #3d1f5c", borderRadius: 8, padding: "6px 12px",
            color: showVotingSheet ? "#ff2d95" : "#a68fd6", fontSize: 12, cursor: "pointer",
            fontFamily: "'Orbitron', 'Segoe UI', sans-serif",
          }}
        >
          🗳 {showVotingSheet ? "Hide" : "Show"} voting sheet
        </button>
      </div>

      {showVotingSheet && (
        <VotingHistorySpreadsheet exileHistory={exileHistory} finaleState={finale} players={players} gameName={gameName} challengeHistory={challengeHistory} isHost />
      )}

      {pages.length > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <button
            onClick={() => setPageIndex((i) => Math.min(pages.length - 1, i + 1))}
            disabled={clampedIndex >= pages.length - 1}
            style={{
              background: "transparent", border: "1px solid #3d1f5c", borderRadius: 8, width: 36, height: 36,
              color: clampedIndex >= pages.length - 1 ? "#3d1f5c" : "#a68fd6", fontSize: 16,
              cursor: clampedIndex >= pages.length - 1 ? "default" : "pointer", flexShrink: 0,
            }}
            title="Older"
          >
            ‹
          </button>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#f5f0ff", fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
            {pageLabel(currentPage)}
          </span>
          <button
            onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
            disabled={clampedIndex <= 0}
            style={{
              background: "transparent", border: "1px solid #3d1f5c", borderRadius: 8, width: 36, height: 36,
              color: clampedIndex <= 0 ? "#3d1f5c" : "#a68fd6", fontSize: 16,
              cursor: clampedIndex <= 0 ? "default" : "pointer", flexShrink: 0,
            }}
            title="More recent"
          >
            ›
          </button>
        </div>
      )}

      {currentPage?.type === "finale" && (
        <>
          {round?.phase === PHASES.ENDED && settings?.aliasEnabled && <IdentityRevealCard players={players} />}
          <FinaleCard finale={finale} rows={finaleRows} byId={byId} showComments={showComments} qa={finaleQa} />
        </>
      )}

      {currentPage?.type === "inProgress" && (
        <Card style={{ textAlign: "center", borderColor: "rgba(255,45,149,0.3)" }}>
          <div style={{ fontSize: 24, marginBottom: 4 }}>{round.phase === "fates" ? "⚖️" : "🃏"}</div>
          <p style={{ color: "#f5f0ff", fontSize: 14, fontWeight: 700, margin: "0 0 4px", fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
            Round {round.round}'s {round.phase === "fates" ? "Fates Ceremony" : "Exile Vote"} is underway
          </p>
          <p style={{ color: "#6b4f99", fontSize: 12, fontStyle: "italic", margin: 0 }}>
            This round's full breakdown shows up here once it's revealed — see the Current Round tab for live status.
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

      {currentPage?.type === "challenge" && (
        <ChallengeResultsCard entry={challengeHistory.find((c) => c.round === currentPage.round)} />
      )}

      {currentPage?.type === "round" && (
        <RoundCeremonyCard
          entry={roundsDesc.find((e) => e.round === currentPage.round)}
          challenge={challengeHistory.find((c) => c.round === currentPage.round)}
          rows={rowsForRound(currentPage.round)}
          byId={byId}
          showComments={showComments}
        />
      )}

      {nothingYet && (
        <Card><p style={{ color: "#6b4f99", fontStyle: "italic" }}>No completed rounds yet.</p></Card>
      )}

      {/* Host-only extra — not shown on the player-facing Ceremony tab. */}
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
    </div>
  );
}
