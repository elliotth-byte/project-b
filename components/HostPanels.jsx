import { useState, useEffect } from "react";
import { Btn, Card, Badge } from "./ui";
import { subscribeRound, subscribeSettings, startSeason as startSeasonState, PHASES } from "../lib/gameState";
import { fetchAllConfessionals, subscribeConfessionalsTable } from "../lib/confessionalsData";
import ChallengeErrorBoundary from "./ChallengeErrorBoundary";
import ChallengeHost from "./ChallengeHost";
import FatesHost from "./FatesHost";
import ExileVoteHost from "./ExileVoteHost";
import FinaleHost from "./FinaleHost";
import ConfessionalsHost from "./ConfessionalsHost";
import ScheduledPostsList from "./ScheduledPostsList";
import AdminHost from "./AdminHost";
import HistoryTab from "./HistoryTab";
import RoundTimerBanner from "./RoundTimerBanner";

const BASE_TABS = [
  { key: "round", label: "🎲 Current Round" },
  { key: "confessionals", label: "🎥 Confessionals" },
  { key: "history", label: "📜 History" },
  { key: "admin", label: "🛠 Admin" },
];

export default function HostPanels({ gameId, players, gameName }) {
  const [tab, setTab] = useState("round");
  const [round, setRound] = useState(null);
  const [settings, setSettingsState] = useState(null);
  const [unreadConfessionals, setUnreadConfessionals] = useState(0);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeRound(gameId, setRound);
    return unsubscribe;
  }, [gameId]);

  useEffect(() => {
    const unsubscribe = subscribeSettings(gameId, setSettingsState);
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

  const TABS = BASE_TABS.map((t) => {
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
    if (!ok) setStartError("Couldn't start the round — the write to the database didn't go through. Try again, or check Supabase's logs if it keeps happening.");
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
              {round.phase === PHASES.CHALLENGE && (
                <ChallengeErrorBoundary label="Challenge"><ChallengeHost gameId={gameId} players={approvedPlayers} round={round} settings={settings} /></ChallengeErrorBoundary>
              )}
              {round.phase === PHASES.FATES && (
                <ChallengeErrorBoundary label="Fates Ceremony"><FatesHost gameId={gameId} players={approvedPlayers} round={round} /></ChallengeErrorBoundary>
              )}
              {round.phase === PHASES.EXILE && (
                <ChallengeErrorBoundary label="Exile Vote"><ExileVoteHost gameId={gameId} players={approvedPlayers} round={round} /></ChallengeErrorBoundary>
              )}
              {round.phase === PHASES.FINALE && (
                <ChallengeErrorBoundary label="Finale"><FinaleHost gameId={gameId} players={approvedPlayers} round={round} /></ChallengeErrorBoundary>
              )}
            </>
          )}
        </div>
      )}

      {tab === "confessionals" && (
        <ChallengeErrorBoundary label="Confessionals">
          <ConfessionalsHost gameId={gameId} round={round?.round} />
        </ChallengeErrorBoundary>
      )}

      {tab === "history" && (
        <ChallengeErrorBoundary label="History">
          <HistoryTab gameId={gameId} players={approvedPlayers} gameName={gameName} />
        </ChallengeErrorBoundary>
      )}

      {tab === "admin" && (
        <div style={{ display: "grid", gap: 16 }}>
          <ChallengeErrorBoundary label="Scheduled GroupMe Posts"><ScheduledPostsList gameId={gameId} /></ChallengeErrorBoundary>
          <ChallengeErrorBoundary label="Admin"><AdminHost gameId={gameId} players={players} round={round} /></ChallengeErrorBoundary>
        </div>
      )}
    </div>
  );
}
