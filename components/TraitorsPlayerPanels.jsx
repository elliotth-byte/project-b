import { useState, useEffect } from "react";
import { subscribeGameState } from "../lib/gameStorage";
import { STORAGE_KEY_ROUND_INFO } from "../lib/roundtableData";
import { subscribeMyRole } from "../lib/playerRoles";
import ChallengeErrorBoundary from "./ChallengeErrorBoundary";
import WordPlayer from "./WordPlayer";
import RoundtableVoter from "./RoundtableVoter";
import CasinoPlayer from "./CasinoPlayer";
import HotPotatoPlayer from "./HotPotatoPlayer";
import ZombiePlayer from "./ZombiePlayer";
import PiggyPlayer from "./PiggyPlayer";
import MasqueradePlayer from "./MasqueradePlayer";
import AttackDefendPlayer from "./AttackDefendPlayer";
import VoodooPlayer from "./VoodooPlayer";
import Maze3DPlayer from "./Maze3DPlayer";
import CoffinPlayer from "./CoffinPlayer";
import IcebreakerPlayer from "./IcebreakerPlayer";
import PandoraBoxPlayer from "./PandoraBoxPlayer";
import ConfessionalPlayer from "./TraitorsConfessionalPlayer";
import MurderVotePlayer from "./MurderVotePlayer";

const TABS = [
  { key: "challenge", label: "⚔️ Challenge" },
  { key: "vote", label: "⚖️ Vote" },
  { key: "confessional", label: "🎥 Confessional" },
];

// Player-side counterpart to TraitorsHostPanels.jsx — same tab layout as
// the standalone Traitors app's own pages/play.jsx, just lifted into a
// component so pages/play.jsx can mount it alongside Project B's own
// player tabs rather than replace them. Every component here is the
// same one TraitorsHostPanels' "challenges"/"votes"/"confessionals"
// tabs already drive from the host side; each mini-game self-gates on
// whether it's actually active (see e.g. WordPlayer's own early
// `if (!wordState?.active) return null`), so there's no need to
// duplicate that "is this even running right now" check up here.
export default function PlayerPanels({ gameId, player }) {
  const [tab, setTab] = useState("challenge");
  const [myRole, setMyRole] = useState("faithful");
  const [roundInfo, setRoundInfo] = useState(null);

  // Live subscription to my own role — see sql/add-murder-vote.sql for
  // why this can't be read from anywhere else.
  useEffect(() => {
    if (!gameId || !player?.id) return;
    const unsubscribe = subscribeMyRole(gameId, player.id, setMyRole);
    return unsubscribe;
  }, [gameId, player?.id]);

  // Roundtable's round counter is the one "current round" number players
  // are actually allowed to read (Traitor Roles' own round lives in the
  // host-only table) — used here just to tag confessionals with a round.
  useEffect(() => {
    if (!gameId) return;
    const unsubscribe = subscribeGameState(gameId, STORAGE_KEY_ROUND_INFO, setRoundInfo);
    return unsubscribe;
  }, [gameId]);

  return (
    <div>
      {/* Pandora's Box is a surprise "twist" banner — kept visible
          regardless of which tab a player is on, so nobody misses it. */}
      <ChallengeErrorBoundary label="Pandora's Box"><PandoraBoxPlayer gameId={gameId} player={player} /></ChallengeErrorBoundary>

      <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: "1px solid #253550" }}>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            flex: 1, background: tab === t.key ? "rgba(201,168,76,0.13)" : "transparent",
            color: tab === t.key ? "#c9a84c" : "#a09080",
            border: "none", borderRadius: "8px 8px 0 0", padding: "10px 6px",
            fontSize: 13, fontWeight: 600, cursor: "pointer",
            borderBottom: tab === t.key ? "2px solid #c9a84c" : "2px solid transparent",
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "challenge" && (
        <>
          <ChallengeErrorBoundary label="Word Scramble"><WordPlayer gameId={gameId} playerName={player.name} /></ChallengeErrorBoundary>
          <ChallengeErrorBoundary label="Casino"><CasinoPlayer gameId={gameId} playerName={player.name} /></ChallengeErrorBoundary>
          <ChallengeErrorBoundary label="Hot Potato"><HotPotatoPlayer gameId={gameId} playerName={player.name} /></ChallengeErrorBoundary>
          <ChallengeErrorBoundary label="Zombie Game"><ZombiePlayer gameId={gameId} playerName={player.name} /></ChallengeErrorBoundary>
          <ChallengeErrorBoundary label="Piggy Bank"><PiggyPlayer gameId={gameId} playerName={player.name} /></ChallengeErrorBoundary>
          <ChallengeErrorBoundary label="Masquerade Houses"><MasqueradePlayer gameId={gameId} playerName={player.name} /></ChallengeErrorBoundary>
          <ChallengeErrorBoundary label="Attack/Defend"><AttackDefendPlayer gameId={gameId} playerName={player.name} /></ChallengeErrorBoundary>
          <ChallengeErrorBoundary label="Voodoo Doll"><VoodooPlayer gameId={gameId} playerName={player.name} /></ChallengeErrorBoundary>
          <ChallengeErrorBoundary label="3D Maze"><Maze3DPlayer gameId={gameId} playerName={player.name} /></ChallengeErrorBoundary>
          <ChallengeErrorBoundary label="Coffin Slide"><CoffinPlayer gameId={gameId} playerName={player.name} /></ChallengeErrorBoundary>
          <ChallengeErrorBoundary label="Icebreaker"><IcebreakerPlayer gameId={gameId} playerName={player.name} /></ChallengeErrorBoundary>
        </>
      )}

      {tab === "vote" && (
        <>
          {["traitor-red", "traitor-black"].includes(myRole) && (
            <ChallengeErrorBoundary label="Murder Vote"><MurderVotePlayer gameId={gameId} playerName={player.name} myRole={myRole} /></ChallengeErrorBoundary>
          )}
          <ChallengeErrorBoundary label="Roundtable"><RoundtableVoter gameId={gameId} playerName={player.name} /></ChallengeErrorBoundary>
        </>
      )}

      {tab === "confessional" && (
        <ChallengeErrorBoundary label="Confessional">
          <ConfessionalPlayer gameId={gameId} player={player} round={roundInfo?.round} />
        </ChallengeErrorBoundary>
      )}
    </div>
  );
}
