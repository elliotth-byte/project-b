import { useState, useEffect } from "react";
import { Card } from "./ui";
import ChallengePlayer from "./ChallengePlayer";
import FatesPlayer from "./FatesPlayer";
import ExileVotePlayer from "./ExileVotePlayer";
import FinalePlayer from "./FinalePlayer";
import CeremonyPlayer from "./CeremonyPlayer";
import ChaosPowerPlayer from "./ChaosPowerPlayer";
import ConfessionalPlayer from "./ConfessionalPlayer";
import ChatPanel from "./ChatPanel";
import HelpPanel from "./HelpPanel";
import RoundRevealGate from "./RoundRevealGate";
import ChallengeErrorBoundary from "./ChallengeErrorBoundary";
import RoundTimerBanner from "./RoundTimerBanner";
import PlayerMemoryWall from "./PlayerMemoryWall";
import { PHASES, KEY_EXILE_HISTORY, KEY_CHALLENGE, KEY_EXILE, KEY_CHALLENGE_HISTORY } from "../lib/gameState";
import { subscribeGameState } from "../lib/gameStorage";
import { subscribeScores } from "../lib/challengeScores";
import { subscribeCloseToTwenty } from "../lib/games/closeToTwentyData";
import { subscribeRevealAck } from "../lib/revealAck";
import { identityComplete } from "../lib/playerIdentity";
import { computeWinnerAndNomineeIds } from "../lib/memoryWallGlow";

const TABS = [
  { key: "game", label: "🎲 Game" },
  { key: "ceremony", label: "⚖️ Ceremony" },
  { key: "confessional", label: "🎥 Confessional" },
  { key: "chat", label: "💬 Chat" },
  { key: "help", label: "❓ Help" },
];

