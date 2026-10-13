import { useState, useEffect } from "react";
import { Card } from "./traitorsUi";
import { subscribeGameState } from "../lib/gameStorage";
import { STORAGE_KEY_ROUND_INFO } from "../lib/roundtableData";
import { subscribeMyRole } from "../lib/playerRoles";
import { fetchGloballyDisabledChallenges } from "../lib/platformSettings";
import { traitorsIdentityComplete } from "../lib/playerIdentity";
import {
  STORAGE_KEY_WORDS, STORAGE_KEY_CASINO, STORAGE_KEY_HOT_POTATO, STORAGE_KEY_ZOMBIE,
  STORAGE_KEY_PIGGY, STORAGE_KEY_MASQUERADE, STORAGE_KEY_ATTACK_DEFEND, STORAGE_KEY_VOODOO,
  STORAGE_KEY_MAZE3D, STORAGE_KEY_COFFIN, STORAGE_KEY_ICEBREAKER,
  STORAGE_KEY_EYES_VILLA, STORAGE_KEY_PICKPOCKET,
} from "../lib/traitorsMiniGames";
import ChallengeErrorBoundary from "./ChallengeErrorBoundary";
import TraitorsWorkDayGate from "./TraitorsWorkDayGate";
import TraitorsPreseasonLock from "./TraitorsPreseasonLock";
import TraitorsEliminatedScreen from "./TraitorsEliminatedScreen";
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
import EyesVillaPlayer from "./EyesVillaPlayer";
import PickpocketGraspPlayer from "./PickpocketGraspPlayer";
import PandoraBoxPlayer from "./PandoraBoxPlayer";
import ConfessionalPlayer from "./TraitorsConfessionalPlayer";
import MurderVotePlayer from "./MurderVotePlayer";
import ChatPanel from "./ChatPanel";
import PlayerMemoryWall from "./PlayerMemoryWall";
import TraitorsOathReview from "./TraitorsOathReview";

const TABS = [
  { key: "mission", label: "🎯 Mission" },
  { key: "roundtable", label: "⚖️ Roundtable" },
  { key: "gallery", label: "🖼 Portrait Gallery" },
  { key: "confessional", label: "🎥 Confessional" },
  { key: "chat", label: "💬 Chat" },
  { key: "photo", label: "📷 Photo" },
  { key: "help", label: "❓ Help" },
];

// Visually identical to the real thing underneath, but pointer-events:
// none means no click, tap, or keystroke actually reaches it — not just
// disabled-looking, genuinely inert. Used for every tab that has a real
// interactive control (a guess, a vote, a Pandora's Box open) rather
// than threading a `readOnly` prop through all 13 mini-games + Pandora's
// Box + the murder/roundtable votes individually, the way components/
// PlayerViewer.jsx (Project B) does for its own, much smaller set of
// phase components. Chat and Confessional below use the real `readOnly`
// prop instead, since both already support it.
function PreviewOnly({ children }) {
  return <div style={{ pointerEvents: "none" }}>{children}</div>;
}

