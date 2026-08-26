import { useState, useEffect } from "react";
import { Card, Badge, Btn } from "./ui";
import { storageUpdate, subscribeGameState } from "../lib/gameStorage";
import { KEY_FATES, KEY_CHALLENGE } from "../lib/gameState";
import { isValidNomination, takenNomineeIds, isNominatorsTurn, preferenceSlotsFor } from "../lib/fatesLogic";
import { aphroditeBlocksTargeting, findAresImmunePlayerId } from "../lib/characterPowers";
import MemoryWall from "./MemoryWall";

// Shared live-status list — who's nominating, who's already submitted
// (and to whom), who's still deciding. Shown to waiting players AND to
// the nominators themselves, so everyone can see the same picture and
// nominators can avoid duplicating each other's choice.
function NominatorStatusList({ nominatorOrder, nominations, nominationReasons, byId, highlightId }) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      {nominatorOrder.map((n) => {
        const nomineeId = nominations?.[n.playerId];
        const reason = nominationReasons?.[n.playerId];
        return (
          <div key={n.playerId} style={{
            display: "flex", flexDirection: "column", gap: 2, background: "#0d0618", borderRadius: 8, padding: "8px 10px",
            border: n.playerId === highlightId ? "1px solid rgba(255,45,149,0.4)" : "1px solid transparent",
          }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Badge>#{n.place}</Badge>
              <span style={{ flex: 1, fontSize: 13, color: "#f5f0ff", fontWeight: 700 }}>{n.name}</span>
              {nomineeId ? (
                <span style={{ fontSize: 12, color: "#00ff9d" }}>✓ nominated <strong style={{ color: "#ff3860" }}>{byId[nomineeId] || "?"}</strong></span>
              ) : (
                <span style={{ fontSize: 12, color: "#6b4f99", fontStyle: "italic" }}>still deciding...</span>
              )}
            </div>
            {nomineeId && reason && (
              <div style={{ fontSize: 11, color: "#a68fd6", fontStyle: "italic", paddingLeft: 4 }}>"{reason}"</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function FatesPlayer({ gameId, player, players, round, readOnly = false, settings }) {
  const [fates, setFates] = useState(null);
  const [challenge, setChallenge] = useState(null);
  const [choice, setChoice] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    const unsubscribe = subscribeGameState(gameId, KEY_FATES, setFates);
    return unsubscribe;
  }, [gameId, round?.round]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const unsubscribe = subscribeGameState(gameId, KEY_CHALLENGE, setChallenge);
    return unsubscribe;
  }, [gameId, round?.round]); // eslint-disable-line react-hooks/exhaustive-deps

  if (round?.phase !== "fates" || !fates) return null;

  const others = (players || []).filter((p) => p.approved && p.alive);
  const byId = {};
  others.forEach((p) => (byId[p.id] = p.display_name));

  const myEntry = fates.nominatorOrder.find((n) => n.playerId === player?.id);
  if (!myEntry) {
    return (
      <Card style={{ marginBottom: 20 }}>
        <div style={{ textAlign: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 12, letterSpacing: 4, textTransform: "uppercase", color: "#ff2d95", marginBottom: 6 }}>⚖️ Fates Ceremony</div>
          <p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic", margin: 0 }}>
            The top 3 finishers are making their nominations.
          </p>
        </div>
        <NominatorStatusList nominatorOrder={fates.nominatorOrder} nominations={fates.nominations} nominationReasons={fates.nominationReasons} byId={byId} />
      </Card>
    );
  }

  const winnerId = (challenge?.placements || []).find((p) => p.place === 1)?.playerId || null;
  const alreadySubmitted = fates.nominations?.[player.id];

  if (alreadySubmitted) {
    const name = byId[alreadySubmitted];
    return (
      <Card style={{ marginBottom: 20 }}>
        <div style={{ textAlign: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 12, letterSpacing: 4, textTransform: "uppercase", color: "#00ff9d", marginBottom: 6 }}>Nomination Submitted</div>
          <p style={{ color: "#f5f0ff", fontSize: 15, margin: 0 }}>You nominated <strong style={{ color: "#ff3860" }}>{name}</strong></p>
        </div>
        <NominatorStatusList nominatorOrder={fates.nominatorOrder} nominations={fates.nominations} nominationReasons={fates.nominationReasons} byId={byId} highlightId={player.id} />
      </Card>
    );
  }

  const taken = takenNomineeIds(fates.nominations, player.id);
  const aphroditeBlockedId = aphroditeBlocksTargeting(players, settings, player.id);
  const aresImmuneId = findAresImmunePlayerId(players, settings, round);
  const myTurn = isNominatorsTurn(fates.nominatorOrder, fates.nominations, player.id);
  const mySlots = preferenceSlotsFor(myEntry.place);
  const myPreferences = fates.preferences?.[player.id] || [];

  // A read-only viewer (the host "viewing as" this player) can watch the
  // live status but must never be able to submit a real nomination OR a
  // preference list on this player's behalf — game_state writes here
  // aren't checked against who's actually authenticated, only against
  // whatever player id gets passed in, so this guard is the only thing
  // stopping that. Checked BEFORE the turn/preferences branching below
  // so a read-only viewer always sees a plain status message, regardless
  // of which of those two states the real player is actually in.
  if (readOnly) {
    const statusLine = myTurn
      ? "hasn't nominated yet."
      : myPreferences.length > 0
        ? `has pre-ranked ${myPreferences.length} preference${myPreferences.length === 1 ? "" : "s"} for when their turn comes.`
        : "hasn't set any preferences yet.";
    return (
      <Card style={{ marginBottom: 20 }}>
        <div style={{ textAlign: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 12, letterSpacing: 4, textTransform: "uppercase", color: "#ff2d95", marginBottom: 6 }}>⚖️ Fates Ceremony</div>
          <p style={{ color: "#6b4f99", fontSize: 13, fontStyle: "italic", margin: 0 }}>
            Finished #{myEntry.place} — {statusLine}
          </p>
        </div>
        <NominatorStatusList nominatorOrder={fates.nominatorOrder} nominations={fates.nominations} nominationReasons={fates.nominationReasons} byId={byId} highlightId={player.id} />
      </Card>
    );
  }

  // Not their turn yet, but they finished 2nd or 3rd — offer the
  // ranked-preference form instead of making them wait idle. The
  // server (lib/roundEngine.js's resolveFatesPreferences) resolves this
  // into a real nomination automatically the instant it becomes their
  // turn, if their top-ranked still-available choice exists; if every
  // ranked pick has since been taken, they fall through to the normal
  // manual-pick UI below once their turn actually arrives.
  if (!myTurn && mySlots > 0) {
    return (
      <FatesPreferenceForm
        gameId={gameId} player={player} others={others} byId={byId} settings={settings}
        fates={fates} myEntry={myEntry} mySlots={mySlots} myPreferences={myPreferences}
        winnerId={winnerId} aphroditeBlockedId={aphroditeBlockedId} aresImmuneId={aresImmuneId}
      />
    );
  }

  const submit = async () => {
    if (!choice || !reason.trim()) return;
    if (aphroditeBlockedId && choice === aphroditeBlockedId) return; // same defense-in-depth pattern as the taken-nominee re-check just below
    if (aresImmuneId && choice === aresImmuneId) return;
    await storageUpdate(gameId, KEY_FATES, (fresh) => {
      if (!fresh) return null;
      const stillTaken = takenNomineeIds(fresh.nominations, player.id);
      if (stillTaken.has(choice)) return fresh; // someone else grabbed it first — abort, let the UI re-render disabled
      fresh.nominations = { ...(fresh.nominations || {}), [player.id]: choice };
      fresh.nominationReasons = { ...(fresh.nominationReasons || {}), [player.id]: reason.trim() };
      return fresh;
    });
  };

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 12, letterSpacing: 6, textTransform: "uppercase", color: "#ff2d95", marginBottom: 8 }}>⚖️</div>
        <h2 style={{ color: "#f5f0ff", fontFamily: "'Orbitron', 'Segoe UI', sans-serif", marginBottom: 4 }}>Make Your Nomination</h2>
        <p style={{ color: "#a68fd6", fontSize: 13 }}>You finished #{myEntry.place} — nominate someone for exile.</p>
      </div>
      {(fates.nominatorOrder.length > 1) && (
        <Card style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Live status</div>
          <NominatorStatusList nominatorOrder={fates.nominatorOrder} nominations={fates.nominations} nominationReasons={fates.nominationReasons} byId={byId} highlightId={player.id} />
          <p style={{ color: "#6b4f99", fontSize: 11, marginTop: 8, marginBottom: 0, fontStyle: "italic" }}>
            Nominees can't be duplicated — whoever's already been picked is grayed out below.
          </p>
        </Card>
      )}
      <Card style={{ marginBottom: 12 }}>
        <MemoryWall
          candidates={others.map((p) => ({ playerId: p.id, name: p.display_name }))}
          players={players}
          selectedId={choice}
          onSelect={setChoice}
          hideNameLabels={settings?.avatarMode === "collection" && settings?.avatarCollectionId === "default-gods"}
          disabledIds={others.filter((p) => !isValidNomination(player.id, p.id, winnerId, taken, aphroditeBlockedId, aresImmuneId).ok).map((p) => p.id)}
        />
      </Card>
      <Card style={{ marginBottom: 16 }}>
        <label style={{ display: "block", fontSize: 11, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
          Why? (required)
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={280}
          rows={3}
          placeholder="Say your piece..."
          style={{ width: "100%", background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 8, padding: "10px 12px", color: "#f5f0ff", fontSize: 13, fontFamily: "'Orbitron', 'Segoe UI', sans-serif", resize: "vertical", boxSizing: "border-box" }}
        />
      </Card>
      <button onClick={submit} disabled={!choice || !reason.trim()} style={{
        width: "100%", background: (choice && reason.trim()) ? "linear-gradient(135deg, #ff2d95, #b829ff)" : "#3d1f5c",
        color: (choice && reason.trim()) ? "#05010f" : "#6b4f99", border: "none", borderRadius: 10, padding: "14px 24px",
        fontSize: 16, fontWeight: 700, cursor: (choice && reason.trim()) ? "pointer" : "not-allowed",
        fontFamily: "'Orbitron', 'Segoe UI', sans-serif", letterSpacing: 0.5,
      }}>Submit Nomination</button>
    </div>
  );
}

const ORDINALS = ["1st", "2nd", "3rd", "4th", "5th"];

// Shown to 2nd/3rd place before their turn arrives — lets them rank
// their top choices now instead of sitting idle. Saved any time, as
// many times as they like, up until the server resolves it (see
// lib/roundEngine.js's resolveFatesPreferences) the instant their turn
// actually comes — a slot left blank here just means a shorter
// fallback chain for the server to try, not an error.
function FatesPreferenceForm({ gameId, player, others, byId, settings, fates, myEntry, mySlots, myPreferences, winnerId, aphroditeBlockedId, aresImmuneId }) {
  const [ranks, setRanks] = useState(() => {
    const padded = [...myPreferences];
    while (padded.length < mySlots) padded.push({ nomineeId: "", reason: "" });
    return padded.slice(0, mySlots);
  });
  const [saved, setSaved] = useState(false);

  const setRank = (i, patch) => {
    setSaved(false);
    setRanks((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };

  // A candidate valid for THIS slot: not the acting player, not the
  // immune winner, not power-blocked, and not already ranked in a
  // DIFFERENT slot of this same list (ranking the same person twice is
  // never useful — it can't ever fall through to itself). Deliberately
  // does NOT check who's currently "taken" by another nominator's real
  // nomination — that can still change before this player's turn
  // actually arrives, so it's re-checked fresh at resolution time
  // instead (see lib/fatesLogic.js's resolveNominationFromPreferences).
  const candidatesFor = (slotIndex) => {
    const rankedElsewhere = new Set(ranks.filter((_, i) => i !== slotIndex).map((r) => r.nomineeId).filter(Boolean));
    return others.filter((p) => {
      if (rankedElsewhere.has(p.id)) return false;
      return isValidNomination(player.id, p.id, winnerId, null, aphroditeBlockedId, aresImmuneId).ok;
    });
  };

  const save = async () => {
    const complete = ranks.filter((r) => r.nomineeId && r.reason.trim());
    await storageUpdate(gameId, KEY_FATES, (fresh) => {
      if (!fresh) return fresh;
      return { ...fresh, preferences: { ...(fresh.preferences || {}), [player.id]: complete.map((r) => ({ nomineeId: r.nomineeId, reason: r.reason.trim() })) } };
    });
    setSaved(true);
  };

  const hasAnyComplete = ranks.some((r) => r.nomineeId && r.reason.trim());

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 12, letterSpacing: 6, textTransform: "uppercase", color: "#ff2d95", marginBottom: 8 }}>⚖️</div>
        <h2 style={{ color: "#f5f0ff", fontFamily: "'Orbitron', 'Segoe UI', sans-serif", marginBottom: 4 }}>Rank Your Preferences</h2>
        <p style={{ color: "#a68fd6", fontSize: 13 }}>
          You finished #{myEntry.place} — {ORDINALS[myEntry.place - 1] || `#${myEntry.place}`} in line to nominate. Rank your top {mySlots} choices now so the game can nominate your best still-available pick the instant it's your turn.
        </p>
      </div>

      <Card style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Live status</div>
        <NominatorStatusList nominatorOrder={fates.nominatorOrder} nominations={fates.nominations} nominationReasons={fates.nominationReasons} byId={byId} highlightId={player.id} />
      </Card>

      {ranks.map((r, i) => (
        <Card key={i} style={{ marginBottom: 12 }}>
          <label style={{ display: "block", fontSize: 11, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
            Your {ORDINALS[i] || `#${i + 1}`} choice{i > 0 ? " (if your earlier picks are taken)" : ""}
          </label>
          <select
            value={r.nomineeId}
            onChange={(e) => setRank(i, { nomineeId: e.target.value })}
            style={{ width: "100%", background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 8, padding: "10px 12px", color: "#f5f0ff", fontSize: 13, marginBottom: 8, boxSizing: "border-box" }}
          >
            <option value="">Choose someone...</option>
            {candidatesFor(i).map((p) => (
              <option key={p.id} value={p.id}>{byId[p.id]}</option>
            ))}
          </select>
          <textarea
            value={r.reason}
            onChange={(e) => setRank(i, { reason: e.target.value })}
            maxLength={280}
            rows={2}
            placeholder="Why, if it comes to this pick..."
            style={{ width: "100%", background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 8, padding: "10px 12px", color: "#f5f0ff", fontSize: 13, fontFamily: "'Orbitron', 'Segoe UI', sans-serif", resize: "vertical", boxSizing: "border-box" }}
          />
        </Card>
      ))}

      <Btn onClick={save} disabled={!hasAnyComplete} style={{ width: "100%" }}>
        {saved ? "✓ Preferences Saved" : "Save Preferences"}
      </Btn>
      <p style={{ color: "#6b4f99", fontSize: 11, marginTop: 8, textAlign: "center", fontStyle: "italic" }}>
        You can keep editing this until it's actually your turn.
      </p>
    </div>
  );
}