// ─── Host: View as Player ───
// Mirrors exactly what a given player currently sees on pages/play.jsx —
// same tabs, same phase-specific components, same identity/reveal-gate/
// chat-lock logic — so the host can check what someone's screen actually
// looks like without asking them or logging in as them. Strictly
// READ-ONLY: every interactive control that could write something on
// that player's behalf (a vote, a nomination, a forfeit, a re-entry
// request, a confessional, a chat message, a reveal acknowledgment, a
// game preference, a notification setting) is switched off via the
// `readOnly` prop threaded through the underlying components. That's not
// just good manners — game_state writes aren't checked against who's
// actually authenticated, only against whatever player id gets passed
// in, so without this guard the host could accidentally cast a real vote
// or dismiss a player's own dramatic reveal while just looking around.
//
// Two things this deliberately does NOT attempt to replicate, both for
// the same reason — the data needed to do so accurately isn't actually
// available from the host's own browser/session, so a wrong answer would
// be worse than no answer: a player's own push-notification subscription
// state (tied to their own device, not the host's — see HelpPanel.jsx),
// and avatar upload (shown as a static current-avatar display instead of
// the live upload control, so the host can't accidentally change
// someone's picture for them).
export default function PlayerViewer({ gameId, targetPlayer, allPlayers, round, settings, onExit }) {
  const [tab, setTab] = useState("game");
  const [showMemoryWall, setShowMemoryWall] = useState(false);
  const [exileHistory, setExileHistory] = useState([]);
  const [revealAck, setRevealAck] = useState({});
  const [currentChallenge, setCurrentChallenge] = useState(null);
  const [currentScores, setCurrentScores] = useState({});
  const [closeToTwentyState, setCloseToTwentyState] = useState(null);
  const [liveExile, setLiveExile] = useState(null);
  const [challengeHistory, setChallengeHistory] = useState([]);

  // Reset to the Game tab whenever the host switches which player
  // they're viewing, so leftover tab state doesn't carry over.
  useEffect(() => { setTab("game"); }, [targetPlayer?.id]);

  useEffect(() => {
    if (round?.phase === PHASES.ENDED) setTab((t) => (t === "game" ? "ceremony" : t));
  }, [round?.phase]);

  useEffect(() => {
    if (!gameId) return;
    const unsubscribe = subscribeGameState(gameId, KEY_EXILE_HISTORY, (v) => setExileHistory(v || []));
    return unsubscribe;
  }, [gameId]);

  const latestExileEntry = exileHistory.length > 0 ? exileHistory.reduce((a, b) => (b.round > a.round ? b : a)) : null;

  useEffect(() => {
    if (!gameId || !latestExileEntry) { setRevealAck({}); return; }
    const unsubscribe = subscribeRevealAck(gameId, latestExileEntry.round, setRevealAck);
    return unsubscribe;
  }, [gameId, latestExileEntry?.round]); // eslint-disable-line react-hooks/exhaustive-deps

  // Same reasoning as pages/play.jsx's identical subscriptions — needed
  // to accurately replicate the chat-lock behavior during Who Said It /
  // Close to 20 (see chatBlockedByChallenge below).
  useEffect(() => {
    if (!gameId) return;
    const unsubscribe = subscribeGameState(gameId, KEY_CHALLENGE, setCurrentChallenge);
    return unsubscribe;
  }, [gameId]);
  useEffect(() => {
    if (!gameId || !round?.round) return;
    const unsubscribe = subscribeScores(gameId, round.round, setCurrentScores);
    return unsubscribe;
  }, [gameId, round?.round]);
  useEffect(() => {
    if (!gameId || !round?.round) return;
    const unsubscribe = subscribeCloseToTwenty(gameId, round.round, setCloseToTwentyState);
    return unsubscribe;
  }, [gameId, round?.round]);

  // Same data the Memory Wall glows need on pages/play.jsx — see
  // lib/memoryWallGlow.js.
  useEffect(() => {
    if (!gameId) return;
    const unsubscribe = subscribeGameState(gameId, KEY_EXILE, setLiveExile);
    return unsubscribe;
  }, [gameId]);
  useEffect(() => {
    if (!gameId) return;
    const unsubscribe = subscribeGameState(gameId, KEY_CHALLENGE_HISTORY, (v) => setChallengeHistory(v || []));
    return unsubscribe;
  }, [gameId]);

  if (!targetPlayer) return null;

  const player = { id: targetPlayer.id, name: targetPlayer.display_name };
  const exiled = targetPlayer.alive === false;
  const quitByChoice = exiled && targetPlayer.elimination_type === "quit";
  const removedForInactivity = exiled && targetPlayer.elimination_type === "removed_inactivity";
  const gameEnded = round?.phase === PHASES.ENDED;
  // Full identityComplete check (color AND, if alias mode is on, an
  // alias) — not just the color check this used to have, which meant a
  // player who'd picked a color but not yet set an alias would
  // incorrectly show the normal game tabs here instead of the identity
  // setup screen they're actually stuck on.
  const needsIdentity = !identityComplete(targetPlayer, settings);
  const pendingReveal = targetPlayer.approved && !needsIdentity && !!latestExileEntry && !revealAck[targetPlayer.id];
  const { winnerIds, nomineeIds } = computeWinnerAndNomineeIds(challengeHistory, liveExile, round?.round);
  const visibleTabs = TABS.filter((t) => t.key !== "chat" || settings?.chatEnabled);

  const iAmWhoSaidItParticipant = currentChallenge?.gameType === "whosaidit" && currentChallenge?.participantIds?.includes(player.id);
  const iAmCloseToTwentyParticipant = currentChallenge?.gameType === "closeto20" && currentChallenge?.participantIds?.includes(player.id);
  const chatBlockedByChallenge = !!(
    currentChallenge?.active && (
      (iAmWhoSaidItParticipant && !currentScores[player.id]?.locked) ||
      (iAmCloseToTwentyParticipant && !closeToTwentyState?.submittedIds?.includes(player.id))
    )
  );

  return (
    <div>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
        marginBottom: 14, padding: "8px 12px", background: "rgba(255,45,149,0.08)",
        border: "1px solid rgba(255,45,149,0.3)", borderRadius: 8,
      }}>
        <span style={{ fontSize: 13, color: "#f5f0ff" }}>
          👁️ Viewing as <strong style={{ color: "#ff2d95" }}>{targetPlayer.real_display_name || targetPlayer.display_name}</strong>
          {targetPlayer.alias && <> (alias: {targetPlayer.display_name})</>} — read-only
        </span>
        {onExit && (
          <button onClick={onExit} style={{ background: "none", border: "none", color: "#a68fd6", fontSize: 12, cursor: "pointer", flexShrink: 0 }}>
            ✕ Exit
          </button>
        )}
      </div>

      {!targetPlayer.approved && (
        <Card style={{ marginBottom: 20, textAlign: "center", borderColor: "#ff2d95" }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>⏳</div>
          <p style={{ color: "#f5f0ff", fontSize: 15, fontWeight: 600, margin: 0, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
            Waiting for the host to let them in
          </p>
        </Card>
      )}

      {targetPlayer.approved && needsIdentity && (
        <Card style={{ marginBottom: 20, textAlign: "center" }}>
          <p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic", margin: 0 }}>
            {!targetPlayer.color ? "Hasn't picked a color yet." : "Has picked a color but hasn't set an alias yet."}
          </p>
        </Card>
      )}

      {gameEnded && targetPlayer.approved && !pendingReveal && (
        <div style={{ marginBottom: 20, textAlign: "center", padding: "28px 20px", background: "linear-gradient(160deg, #1a0a2e 0%, #1a0a2e 100%)", border: "2px solid #ff2d95", borderRadius: 12 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🏆</div>
          <p style={{ color: "#f5f0ff", fontSize: 18, fontWeight: 700, margin: 0, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
            {round.winnerName} wins Project B!
          </p>
        </div>
      )}

      {exiled && targetPlayer.approved && !gameEnded && !pendingReveal && (
        <div style={{
          marginBottom: 20, textAlign: "center", padding: "24px 20px",
          background: "linear-gradient(160deg, #200a1a 0%, #120612 100%)",
          border: "2px solid #ff3860", borderRadius: 12, boxShadow: "0 0 24px rgba(255,56,96,0.25)",
        }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>{quitByChoice ? "🚪" : removedForInactivity ? "⏳" : "💀"}</div>
          <p style={{ color: "#f5f0ff", fontSize: 17, fontWeight: 600, margin: 0, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
            {quitByChoice ? "Left this game." : removedForInactivity ? "Removed for inactivity." : "Has been exiled."}
          </p>
        </div>
      )}

      {pendingReveal && (
        <ChallengeErrorBoundary label="Round Reveal">
          <RoundRevealGate gameId={gameId} player={player} players={allPlayers} entry={latestExileEntry} readOnly />
        </ChallengeErrorBoundary>
      )}

      {targetPlayer.approved && !needsIdentity && !pendingReveal && (
        <>
          <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: "1px solid #3d1f5c" }}>
            {visibleTabs.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)} style={{
                flex: 1, background: tab === t.key ? "rgba(255,45,149,0.13)" : "transparent",
                color: tab === t.key ? "#ff2d95" : "#a68fd6",
                border: "none", borderRadius: "8px 8px 0 0", padding: "10px 6px",
                fontSize: 13, fontWeight: 600, cursor: "pointer",
                borderBottom: tab === t.key ? "2px solid #ff2d95" : "2px solid transparent",
              }}>
                {t.label}
              </button>
            ))}
          </div>

          {tab === "game" && !gameEnded && (
            <>
              {settings?.avatarMode === "player_upload" && targetPlayer.effectiveAvatarUrl && (
                <Card style={{ marginBottom: 16, textAlign: "center" }}>
                  <img src={targetPlayer.effectiveAvatarUrl} alt="" style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover" }} />
                  <p style={{ color: "#6b4f99", fontSize: 11, margin: "8px 0 0", fontStyle: "italic" }}>Current avatar — upload isn't previewable here.</p>
                </Card>
              )}
              <div style={{ marginBottom: 16 }}><RoundTimerBanner round={round} /></div>
              <div style={{ marginBottom: 16 }}>
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
                    <PlayerMemoryWall players={allPlayers.filter((p) => p.approved)} hideNameLabels={settings?.avatarMode === "collection" && settings?.avatarCollectionId === "default-gods"} winnerIds={winnerIds} nomineeIds={nomineeIds} />
                  </div>
                )}
              </div>
              {(!round || round.phase === PHASES.LOBBY) && (
                <Card style={{ marginBottom: 20, textAlign: "center" }}>
                  <p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic", margin: 0 }}>
                    Waiting for the host to start the game.
                  </p>
                </Card>
              )}
              {round?.phase === PHASES.CHALLENGE && (
                <ChallengeErrorBoundary label="Battle"><ChallengePlayer gameId={gameId} player={player} players={allPlayers} round={round} settings={settings} readOnly /></ChallengeErrorBoundary>
              )}
              {round?.phase === PHASES.FATES && (
                <ChallengeErrorBoundary label="Fates Ceremony"><FatesPlayer gameId={gameId} player={player} players={allPlayers} round={round} settings={settings} readOnly /></ChallengeErrorBoundary>
              )}
              {round?.phase === PHASES.EXILE && !exiled && (
                <ChallengeErrorBoundary label="Exile Vote">
                  <ChaosPowerPlayer gameId={gameId} round={round} player={player} players={allPlayers} settings={settings} readOnly />
                  <ExileVotePlayer gameId={gameId} player={player} round={round} players={allPlayers} settings={settings} readOnly />
                </ChallengeErrorBoundary>
              )}
              {round?.phase === PHASES.FINALE && (
                <ChallengeErrorBoundary label="Finale">
                  <ChaosPowerPlayer gameId={gameId} round={round} player={player} players={allPlayers} settings={settings} readOnly />
                  <FinalePlayer gameId={gameId} player={player} round={round} players={allPlayers} settings={settings} readOnly />
                </ChallengeErrorBoundary>
              )}
            </>
          )}

          {tab === "game" && gameEnded && (
            <p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic", textAlign: "center" }}>
              The game has ended — check the Ceremony tab for the full recap.
            </p>
          )}

          {tab === "ceremony" && (
            <ChallengeErrorBoundary label="Ceremony">
              <CeremonyPlayer gameId={gameId} players={allPlayers} round={round} />
            </ChallengeErrorBoundary>
          )}

          {tab === "confessional" && (
            <ChallengeErrorBoundary label="Confessional">
              <ConfessionalPlayer gameId={gameId} player={player} round={round?.round} readOnly />
            </ChallengeErrorBoundary>
          )}

          {tab === "chat" && settings?.chatEnabled && !chatBlockedByChallenge && (
            <ChallengeErrorBoundary label="Chat">
              <ChatPanel gameId={gameId} player={player} players={allPlayers} realName={targetPlayer.display_name} isExiled={exiled} readOnly />
            </ChallengeErrorBoundary>
          )}

          {tab === "chat" && settings?.chatEnabled && chatBlockedByChallenge && (
            <Card style={{ textAlign: "center" }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>🔒</div>
              <h3 style={{ color: "#f5f0ff", margin: "0 0 6px", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>Chat's Locked</h3>
              <p style={{ color: "#a68fd6", fontSize: 13, margin: 0 }}>
                {iAmWhoSaidItParticipant
                  ? "Panopticon is off-limits until they finish Who Said It — no peeking at the chat log for answers."
                  : "Panopticon is off-limits until they've locked in their coin distribution — no tipping each other off."}
                {" "}It'll unlock the moment they're done.
              </p>
            </Card>
          )}

          {tab === "help" && (
            <HelpPanel gameId={gameId} player={player} readOnly />
          )}
        </>
      )}
    </div>
  );
}