// ─── Host: View as Player (Traitors) ───
// Mirrors exactly what a given Traitors player currently sees — same
// onboarding gates (alias, oath, pre-season lock), same eliminated
// screen, same tab layout as components/TraitorsPlayerPanels.jsx — so a
// host can check what someone's screen actually looks like without
// asking them or needing their login. See PreviewOnly above for how this
// stays safely non-interactive despite reusing the exact same live
// components a player would see.
//
// targetPlayer/allPlayers are expected to already be alias-resolved from
// THIS PLAYER'S OWN point of view (see TraitorsHostPanels.jsx's own
// playerViewRoster, built the same way pages/play.jsx builds
// identityAllPlayers) — not the host's own "always see both" roster,
// which would leak other players' real names into a view that's
// specifically meant to show what THIS player sees.
export default function TraitorsPlayerViewer({ gameId, targetPlayer, allPlayers, settings, onExit }) {
  const [tab, setTab] = useState("mission");
  const [myRole, setMyRole] = useState("faithful");
  const [roundInfo, setRoundInfo] = useState(null);
  const [globallyDisabled, setGloballyDisabled] = useState(null);

  useEffect(() => { setTab("mission"); }, [targetPlayer?.id]);

  useEffect(() => {
    fetchGloballyDisabledChallenges().then(setGloballyDisabled);
  }, []);

  useEffect(() => {
    if (!gameId || !targetPlayer?.id) return;
    const unsubscribe = subscribeMyRole(gameId, targetPlayer.id, setMyRole);
    return unsubscribe;
  }, [gameId, targetPlayer?.id]);

  useEffect(() => {
    if (!gameId) return;
    const unsubscribe = subscribeGameState(gameId, STORAGE_KEY_ROUND_INFO, setRoundInfo);
    return unsubscribe;
  }, [gameId]);

  if (!targetPlayer) return null;

  const player = { id: targetPlayer.id, name: targetPlayer.display_name, realName: targetPlayer.real_display_name, alive: targetPlayer.alive };
  const needsAlias = !traitorsIdentityComplete(targetPlayer, settings);
  const needsOath = !needsAlias && !targetPlayer.game_prefs?.oathSigned;
  const preseasonLocked = !needsAlias && !needsOath && !!settings?.preseasonLockEnabled;
  const eliminated = targetPlayer.alive === false;

  return (
    <div>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
        marginBottom: 14, padding: "8px 12px", background: "rgba(201,168,76,0.08)",
        border: "1px solid rgba(201,168,76,0.3)", borderRadius: 8,
      }}>
        <span style={{ fontSize: 13, color: "#f0e6d3" }}>
          👁️ Viewing as <strong style={{ color: "#c9a84c" }}>{targetPlayer.real_display_name || targetPlayer.display_name}</strong>
          {targetPlayer.alias && <> (alias: {targetPlayer.display_name})</>} — read-only
        </span>
        {onExit && (
          <button onClick={onExit} style={{ background: "none", border: "none", color: "#a09080", fontSize: 12, cursor: "pointer", flexShrink: 0 }}>
            ✕ Exit
          </button>
        )}
      </div>

      {!targetPlayer.approved && (
        <Card style={{ marginBottom: 20, textAlign: "center", borderColor: "#c9a84c" }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>⏳</div>
          <p style={{ color: "#f0e6d3", fontSize: 15, fontWeight: 600, margin: 0 }}>Waiting for the host to let them in</p>
        </Card>
      )}

      {targetPlayer.approved && needsAlias && (
        <Card style={{ marginBottom: 20, textAlign: "center" }}>
          <p style={{ color: "#706050", fontSize: 13, fontStyle: "italic", margin: 0 }}>Hasn't picked an alias yet.</p>
        </Card>
      )}

      {targetPlayer.approved && !needsAlias && needsOath && (
        <Card style={{ marginBottom: 20, textAlign: "center" }}>
          <p style={{ color: "#706050", fontSize: 13, fontStyle: "italic", margin: 0 }}>Hasn't signed the oath yet.</p>
        </Card>
      )}

      {targetPlayer.approved && !needsAlias && !needsOath && preseasonLocked && (
        <TraitorsPreseasonLock message={settings?.preseasonLockMessage} />
      )}

      {targetPlayer.approved && !needsAlias && !needsOath && !preseasonLocked && (
        eliminated ? (
          <TraitorsEliminatedScreen
            gameId={gameId}
            player={{ id: targetPlayer.id, name: targetPlayer.display_name, eliminationType: targetPlayer.elimination_type }}
            readOnly
          />
        ) : (
          <>
            <PreviewOnly>
              <ChallengeErrorBoundary label="Pandora's Box"><PandoraBoxPlayer gameId={gameId} player={player} /></ChallengeErrorBoundary>
            </PreviewOnly>

            <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: "1px solid #253550" }}>
              {TABS.filter((t) =>
                (t.key !== "chat" || settings?.chatEnabled) &&
                (t.key !== "photo" || settings?.avatarMode === "player_upload") &&
                (t.key !== "gallery" || settings?.memoryWallEnabled !== false)
              ).map((t) => (
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

            {tab === "mission" && (
              <PreviewOnly>
                <TraitorsWorkDayGate gameId={gameId}>
                  {!globallyDisabled?.includes(STORAGE_KEY_WORDS) && (
                    <ChallengeErrorBoundary label="Word Scramble"><WordPlayer gameId={gameId} playerName={player.name} /></ChallengeErrorBoundary>
                  )}
                  {!globallyDisabled?.includes(STORAGE_KEY_CASINO) && (
                    <ChallengeErrorBoundary label="Casino"><CasinoPlayer gameId={gameId} playerName={player.name} /></ChallengeErrorBoundary>
                  )}
                  {!globallyDisabled?.includes(STORAGE_KEY_HOT_POTATO) && (
                    <ChallengeErrorBoundary label="Hot Potato"><HotPotatoPlayer gameId={gameId} playerName={player.name} /></ChallengeErrorBoundary>
                  )}
                  {!globallyDisabled?.includes(STORAGE_KEY_ZOMBIE) && (
                    <ChallengeErrorBoundary label="Zombie Game"><ZombiePlayer gameId={gameId} playerName={player.name} /></ChallengeErrorBoundary>
                  )}
                  {!globallyDisabled?.includes(STORAGE_KEY_PIGGY) && (
                    <ChallengeErrorBoundary label="Piggy Bank"><PiggyPlayer gameId={gameId} playerName={player.name} /></ChallengeErrorBoundary>
                  )}
                  {!globallyDisabled?.includes(STORAGE_KEY_MASQUERADE) && (
                    <ChallengeErrorBoundary label="Masquerade Houses"><MasqueradePlayer gameId={gameId} playerName={player.name} /></ChallengeErrorBoundary>
                  )}
                  {!globallyDisabled?.includes(STORAGE_KEY_ATTACK_DEFEND) && (
                    <ChallengeErrorBoundary label="Attack/Defend"><AttackDefendPlayer gameId={gameId} playerName={player.name} /></ChallengeErrorBoundary>
                  )}
                  {!globallyDisabled?.includes(STORAGE_KEY_VOODOO) && (
                    <ChallengeErrorBoundary label="Voodoo Doll"><VoodooPlayer gameId={gameId} playerName={player.name} /></ChallengeErrorBoundary>
                  )}
                  {!globallyDisabled?.includes(STORAGE_KEY_MAZE3D) && (
                    <ChallengeErrorBoundary label="3D Maze"><Maze3DPlayer gameId={gameId} playerName={player.name} /></ChallengeErrorBoundary>
                  )}
                  {!globallyDisabled?.includes(STORAGE_KEY_COFFIN) && (
                    <ChallengeErrorBoundary label="Coffin Slide"><CoffinPlayer gameId={gameId} playerName={player.name} /></ChallengeErrorBoundary>
                  )}
                  {!globallyDisabled?.includes(STORAGE_KEY_ICEBREAKER) && (
                    <ChallengeErrorBoundary label="Icebreaker"><IcebreakerPlayer gameId={gameId} playerName={player.name} /></ChallengeErrorBoundary>
                  )}
                  {!globallyDisabled?.includes(STORAGE_KEY_EYES_VILLA) && (
                    <ChallengeErrorBoundary label="Eyes of the Villa"><EyesVillaPlayer gameId={gameId} playerName={player.name} /></ChallengeErrorBoundary>
                  )}
                  {!globallyDisabled?.includes(STORAGE_KEY_PICKPOCKET) && (
                    <ChallengeErrorBoundary label="The Pickpocket's Grasp"><PickpocketGraspPlayer gameId={gameId} playerName={player.name} /></ChallengeErrorBoundary>
                  )}
                </TraitorsWorkDayGate>
              </PreviewOnly>
            )}

            {tab === "roundtable" && (
              <PreviewOnly>
                <TraitorsWorkDayGate gameId={gameId}>
                  {["traitor-red", "traitor-black"].includes(myRole) && (
                    <ChallengeErrorBoundary label="Murder Vote"><MurderVotePlayer gameId={gameId} playerName={player.name} myRole={myRole} /></ChallengeErrorBoundary>
                  )}
                  <ChallengeErrorBoundary label="Roundtable"><RoundtableVoter gameId={gameId} playerName={player.name} /></ChallengeErrorBoundary>
                </TraitorsWorkDayGate>
              </PreviewOnly>
            )}

            {tab === "gallery" && settings?.memoryWallEnabled !== false && (
              <ChallengeErrorBoundary label="Portrait Gallery">
                <PlayerMemoryWall players={(allPlayers || []).filter((p) => p.approved && p.elimination_type !== "quit")} winnerIds={new Set()} nomineeIds={new Set()} traitorsMode />
              </ChallengeErrorBoundary>
            )}

            {tab === "confessional" && (
              <ChallengeErrorBoundary label="Confessional">
                <ConfessionalPlayer gameId={gameId} player={player} round={roundInfo?.round} readOnly />
              </ChallengeErrorBoundary>
            )}

            {tab === "chat" && settings?.chatEnabled && (
              <ChallengeErrorBoundary label="Chat">
                <ChatPanel
                  gameId={gameId}
                  player={{ id: player.id, name: player.name }}
                  players={allPlayers || []}
                  realName={player.realName || player.name}
                  isExiled={false}
                  round={null}
                  settings={settings}
                  readOnly
                />
              </ChallengeErrorBoundary>
            )}

            {tab === "photo" && settings?.avatarMode === "player_upload" && (
              <Card style={{ textAlign: "center" }}>
                {targetPlayer.effectiveAvatarUrl ? (
                  <img src={targetPlayer.effectiveAvatarUrl} alt="" style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover" }} />
                ) : (
                  <p style={{ color: "#706050", fontSize: 13, fontStyle: "italic", margin: 0 }}>No photo uploaded yet.</p>
                )}
                <p style={{ color: "#706050", fontSize: 11, margin: "8px 0 0", fontStyle: "italic" }}>Current photo — upload isn't previewable here.</p>
              </Card>
            )}

            {tab === "help" && (
              <ChallengeErrorBoundary label="Help">
                <TraitorsOathReview player={player} />
              </ChallengeErrorBoundary>
            )}
          </>
        )
      )}
    </div>
  );
}
