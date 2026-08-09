import { useState, useEffect } from "react";
import { Card } from "./ui";
import ChallengePlayer from "./ChallengePlayer";
import FatesPlayer from "./FatesPlayer";
import ExileVotePlayer from "./ExileVotePlayer";
import FinalePlayer from "./FinalePlayer";
import CeremonyPlayer from "./CeremonyPlayer";
import ChaosPowerPlayer from "./ChaosPowerPlayer";
import ConfessionalPlayer from "./ConfessionalPlayer";
import ChallengeErrorBoundary from "./ChallengeErrorBoundary";
import RoundTimerBanner from "./RoundTimerBanner";
import { PHASES } from "../lib/gameState";

const TABS = [
  { key: "game", label: "🎲 Game" },
  { key: "ceremony", label: "⚖️ Ceremony" },
  { key: "confessional", label: "🎥 Confessional" },
];

// ─── Host: View as Player ───
// Mirrors exactly what a given player currently sees on pages/play.jsx —
// same tabs, same phase-specific components — so the host can check what
// someone's screen actually looks like without asking them or logging in
// as them. Strictly READ-ONLY: every interactive control that could write
// something on that player's behalf (a vote, a nomination, a forfeit, a
// re-entry request, a confessional) is switched off via the `readOnly`
// prop threaded through the underlying player components. That's not just
// good manners — game_state writes aren't checked against who's actually
// authenticated, only against whatever player id gets passed in, so
// without this guard the host could accidentally cast a real vote or
// nomination while just looking around.
export default function PlayerViewer({ gameId, targetPlayer, allPlayers, round, onExit }) {
  const [tab, setTab] = useState("game");

  // Reset to the Game tab whenever the host switches which player
  // they're viewing, so leftover tab state doesn't carry over.
  useEffect(() => { setTab("game"); }, [targetPlayer?.id]);

  useEffect(() => {
    if (round?.phase === PHASES.ENDED) setTab((t) => (t === "game" ? "ceremony" : t));
  }, [round?.phase]);

  if (!targetPlayer) return null;

  const player = { id: targetPlayer.id, name: targetPlayer.display_name };
  const exiled = targetPlayer.alive === false;
  const quitByChoice = exiled && targetPlayer.elimination_type === "quit";
  const gameEnded = round?.phase === PHASES.ENDED;

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

      {!targetPlayer.color && (
        <Card style={{ marginBottom: 20, textAlign: "center" }}>
          <p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic", margin: 0 }}>Hasn't picked a color yet.</p>
        </Card>
      )}

      {!targetPlayer.approved && (
        <Card style={{ marginBottom: 20, textAlign: "center", borderColor: "#ff2d95" }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>⏳</div>
          <p style={{ color: "#f5f0ff", fontSize: 15, fontWeight: 600, margin: 0, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
            Waiting for the host to let them in
          </p>
        </Card>
      )}

      {gameEnded && targetPlayer.approved && (
        <div style={{ marginBottom: 20, textAlign: "center", padding: "28px 20px", background: "linear-gradient(160deg, #1a0a2e 0%, #1a0a2e 100%)", border: "2px solid #ff2d95", borderRadius: 12 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🏆</div>
          <p style={{ color: "#f5f0ff", fontSize: 18, fontWeight: 700, margin: 0, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
            {round.winnerName} wins Project B!
          </p>
        </div>
      )}

      {exiled && targetPlayer.approved && !gameEnded && (
        <div style={{
          marginBottom: 20, textAlign: "center", padding: "24px 20px",
          background: "linear-gradient(160deg, #200a1a 0%, #120612 100%)",
          border: "2px solid #ff3860", borderRadius: 12, boxShadow: "0 0 24px rgba(255,56,96,0.25)",
        }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>{quitByChoice ? "🚪" : "💀"}</div>
          <p style={{ color: "#f5f0ff", fontSize: 17, fontWeight: 600, margin: 0, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
            {quitByChoice ? "Left this game." : "Has been exiled."}
          </p>
        </div>
      )}

      {targetPlayer.approved && targetPlayer.color && (
        <>
          <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: "1px solid #3d1f5c" }}>
            {TABS.map((t) => (
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
              <div style={{ marginBottom: 16 }}><RoundTimerBanner round={round} /></div>
              {(!round || round.phase === PHASES.LOBBY) && (
                <Card style={{ marginBottom: 20, textAlign: "center" }}>
                  <p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic", margin: 0 }}>
                    Waiting for the host to start the game.
                  </p>
                </Card>
              )}
              {round?.phase === PHASES.CHALLENGE && (
                <ChallengeErrorBoundary label="Challenge"><ChallengePlayer gameId={gameId} player={player} round={round} readOnly /></ChallengeErrorBoundary>
              )}
              {round?.phase === PHASES.FATES && (
                <ChallengeErrorBoundary label="Fates Ceremony"><FatesPlayer gameId={gameId} player={player} players={allPlayers} round={round} readOnly /></ChallengeErrorBoundary>
              )}
              {round?.phase === PHASES.EXILE && !exiled && (
                <ChallengeErrorBoundary label="Exile Vote">
                  <ChaosPowerPlayer gameId={gameId} round={round} player={player} players={allPlayers} readOnly />
                  <ExileVotePlayer gameId={gameId} player={player} round={round} players={allPlayers} readOnly />
                </ChallengeErrorBoundary>
              )}
              {round?.phase === PHASES.FINALE && (
                <ChallengeErrorBoundary label="Finale">
                  <ChaosPowerPlayer gameId={gameId} round={round} player={player} players={allPlayers} readOnly />
                  <FinalePlayer gameId={gameId} player={player} round={round} players={allPlayers} readOnly />
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
        </>
      )}
    </div>
  );
}
