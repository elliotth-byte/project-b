import { useState, useEffect } from "react";
import { Card, Badge } from "./ui";
import { storageGet, storageUpdate, subscribeGameState } from "../lib/gameStorage";
import { KEY_EXILE } from "../lib/gameState";
import MemoryWall from "./MemoryWall";
import { aphroditeBlocksTargeting, powerFor } from "../lib/characterPowers";

// Who's voted, who hasn't — WITHOUT revealing anyone's actual pick
// (that stays secret until the host reveals). Shown throughout the vote
// so waiting players aren't left completely in the dark.
function VoterStatusList({ alivePlayers, votes, currentPlayerId }) {
  const votedIds = new Set(Object.keys(votes || {}));
  return (
    <div style={{ display: "grid", gap: 4 }}>
      {alivePlayers.map((p) => (
        <div key={p.id} style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          background: "#0d0618", borderRadius: 6, padding: "5px 10px",
          border: p.id === currentPlayerId ? "1px solid rgba(255,45,149,0.4)" : "1px solid transparent",
        }}>
          <span style={{ fontSize: 12, color: "#f5f0ff" }}>{p.display_name}</span>
          {votedIds.has(p.id) ? (
            <span style={{ fontSize: 11, color: "#00ff9d" }}>✓ voted</span>
          ) : (
            <span style={{ fontSize: 11, color: "#6b4f99", fontStyle: "italic" }}>waiting...</span>
          )}
        </div>
      ))}
    </div>
  );
}

