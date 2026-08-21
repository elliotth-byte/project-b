import { useState, useEffect } from "react";
import { Btn, Card, Badge } from "./ui";
import { subscribeRound, subscribeSettings, startSeason as startSeasonState, PHASES, KEY_EXILE, KEY_CHALLENGE_HISTORY } from "../lib/gameState";
import { subscribeGameState } from "../lib/gameStorage";
import { computeWinnerAndNomineeIds } from "../lib/memoryWallGlow";
import { fetchAllConfessionals, subscribeConfessionalsTable } from "../lib/confessionalsData";
import { resolveIdentities, resolveIdentitiesForHost } from "../lib/playerIdentity";
import { resolveAvatars } from "../lib/avatarIdentity";
import ChallengeErrorBoundary from "./ChallengeErrorBoundary";
import ChallengeHost from "./ChallengeHost";
import FatesHost from "./FatesHost";
import ExileVoteHost from "./ExileVoteHost";
import FinaleHost from "./FinaleHost";
import ConfessionalsHost from "./ConfessionalsHost";
import ChatHostPanel from "./ChatHostPanel";
import AdminHost from "./AdminHost";
import HistoryTab from "./HistoryTab";
import RoundTimerBanner from "./RoundTimerBanner";
import HostAnnouncementBox from "./HostAnnouncementBox";
import { postSystemAnnouncement } from "../lib/announcements";
import PlayerViewer from "./PlayerViewer";
import PlayerMemoryWall from "./PlayerMemoryWall";

const BASE_TABS = [
  { key: "round", label: "🎲 Current Round" },
  { key: "confessionals", label: "🎥 Confessionals" },
  { key: "chat", label: "💬 Chat" },
  { key: "history", label: "📜 History" },
  { key: "viewas", label: "👁️ View as Player" },
  { key: "admin", label: "🛠 Admin" },
];

