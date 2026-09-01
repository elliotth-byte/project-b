import { useState, useEffect } from "react";
import { subscribeHostState } from "../lib/hostStorage";
import { STORAGE_KEY_TRAITOR_ROLES } from "../lib/traitorData";
import { fetchAllConfessionals, subscribeConfessionalsTable } from "../lib/confessionalsData";
import { subscribeChallengeArchive } from "../lib/challengeArchive";
import ChallengeArchiveList from "./ChallengeArchiveList";
import MissionsHost from "./MissionsHost";
import ScheduledPostsList from "./ScheduledPostsList";
import ChallengeErrorBoundary from "./ChallengeErrorBoundary";
import TraitorRolesHost from "./TraitorRolesHost";
import MurderVoteHost from "./MurderVoteHost";
import AdminHost from "./TraitorsAdminHost";
import HistoryTab from "./TraitorsHistoryTab";
import ConfessionalsHost from "./ConfessionalsHost";
import RoundtableHost from "./RoundtableHost";
import PandoraBoxHost from "./PandoraBoxHost";
import WordHost from "./WordHost";
import CasinoHost from "./CasinoHost";
import HotPotatoHost from "./HotPotatoHost";
import ZombieHost from "./ZombieHost";
import PiggyHost from "./PiggyHost";
import MasqueradeHost from "./MasqueradeHost";
import AttackDefendHost from "./AttackDefendHost";
import VoodooHost from "./VoodooHost";
import Maze3DHost from "./Maze3DHost";
import CoffinHost from "./CoffinHost";
import IcebreakerHost from "./IcebreakerHost";

const BASE_TABS = [
  { key: "traitor", label: "🎭 Traitor Roles" },
  { key: "votes", label: "⚖️ Roundtable" },
  { key: "missions", label: "🎯 Missions" },
  { key: "challenges", label: "⚔️ Challenges" },
  { key: "confessionals", label: "🎥 Confessionals" },
  { key: "history", label: "📜 History & Log" },
  { key: "admin", label: "🛠 Admin" },
];