// Who nominated whom at this round's Fates Ceremony — this is never
// secret (nominations were made in the open), so it's shown throughout
// the Exile Vote too, not just after the vote itself is revealed.
function NominationsRecap({ nominatorOrder, nominations, nominationReasons, byId }) {
  if (!nominatorOrder?.length) return null;
  return (
    <Card style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
        ⚖️ Fates Ceremony — who nominated whom
      </div>
      <div style={{ display: "grid", gap: 4 }}>
        {nominatorOrder.map((n) => (
          <div key={n.playerId}>
            <p style={{ fontSize: 12, color: "#f5f0ff", margin: 0 }}>
              #{n.place} <strong>{n.name}</strong> nominated{" "}
              <span style={{ color: "#ff3860" }}>{byId[nominations?.[n.playerId]] || "—"}</span>
            </p>
            {nominationReasons?.[n.playerId] && (
              <p style={{ fontSize: 11, color: "#a68fd6", fontStyle: "italic", margin: "2px 0 0" }}>"{nominationReasons[n.playerId]}"</p>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function ExileVotePlayer({ gameId, player, round, players, readOnly = false, settings }) {
  const [exile, setExile] = useState(null);
  const [choice, setChoice] = useState("");
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [existing, setExisting] = useState(null);
  const [votes, setVotes] = useState({});

  const votesKey = `pb:exile-votes:${round?.round}`;
  const alivePlayers = (players || []).filter((p) => p.approved && p.alive);
  const byId = {};
  (players || []).forEach((p) => (byId[p.id] = p.display_name));
  const aphroditeBlockedId = aphroditeBlocksTargeting(players, settings, player?.id);

  useEffect(() => {
    const unsubscribe = subscribeGameState(gameId, KEY_EXILE, setExile);
    return unsubscribe;
  }, [gameId, round?.round]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live count of who's voted (not what they voted) — this is what
  // powers VoterStatusList; who's-in/who's-out is not secret, only the
  // choices themselves are.
  useEffect(() => {
    if (!round?.round) return;
    const unsubscribe = subscribeGameState(gameId, votesKey, (v) => setVotes(v || {}));
    return unsubscribe;
  }, [gameId, round?.round]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!round?.round || !player?.id) return;
    (async () => {
      const votes = await storageGet(gameId, votesKey);
      if (votes && votes[player.id]) {
        setExisting(votes[player.id]);
        setSubmitted(true);
      } else {
        setExisting(null);
        setSubmitted(false);
      }
    })();
  }, [gameId, player?.id, round?.round]); // eslint-disable-line react-hooks/exhaustive-deps

  if (round?.phase !== "exile" || !exile) return null;

  const votingOpen = exile.votingOpen;
  const verb = exile.mode === "save" ? "SAVE" : "eliminate";
  const chaosHolderName = players?.find((p) => p.id === exile.chaosHolderId)?.display_name;

  // Public knowledge from the moment the round starts — only their actual
  // pick stays secret until the reveal. Skipped for the holder themselves
  // since ChaosPowerPlayer.jsx already shows them a much bigger card
  // saying exactly this.
  const chaosBanner = chaosHolderName && exile.chaosHolderId !== player?.id && (
    <p style={{ textAlign: "center", color: "#a68fd6", fontSize: 12, fontStyle: "italic", margin: "0 0 16px" }}>
      🃏 <strong style={{ color: "#ff3860" }}>{chaosHolderName}</strong> holds the Power of Khaos this round — their pick stays secret until the reveal.
    </p>
  );

  const voterStatus = alivePlayers.length > 1 && (
    <Card style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
        Votes: {Object.keys(votes).length}/{alivePlayers.length} in
      </div>
      <VoterStatusList alivePlayers={alivePlayers} votes={votes} currentPlayerId={player?.id} />
    </Card>
  );

  const submitVote = async () => {
    if (!choice || !reason.trim()) return;
    if (aphroditeBlocksTargeting(players, settings, player?.id) === choice) return; // same defense-in-depth pattern as the disabledIds check below
    const targetName = exile.nominees.find((n) => n.playerId === choice)?.name || "";
    const res = await storageUpdate(gameId, votesKey, (fresh) => {
      const existingMap = fresh || {};
      existingMap[player.id] = { targetId: choice, targetName, voterName: player.name, reason: reason.trim(), time: new Date().toLocaleTimeString() };
      return existingMap;
    });
    if (res.ok) {
      setExisting(res.value[player.id]);
      setSubmitted(true);
    }
  };

  const changeVote = () => { setSubmitted(false); setExisting(null); setChoice(existing?.targetId || ""); setReason(existing?.reason || ""); };

  const nominationsRecap = (
    <NominationsRecap nominatorOrder={exile.fatesNominatorOrder} nominations={exile.fatesNominations} nominationReasons={exile.fatesNominationReasons} byId={byId} />
  );

  if (!votingOpen && !submitted) {
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <div style={{ fontSize: 12, letterSpacing: 4, textTransform: "uppercase", color: "#ff2d95", marginBottom: 6 }}>🃏</div>
        <p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic", margin: "0 0 10px" }}>The vote is quiet. Await the host's command.</p>
        {chaosBanner}
        <div style={{ textAlign: "left" }}>{nominationsRecap}</div>
      </Card>
    );
  }

  if (submitted) {
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <div style={{ fontSize: 12, letterSpacing: 4, textTransform: "uppercase", color: "#00ff9d", marginBottom: 6 }}>Vote Cast</div>
        <p style={{ color: "#f5f0ff", fontSize: 15, margin: "0 0 10px" }}>
          You voted to {verb} <strong style={{ color: "#ff3860" }}>{existing?.targetName}</strong>
        </p>
        {existing?.reason && (
          <p style={{ color: "#a68fd6", fontSize: 12, fontStyle: "italic", margin: "0 0 14px", padding: "8px 12px", background: "#0d0618", borderRadius: 8 }}>
            "{existing.reason}"
          </p>
        )}
        {votingOpen && !readOnly && (
          <button onClick={changeVote} style={{
            background: "transparent", border: "1px solid #3d1f5c", borderRadius: 10, padding: "10px 24px",
            color: "#a68fd6", fontSize: 14, cursor: "pointer", fontFamily: "'Orbitron', 'Segoe UI', sans-serif",
          }}>Change My Vote</button>
        )}
        <div style={{ marginTop: 14 }}>{chaosBanner}</div>
        <div style={{ marginTop: 14, textAlign: "left" }}>{nominationsRecap}</div>
        <div style={{ textAlign: "left" }}>{voterStatus}</div>
      </Card>
    );
  }

  // A read-only viewer (the host "viewing as" this player) can watch
  // live status but must never be able to cast a real vote on this
  // player's behalf — game_state writes here aren't checked against who's
  // actually authenticated, only against whatever player id gets passed
  // in, so this guard is the only thing stopping that.
  if (readOnly) {
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <div style={{ fontSize: 12, letterSpacing: 4, textTransform: "uppercase", color: "#ff2d95", marginBottom: 6 }}>🃏</div>
        <p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic", margin: "0 0 10px" }}>Hasn't voted yet.</p>
        {chaosBanner}
        <div style={{ textAlign: "left" }}>{nominationsRecap}</div>
        <div style={{ textAlign: "left" }}>{voterStatus}</div>
      </Card>
    );
  }

  // Dionysus's character power (see lib/characterPowers.js): "Does not
  // have the ability to cast a vote" — whoever currently resolves to
  // Dionysus (however many times the power's been swapped around) never
  // gets the actual voting picker, though everything informational
  // (nominations, chaos banner, live voter count) still shows.
  if (powerFor(player, settings) === "Dionysus") {
    return (
      <Card style={{ marginBottom: 20, textAlign: "center" }}>
        <div style={{ fontSize: 22, marginBottom: 4 }}>🍇</div>
        <p style={{ color: "#a68fd6", fontSize: 13, margin: "0 0 10px" }}>Dionysus's power: you can't cast a vote this round.</p>
        {chaosBanner}
        <div style={{ textAlign: "left" }}>{nominationsRecap}</div>
        <div style={{ textAlign: "left" }}>{voterStatus}</div>
      </Card>
    );
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <div style={{ fontSize: 12, letterSpacing: 6, textTransform: "uppercase", color: "#ff2d95", marginBottom: 8 }}>🃏</div>
        <h2 style={{ color: "#f5f0ff", fontFamily: "'Orbitron', 'Segoe UI', sans-serif", marginBottom: 4 }}>Exile Vote — Round {round.round}</h2>
        <p style={{ color: "#a68fd6", fontSize: 14, marginBottom: 8 }}>Vote to {verb}:</p>
        {chaosBanner}
      </div>
      {nominationsRecap}
      {voterStatus}
      <Card style={{ marginBottom: 14 }}>
        {/* Nominees never include the voter themselves — a player can't
            vote to eliminate/save themselves. */}
        <MemoryWall
          candidates={exile.nominees.filter((n) => n.playerId !== player?.id)}
          players={players}
          selectedId={choice}
          onSelect={setChoice}
          hideNameLabels={settings?.avatarMode === "collection" && settings?.avatarCollectionId === "default-gods"}
          disabledIds={aphroditeBlockedId ? [aphroditeBlockedId] : []}
        />
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
      <button onClick={submitVote} disabled={!choice || !reason.trim()} style={{
        width: "100%", background: (choice && reason.trim()) ? "linear-gradient(135deg, #ff2d95, #b829ff)" : "#3d1f5c",
        color: (choice && reason.trim()) ? "#05010f" : "#6b4f99", border: "none", borderRadius: 10, padding: "14px 24px",
        fontSize: 16, fontWeight: 700, cursor: (choice && reason.trim()) ? "pointer" : "not-allowed",
        fontFamily: "'Orbitron', 'Segoe UI', sans-serif", letterSpacing: 0.5,
      }}>Cast My Vote</button>
    </div>
  );
}
