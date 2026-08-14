import { useState, useEffect } from "react";
import { Card } from "./ui";
import { storageGet, storageUpdate, subscribeGameState } from "../lib/gameStorage";
import { KEY_FINALE } from "../lib/gameState";
import { subscribeFinaleQa } from "../lib/finaleQaData";
import MemoryWall from "./MemoryWall";
import FinaleQaPanel from "./FinaleQaPanel";

const VOTES_KEY = "pb:finale-votes";

export default function FinalePlayer({ gameId, player, round, players, readOnly = false }) {
  const [finale, setFinale] = useState(null);
  const [qa, setQa] = useState({ statements: {}, questions: [] });
  const [choice, setChoice] = useState("");
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [existing, setExisting] = useState(null);

  useEffect(() => {
    const unsubscribe = subscribeGameState(gameId, KEY_FINALE, setFinale);
    return unsubscribe;
  }, [gameId]);

  useEffect(() => {
    const unsubscribe = subscribeFinaleQa(gameId, setQa);
    return unsubscribe;
  }, [gameId]);

  useEffect(() => {
    if (!player?.id) return;
    (async () => {
      const votes = await storageGet(gameId, VOTES_KEY);
      if (votes && votes[player.id]) { setExisting(votes[player.id]); setSubmitted(true); }
    })();
  }, [gameId, player?.id]);

  if (round?.phase !== "finale" || !finale) return null;

  const chaosHolderName = players?.find((p) => p.id === finale.chaosHolderId)?.display_name;

  // Public knowledge from the moment the Finale starts — only their pick
  // stays secret until the reveal. Worth showing to finalists too: the
  // Power of Khaos is drawn from the exiled, never a finalist, so a
  // finalist can't hold it themselves — but knowing who can nullify them
  // is exactly the kind of thing they'd want to know. Skipped for the
  // holder themselves since ChaosPowerPlayer.jsx already shows them a
  // much bigger card saying exactly this.
  const chaosBanner = chaosHolderName && finale.chaosHolderId !== player?.id && (
    <p style={{ textAlign: "center", color: "#a68fd6", fontSize: 12, fontStyle: "italic", margin: "10px 0 0" }}>
      🃏 <strong style={{ color: "#ff3860" }}>{chaosHolderName}</strong> holds the Power of Khaos this round — their pick stays secret until the reveal.
    </p>
  );

  const isFinalist = finale.finalists.some((f) => f.playerId === player?.id);
  const votingOpen = finale.votingOpen;

  // Everything below computes the vote-status-specific card that used to
  // be a set of early returns — now a single `voteSection` value instead,
  // so the Q&A panel (see the bottom of this component) can always be
  // shown alongside it, for every role, not just some.
  let voteSection;

  if (isFinalist) {
    voteSection = (
      <Card style={{ marginBottom: 20, textAlign: "center", borderColor: "rgba(255,45,149,0.5)" }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>🔥</div>
        <p style={{ color: "#f5f0ff", fontSize: 16, fontWeight: 700, margin: "0 0 6px", fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>You made the Finale!</p>
        <p style={{ color: "#a68fd6", fontSize: 13, margin: 0 }}>
          {finale.phase === "qa" ? "Write your statement below, and answer the jury's questions as they come in." : "Every exiled player is voting right now for who should win. Good luck."}
        </p>
        {chaosBanner}
      </Card>
    );
  } else if (!votingOpen && !submitted) {
    voteSection = (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic", margin: 0 }}>
          {finale.phase === "qa" ? "The finale vote hasn't opened yet — read and respond to the Q&A below first." : "The finale vote hasn't opened yet."}
        </p>
        {chaosBanner}
      </Card>
    );
  } else if (submitted) {
    voteSection = (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <div style={{ fontSize: 12, letterSpacing: 4, textTransform: "uppercase", color: "#00ff9d", marginBottom: 6 }}>Vote Cast</div>
        <p style={{ color: "#f5f0ff", fontSize: 15, margin: "0 0 10px" }}>You voted for <strong style={{ color: "#ff2d95" }}>{existing?.targetName}</strong> to win.</p>
        {existing?.reason && (
          <p style={{ color: "#a68fd6", fontSize: 12, fontStyle: "italic", margin: 0, padding: "8px 12px", background: "#0d0618", borderRadius: 8 }}>
            "{existing.reason}"
          </p>
        )}
        {chaosBanner}
      </Card>
    );
  } else if (readOnly) {
    // A read-only viewer (the host "viewing as" this player) can watch
    // status but must never be able to cast a real vote on this player's
    // behalf — same reasoning as ExileVotePlayer/FatesPlayer.
    voteSection = (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic", margin: 0 }}>Hasn't voted yet.</p>
        {chaosBanner}
      </Card>
    );
  } else {
    const submit = async () => {
      if (!choice || !reason.trim()) return;
      const targetName = finale.finalists.find((f) => f.playerId === choice)?.name || "";
      const res = await storageUpdate(gameId, VOTES_KEY, (fresh) => {
        const existingMap = fresh || {};
        existingMap[player.id] = { targetId: choice, targetName, voterName: player.name, reason: reason.trim(), time: new Date().toLocaleTimeString() };
        return existingMap;
      });
      if (res.ok) { setExisting(res.value[player.id]); setSubmitted(true); }
    };

    voteSection = (
      <div style={{ marginBottom: 20 }}>
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 12, letterSpacing: 6, textTransform: "uppercase", color: "#ff2d95", marginBottom: 8 }}>🔥</div>
          <h2 style={{ color: "#f5f0ff", fontFamily: "'Orbitron', 'Segoe UI', sans-serif", marginBottom: 4 }}>Vote for the Winner</h2>
          {chaosBanner}
        </div>
        <Card style={{ marginBottom: 14 }}>
          <MemoryWall candidates={finale.finalists} players={players} selectedId={choice} onSelect={setChoice} />
        </Card>
        <Card style={{ marginBottom: 18 }}>
          <label style={{ display: "block", fontSize: 11, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
            Why? (required — shown when votes are revealed)
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={280}
            rows={3}
            placeholder="Say your piece..."
            style={{ width: "100%", background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 8, padding: "10px 12px", color: "#f5f0ff", fontSize: 13, fontFamily: "'Orbitron', 'Segoe UI', sans-serif", resize: "vertical" }}
          />
        </Card>
        <button onClick={submit} disabled={!choice || !reason.trim()} style={{
          width: "100%", background: (choice && reason.trim()) ? "linear-gradient(135deg, #ff2d95, #b829ff)" : "#3d1f5c",
          color: (choice && reason.trim()) ? "#05010f" : "#6b4f99", border: "none", borderRadius: 10, padding: "14px 24px",
          fontSize: 16, fontWeight: 700, cursor: (choice && reason.trim()) ? "pointer" : "not-allowed",
          fontFamily: "'Orbitron', 'Segoe UI', sans-serif", letterSpacing: 0.5,
        }}>Cast My Vote</button>
      </div>
    );
  }

  return (
    <div>
      {voteSection}
      <FinaleQaPanel gameId={gameId} finale={finale} qa={qa} players={players} player={player} readOnly={readOnly} />
    </div>
  );
}