export default function HostPanels({ gameId, players, gameName, adminExtra }) {
  const [tab, setTab] = useState("round");
  const [showMemoryWall, setShowMemoryWall] = useState(false);
  const [round, setRound] = useState(null);
  const [settings, setSettingsState] = useState(null);
  const [unreadConfessionals, setUnreadConfessionals] = useState(0);
  const [starting, setStarting] = useState(false);
  const [viewAsPlayerId, setViewAsPlayerId] = useState("");
  const [liveExile, setLiveExile] = useState(null);
  const [challengeHistory, setChallengeHistory] = useState([]);

  useEffect(() => {
    const unsubscribe = subscribeRound(gameId, setRound);
    return unsubscribe;
  }, [gameId]);

  useEffect(() => {
    const unsubscribe = subscribeSettings(gameId, setSettingsState);
    return unsubscribe;
  }, [gameId]);

  useEffect(() => {
    const unsubscribe = subscribeGameState(gameId, KEY_EXILE, setLiveExile);
    return unsubscribe;
  }, [gameId]);

  useEffect(() => {
    const unsubscribe = subscribeGameState(gameId, KEY_CHALLENGE_HISTORY, (v) => setChallengeHistory(v || []));
    return unsubscribe;
  }, [gameId]);

  useEffect(() => {
    const reloadCount = async () => {
      const data = await fetchAllConfessionals(gameId);
      setUnreadConfessionals(data.filter((c) => !c.read_by_host && !c.archived).length);
    };
    reloadCount();
    const unsubscribe = subscribeConfessionalsTable(gameId, reloadCount);
    return unsubscribe;
  }, [gameId]);

  const approvedPlayers = players.filter((p) => p.approved);
  const alive = approvedPlayers.filter((p) => p.alive);
  const pendingCount = players.filter((p) => !p.approved).length;
  // "View as Player" needs to show exactly what that player sees — aliases
  // included, once the season has them on — not the host's own always-real
  // view. See lib/playerIdentity.js.
  const playerViewRoster = resolveAvatars(resolveIdentities(players, { settings, round, isHost: false }), settings);
  const { winnerIds, nomineeIds } = computeWinnerAndNomineeIds(challengeHistory, liveExile, round?.round);
  // Everywhere ELSE in the host UI (Challenge/Fates/Exile/Finale, History,
  // host Chat) — real name with the alias alongside, baked right into
  // display_name so every one of those components shows both without
  // needing its own alias-specific code. NOT used for Admin's own
  // player list/rename tool, which needs the real, uncombined value to
  // actually edit it — that one still reads `players` directly.
  const hostRoster = resolveAvatars(resolveIdentitiesForHost(players, { settings, round }), settings);
  const hostApprovedRoster = hostRoster.filter((p) => p.approved);

  const TABS = BASE_TABS
    .filter((t) => t.key !== "chat" || settings?.chatEnabled)
    .map((t) => {
      if (t.key === "confessionals" && unreadConfessionals > 0) return { ...t, label: `${t.label} (${unreadConfessionals})` };
      if (t.key === "admin" && pendingCount > 0) return { ...t, label: `${t.label} (${pendingCount})` };
      return t;
    });

  const [startError, setStartError] = useState("");

  const startSeason = async () => {
    setStarting(true);
    setStartError("");
    const ok = await startSeasonState(gameId);
    setStarting(false);
    if (!ok) { setStartError("Couldn't start the round — the write to the database didn't go through. Try again, or check Supabase's logs if it keeps happening."); return; }
    await postSystemAnnouncement(
      gameId,
      "Welcome to Panopticon. Immortality, borne from immortality. Roman numerals sprung from 1s and 0s. An facsimile of an Olympus that could have been. Each of you seek glory, but only one has the cunning and skill to capture it. Who will it be?"
    );
  };

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <p style={{ color: "#a68fd6", fontSize: 13, margin: 0 }}>
          {alive.length} alive out of {approvedPlayers.length}
        </p>
      </div>

      <div style={{ display: "flex", gap: 2, marginBottom: 16, borderBottom: "1px solid #3d1f5c", overflowX: "auto" }}>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            background: tab === t.key ? "rgba(255,45,149,0.13)" : "transparent",
            color: tab === t.key ? "#ff2d95" : "#a68fd6",
            border: "none", borderRadius: "8px 8px 0 0", padding: "8px 14px",
            fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
            borderBottom: tab === t.key ? "2px solid #ff2d95" : "2px solid transparent",
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "round" && (
        <div style={{ display: "grid", gap: 16 }}>
          {(!round || round.phase === PHASES.LOBBY) ? (
            <Card style={{ textAlign: "center" }}>
              <h3 style={{ color: "#f5f0ff", margin: "0 0 8px", fontSize: 16, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>Ready to begin</h3>
              <p style={{ color: "#a68fd6", fontSize: 13, margin: "0 0 14px" }}>
                Approve your players in the Admin tab, then start Round 1 whenever everyone's ready.
              </p>
              <Btn onClick={startSeason} disabled={starting || alive.length < 3}>{starting ? "Starting..." : "Start Round 1"}</Btn>
              {alive.length < 3 && <p style={{ color: "#ff3860", fontSize: 11, marginTop: 8 }}>Need at least 3 approved players.</p>}
              {startError && <p style={{ color: "#ff3860", fontSize: 11, marginTop: 8 }}>{startError}</p>}
            </Card>
          ) : round.phase === PHASES.ENDED ? (
            <Card style={{ textAlign: "center", borderColor: "rgba(255,45,149,0.5)" }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>🏆</div>
              <h3 style={{ color: "#ff2d95", margin: "0 0 4px", fontSize: 20, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
                {round.winnerName || "Someone"} wins Project B!
              </h3>
            </Card>
          ) : (
            <>
              <RoundTimerBanner round={round} />
              <div style={{ marginBottom: 12 }}>
                <button
                  onClick={() => setShowMemoryWall(!showMemoryWall)}
                  style={{
                    background: showMemoryWall ? "rgba(255,45,149,0.13)" : "transparent",
                    border: `1px solid ${showMemoryWall ? "#ff2d95" : "#3d1f5c"}`,
                    color: showMemoryWall ? "#ff2d95" : "#a68fd6", fontSize: 12, cursor: "pointer",
                    borderRadius: 20, padding: "6px 14px", fontWeight: 600,
                  }}
                >
                  🖼 {showMemoryWall ? "Hide" : "Show"} memory wall
                </button>
                {showMemoryWall && (
                  <div style={{ marginTop: 12 }}>
                    <PlayerMemoryWall players={hostApprovedRoster} hideNameLabels={settings?.avatarMode === "collection" && settings?.avatarCollectionId === "default-gods"} winnerIds={winnerIds} nomineeIds={nomineeIds} />
                  </div>
                )}
              </div>
              <HostAnnouncementBox gameId={gameId} />
              {round.phase === PHASES.CHALLENGE && (
                <ChallengeErrorBoundary label="Battle"><ChallengeHost gameId={gameId} players={hostApprovedRoster} round={round} settings={settings} /></ChallengeErrorBoundary>
              )}
              {round.phase === PHASES.FATES && (
                <ChallengeErrorBoundary label="Fates Ceremony"><FatesHost gameId={gameId} players={hostApprovedRoster} round={round} settings={settings} /></ChallengeErrorBoundary>
              )}
              {round.phase === PHASES.EXILE && (
                <ChallengeErrorBoundary label="Exile Vote"><ExileVoteHost gameId={gameId} players={hostApprovedRoster} round={round} /></ChallengeErrorBoundary>
              )}
              {round.phase === PHASES.FINALE && (
                <ChallengeErrorBoundary label="Finale"><FinaleHost gameId={gameId} players={hostApprovedRoster} round={round} /></ChallengeErrorBoundary>
              )}
            </>
          )}
        </div>
      )}

      {tab === "confessionals" && (
        <ChallengeErrorBoundary label="Confessionals">
          <ConfessionalsHost gameId={gameId} round={round?.round} players={hostApprovedRoster} />
        </ChallengeErrorBoundary>
      )}

      {tab === "chat" && settings?.chatEnabled && (
        <ChallengeErrorBoundary label="Chat">
          <ChatHostPanel gameId={gameId} players={hostApprovedRoster} />
        </ChallengeErrorBoundary>
      )}

      {tab === "history" && (
        <ChallengeErrorBoundary label="History">
          <HistoryTab gameId={gameId} players={hostApprovedRoster} gameName={gameName} round={round} />
        </ChallengeErrorBoundary>
      )}

      {tab === "viewas" && (
        <ChallengeErrorBoundary label="View as Player">
          <div style={{ display: "grid", gap: 16 }}>
            <Card>
              <label style={{ display: "block", fontSize: 11, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
                Choose a player
              </label>
              <select
                value={viewAsPlayerId}
                onChange={(e) => setViewAsPlayerId(e.target.value)}
                style={{ width: "100%", background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 6, padding: "8px 10px", color: "#f5f0ff", fontSize: 13 }}
              >
                <option value="">— select a player —</option>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name}{p.alias ? ` (${p.alias})` : ""}{!p.approved ? " (pending)" : p.alive === false ? " (exiled)" : ""}
                  </option>
                ))}
              </select>
              <p style={{ color: "#6b4f99", fontSize: 11, margin: "8px 0 0", fontStyle: "italic" }}>
                Shows exactly what this player sees right now — including their alias in place of everyone's real name, if the
                season has that on — read-only, so nothing you do here affects the game.
              </p>
            </Card>
            {viewAsPlayerId && (
              <PlayerViewer
                gameId={gameId}
                targetPlayer={playerViewRoster.find((p) => p.id === viewAsPlayerId) || null}
                allPlayers={playerViewRoster}
                round={round}
                settings={settings}
                onExit={() => setViewAsPlayerId("")}
              />
            )}
          </div>
        </ChallengeErrorBoundary>
      )}

      {tab === "admin" && (
        <div style={{ display: "grid", gap: 16 }}>
          {adminExtra}
          <ChallengeErrorBoundary label="Admin"><AdminHost gameId={gameId} players={players} round={round} /></ChallengeErrorBoundary>
        </div>
      )}
    </div>
  );
}