// Tabbed host layout, mirroring the original artifact's tab bar (Host
// Actions / Missions / Challenges / Roundtable / History / Log) instead of
// one long page of every panel stacked on top of each other. This is
// purely a layout change — every component here is the same one used
// elsewhere, just organized under tabs now.
export default function HostPanels({ gameId, players }) {
  const [tab, setTab] = useState("traitor");
  const [tr, setTr] = useState(null);
  const [unreadConfessionals, setUnreadConfessionals] = useState(0);
  const [challengeArchive, setChallengeArchive] = useState([]);

  useEffect(() => {
    const unsubscribe = subscribeChallengeArchive(gameId, setChallengeArchive);
    return unsubscribe;
  }, [gameId]);

  // A second, independent subscription to the same host-only data
  // TraitorRolesHost itself reads — used here just to drive the summary
  // header and the History tab, without needing TraitorRolesHost to expose
  // its internal state upward.
  useEffect(() => {
    const unsubscribe = subscribeHostState(gameId, STORAGE_KEY_TRAITOR_ROLES, setTr);
    return unsubscribe;
  }, [gameId]);

  // Drives the "🎥 Confessionals 7" unread-count badge on the tab itself.
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
  const aliveMapped = alive.map((p) => ({ id: p.id, name: p.display_name }));
  const allMapped = approvedPlayers.map((p) => ({ id: p.id, name: p.display_name }));
  // Feeds ParticipantPicker's "exclude shielded" / "include returned"
  // toggles — see lib/challengeParticipants.js.
  const shieldedNames = tr ? Object.keys(tr.shielded || {}).filter((n) => tr.shielded[n]) : [];
  const returnedNames = tr
    ? [...new Set((tr.returns || []).map((r) => r.name))].filter((n) => alive.some((p) => p.display_name === n))
    : [];
  const participantProps = { allPlayers: allMapped, shieldedNames, returnedNames };
  const redCount = tr ? alive.filter((p) => tr.roles[p.display_name] === "traitor-red").length : 0;
  const blackCount = tr ? alive.filter((p) => tr.roles[p.display_name] === "traitor-black").length : 0;
  const pendingCount = players.filter((p) => !p.approved).length;

  const TABS = BASE_TABS.map((t) => {
    if (t.key === "confessionals" && unreadConfessionals > 0) return { ...t, label: `${t.label} (${unreadConfessionals})` };
    if (t.key === "admin" && pendingCount > 0) return { ...t, label: `${t.label} (${pendingCount})` };
    return t;
  });

  return (
    <div>
      {/* Summary header — visible above every tab, same info the original kept pinned at the top */}
      <div style={{ marginBottom: 12 }}>
        <p style={{ color: "#a09080", fontSize: 13, margin: 0 }}>
          {alive.length} alive
          {tr && <> · <span style={{ color: "#c45c3c" }}>{redCount}R</span> · <span style={{ color: "#c9a84c" }}>{blackCount}B</span></>}
          {tr?.daggerStolen && <span style={{ color: "#c45c3c" }}> · 🗡️ Dagger Stolen</span>}
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 2, marginBottom: 16, borderBottom: "1px solid #253550", overflowX: "auto" }}>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            background: tab === t.key ? "rgba(201,168,76,0.13)" : "transparent",
            color: tab === t.key ? "#c9a84c" : "#a09080",
            border: "none", borderRadius: "8px 8px 0 0", padding: "8px 14px",
            fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
            borderBottom: tab === t.key ? "2px solid #c9a84c" : "2px solid transparent",
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "traitor" && (
        <div style={{ display: "grid", gap: 16 }}>
          <ChallengeErrorBoundary label="Traitor Roles"><TraitorRolesHost gameId={gameId} players={approvedPlayers} /></ChallengeErrorBoundary>
          <ChallengeErrorBoundary label="Murder Vote"><MurderVoteHost gameId={gameId} players={approvedPlayers} tr={tr} /></ChallengeErrorBoundary>
        </div>
      )}

      {tab === "votes" && (
        <div style={{ display: "grid", gap: 16 }}>
          <ChallengeErrorBoundary label="Roundtable"><RoundtableHost gameId={gameId} players={approvedPlayers} /></ChallengeErrorBoundary>
        </div>
      )}

      {tab === "missions" && (
        <div style={{ display: "grid", gap: 16 }}>
          <ChallengeErrorBoundary label="Mission Briefs"><MissionsHost gameId={gameId} round={tr?.round} /></ChallengeErrorBoundary>
          <ChallengeErrorBoundary label="Pandora's Box"><PandoraBoxHost gameId={gameId} alive={aliveMapped} allPlayers={allMapped} /></ChallengeErrorBoundary>
        </div>
      )}

      {tab === "challenges" && (
        <div style={{ display: "grid", gap: 16 }}>
          {challengeArchive.length > 0 && (
            <ChallengeErrorBoundary label="Challenge Archive">
              <ChallengeArchiveList gameId={gameId} archive={challengeArchive} />
            </ChallengeErrorBoundary>
          )}
          <ChallengeErrorBoundary label="Word Scramble"><WordHost gameId={gameId} alive={aliveMapped} {...participantProps} /></ChallengeErrorBoundary>
          <ChallengeErrorBoundary label="Casino"><CasinoHost gameId={gameId} alive={aliveMapped} {...participantProps} /></ChallengeErrorBoundary>
          <ChallengeErrorBoundary label="Hot Potato"><HotPotatoHost gameId={gameId} alive={aliveMapped} {...participantProps} /></ChallengeErrorBoundary>
          <ChallengeErrorBoundary label="Zombie Game"><ZombieHost gameId={gameId} alive={aliveMapped} {...participantProps} /></ChallengeErrorBoundary>
          <ChallengeErrorBoundary label="Piggy Bank"><PiggyHost gameId={gameId} alive={aliveMapped} {...participantProps} /></ChallengeErrorBoundary>
          <ChallengeErrorBoundary label="Masquerade Houses"><MasqueradeHost gameId={gameId} alive={aliveMapped} {...participantProps} /></ChallengeErrorBoundary>
          <ChallengeErrorBoundary label="Attack/Defend"><AttackDefendHost gameId={gameId} alive={aliveMapped} {...participantProps} /></ChallengeErrorBoundary>
          <ChallengeErrorBoundary label="Voodoo Doll"><VoodooHost gameId={gameId} alive={aliveMapped} {...participantProps} /></ChallengeErrorBoundary>
          <ChallengeErrorBoundary label="3D Maze"><Maze3DHost gameId={gameId} alive={aliveMapped} {...participantProps} /></ChallengeErrorBoundary>
          <ChallengeErrorBoundary label="Coffin Slide"><CoffinHost gameId={gameId} alive={aliveMapped} {...participantProps} /></ChallengeErrorBoundary>
          <ChallengeErrorBoundary label="Icebreaker"><IcebreakerHost gameId={gameId} alive={aliveMapped} {...participantProps} /></ChallengeErrorBoundary>
        </div>
      )}

      {tab === "confessionals" && (
        <ChallengeErrorBoundary label="Confessionals">
          <ConfessionalsHost gameId={gameId} round={tr?.round} />
        </ChallengeErrorBoundary>
      )}

      {tab === "history" && (
        <ChallengeErrorBoundary label="History & Log">
          <HistoryTab gameId={gameId} players={approvedPlayers} tr={tr} challengeArchive={challengeArchive} />
        </ChallengeErrorBoundary>
      )}

      {tab === "admin" && (
        <div style={{ display: "grid", gap: 16 }}>
          <ChallengeErrorBoundary label="Scheduled Slack Posts"><ScheduledPostsList gameId={gameId} /></ChallengeErrorBoundary>
          <ChallengeErrorBoundary label="Admin"><AdminHost gameId={gameId} players={players} /></ChallengeErrorBoundary>
        </div>
      )}
    </div>
  );
}
