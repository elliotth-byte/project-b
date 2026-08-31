import { useState, useEffect } from "react";
import { Card } from "./ui";
import { subscribeGameState } from "../lib/gameStorage";
import { KEY_EXILE_HISTORY, KEY_FINALE, KEY_CHALLENGE_HISTORY, KEY_EXILE, KEY_FATES, PHASES } from "../lib/gameState";
import { buildVotingRows } from "../lib/votingSpreadsheet";
import AnnouncementsFeed from "./AnnouncementsFeed";
import VotingHistorySpreadsheet from "./VotingHistorySpreadsheet";
import { LiveNominationsRecap, ChallengeResultsCard, RoundCeremonyCard, FinaleCard, IdentityRevealCard } from "./CeremonyCards";
import { subscribeFinaleQa } from "../lib/finaleQaData";

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
//
// The round/finale/challenge cards themselves live in CeremonyCards.jsx,
// shared with the host's HistoryTab.jsx so the two views can't drift
// apart — this file is just the subscriptions + the page-by-page
// navigation around them.
export default function CeremonyPlayer({ gameId, players, round, settings }) {
  const [exileHistory, setExileHistory] = useState([]);
  const [challengeHistory, setChallengeHistory] = useState([]);
  const [finale, setFinale] = useState(null);
  const [finaleQa, setFinaleQa] = useState({ statements: {}, questions: [] });
  const [liveExile, setLiveExile] = useState(null);
  const [liveFates, setLiveFates] = useState(null);
  const [showComments, setShowComments] = useState(false);
  const [showVotingSheet, setShowVotingSheet] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);

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

  // Not secret at any point during the Finale — same reasoning as
  // KEY_EXILE/KEY_FATES below, subscribed unconditionally rather than
  // scoped to round.phase === "finale" the way those two are, since
  // this needs to keep showing on the Ceremony tab after the game has
  // fully ended too, not just while the Finale is the active phase.
  useEffect(() => {
    const unsubscribe = subscribeFinaleQa(gameId, setFinaleQa);
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

  // One page per "thing that happened" — most recent first — flipped
  // through with arrows instead of scrolling past every round at once.
  // The Finale (if it exists) and an in-progress ceremony (if there is
  // one) always lead, since they're the most current thing going on.
  const pages = [];
  if (finale) pages.push({ type: "finale" });
  if (ceremonyInProgress) pages.push({ type: "inProgress" });
  const roundNumbers = [...new Set([...standaloneChallenges.map((c) => c.round), ...roundsDesc.map((e) => e.round)])].sort((a, b) => b - a);
  roundNumbers.forEach((r) => {
    pages.push(roundsDesc.some((e) => e.round === r) ? { type: "round", round: r } : { type: "challenge", round: r });
  });

  // New rounds/reveals should always bring the player back to "what just
  // happened," not leave them stranded on whatever page they were on.
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
        <VotingHistorySpreadsheet exileHistory={exileHistory} finaleState={finale} players={players} challengeHistory={challengeHistory} />
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
        <Card><p style={{ color: "#6b4f99", fontStyle: "italic", margin: 0 }}>No ceremonies yet — they'll show up here once Round 1's Battle wraps up.</p></Card>
      )}
    </div>
  );
}
