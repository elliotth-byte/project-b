import { useState, useEffect } from "react";
import { Btn, Card, Badge } from "./ui";
import { storageSet, storageUpdate, subscribeGameState } from "../lib/gameStorage";
import { KEY_CHALLENGE, KEY_ROUND } from "../lib/gameState";
import { placementsComplete } from "../lib/challengeLogic";
import { subscribeReentry, markCompeting } from "../lib/reentryData";
import { REENTRY_STATUS } from "../lib/reentryLogic";
import { DEFAULT_PARTICIPATION, computeParticipants } from "../lib/challengeParticipants";
import ParticipantPicker from "./ParticipantPicker";
import PostToGroupMe from "./PostToGroupMe";
import { requestAdvance } from "../lib/advanceNow";

// ─── Challenge: Host Control ───
// Setup (pick who's competing + duration) -> live results entry -> the
// round engine (lib/roundEngine.js) takes it from here once every
// participant has a distinct place and either the timer runs out or the
// host clicks "Finish Challenge Now".
export default function ChallengeHost({ gameId, players, round, settings }) {
  const [challenge, setChallenge] = useState(null);
  const [reentry, setReentry] = useState([]);
  const [config, setConfig] = useState(DEFAULT_PARTICIPATION);
  const [durationMin, setDurationMin] = useState(Math.round((settings?.challengeDurationSec || 900) / 60));
  const [selectedReentrant, setSelectedReentrant] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeGameState(gameId, KEY_CHALLENGE, setChallenge);
    return unsubscribe;
  }, [gameId, round?.round]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const unsubscribe = subscribeReentry(gameId, setReentry);
    return unsubscribe;
  }, [gameId]);

  const approvedAlive = players.filter((p) => p.approved && p.alive);
  const allApproved = players.filter((p) => p.approved);
  const alivePicker = approvedAlive.map((p) => ({ id: p.id, name: p.display_name }));
  const allPicker = allApproved.map((p) => ({ id: p.id, name: p.display_name }));

  const requesters = reentry.filter((r) => r.status === REENTRY_STATUS.PENDING && r.wantsToCompete === round?.round);

  const startChallenge = async () => {
    setBusy(true);
    const { participants } = computeParticipants(config, { alive: alivePicker, allPlayers: allPicker });
    let participantIds = participants.map((p) => p.id);
    let reentryAttemptId = null;
    if (selectedReentrant) {
      reentryAttemptId = selectedReentrant;
      await markCompeting(gameId, selectedReentrant);
      if (!participantIds.includes(selectedReentrant)) participantIds = [...participantIds, selectedReentrant];
    }
    const now = Date.now();
    const endsAt = now + durationMin * 60 * 1000;
    await storageSet(gameId, KEY_CHALLENGE, {
      round: round.round, active: true, startedAt: now, endsAt,
      participantIds, reentryAttemptId, placements: [], finalized: false,
    });
    await storageUpdate(gameId, KEY_ROUND, (fresh) => ({ ...(fresh || {}), phaseStartedAt: now, phaseEndsAt: endsAt }));
    setBusy(false);
  };

  const setPlace = async (playerId, place) => {
    await storageUpdate(gameId, KEY_CHALLENGE, (fresh) => {
      if (!fresh) return null;
      const list = (fresh.placements || []).filter((p) => p.playerId !== playerId);
      if (place) {
        const name = players.find((p) => p.id === playerId)?.display_name || "?";
        list.push({ playerId, name, place: Number(place) });
      }
      fresh.placements = list;
      return fresh;
    });
  };

  const clearResults = async () => {
    await storageUpdate(gameId, KEY_CHALLENGE, (fresh) => {
      if (!fresh) return null;
      fresh.placements = [];
      return fresh;
    });
  };

  const finishNow = async () => {
    setBusy(true);
    await requestAdvance(gameId, true);
    setBusy(false);
  };

  if (round?.phase !== "challenge") {
    return <Card><p style={{ color: "#706050", fontStyle: "italic" }}>Not in the Challenge phase right now.</p></Card>;
  }

  const participants = challenge?.participantIds
    ? players.filter((p) => challenge.participantIds.includes(p.id))
    : [];
  const complete = challenge ? placementsComplete(challenge.placements, participants.length) : false;

  if (!challenge?.active) {
    return (
      <Card>
        <h3 style={{ color: "#f0e6d3", margin: "0 0 8px", fontSize: 15, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>⚔️ Challenge — Setup</h3>
        <p style={{ color: "#a09080", fontSize: 12, margin: "0 0 12px", fontStyle: "italic" }}>
          Run the actual challenge in person (or however you like) — this just tracks who's competing, how long they have, and who finished where.
        </p>

        <ParticipantPicker alive={alivePicker} allPlayers={allPicker} value={config} onChange={setConfig} />

        {requesters.length > 0 && (
          <div style={{ background: "#0a1020", borderRadius: 8, padding: 10, marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: "#a09080", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
              Exiled players requesting re-entry this round
            </div>
            <p style={{ fontSize: 11, color: "#706050", margin: "0 0 8px", fontStyle: "italic" }}>
              Each exiled player gets exactly one re-entry attempt, ever. Pick at most one to compete this round — if they finish 1st, they return AND this round becomes a double elimination.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              <button onClick={() => setSelectedReentrant("")} style={{
                fontSize: 11, padding: "4px 10px", borderRadius: 12, cursor: "pointer",
                background: !selectedReentrant ? "rgba(201,168,76,0.15)" : "transparent",
                border: `1px solid ${!selectedReentrant ? "#c9a84c" : "#253550"}`,
                color: !selectedReentrant ? "#c9a84c" : "#706050",
              }}>None this round</button>
              {requesters.map((r) => (
                <button key={r.playerId} onClick={() => setSelectedReentrant(r.playerId)} style={{
                  fontSize: 11, padding: "4px 10px", borderRadius: 12, cursor: "pointer",
                  background: selectedReentrant === r.playerId ? "rgba(196,92,60,0.15)" : "transparent",
                  border: `1px solid ${selectedReentrant === r.playerId ? "#c45c3c" : "#253550"}`,
                  color: selectedReentrant === r.playerId ? "#c45c3c" : "#a09080",
                }}>{r.name}</button>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: "#a09080" }}>Duration:</label>
          <input type="number" min={1} value={durationMin} onChange={(e) => setDurationMin(Number(e.target.value) || 1)}
            style={{ width: 70, background: "#0a1020", border: "1px solid #253550", borderRadius: 6, padding: "6px 10px", color: "#f0e6d3", fontSize: 13 }} />
          <span style={{ fontSize: 12, color: "#a09080" }}>minutes</span>
        </div>

        <Btn onClick={startChallenge} disabled={busy}>{busy ? "Starting..." : "Start Challenge"}</Btn>
      </Card>
    );
  }

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ color: "#f0e6d3", margin: 0, fontSize: 15, fontFamily: "'Palatino Linotype', Palatino, Georgia, serif" }}>⚔️ Challenge — In Progress</h3>
        {challenge.reentryAttemptId && <Badge color="#c45c3c">Re-entry attempt in progress</Badge>}
      </div>
      <p style={{ color: "#706050", fontSize: 12, margin: "0 0 12px", fontStyle: "italic" }}>
        Enter each competitor's finishing place as the challenge wraps up. 1st place wins immunity{round.finalFour ? " — everyone else is automatically nominated (Final Four)." : "; the top 3 each get to make a nomination at the Fates Ceremony."}
      </p>

      <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
        {participants.map((p) => {
          const current = (challenge.placements || []).find((pl) => pl.playerId === p.id);
          const isReentrant = challenge.reentryAttemptId === p.id;
          return (
            <div key={p.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ flex: 1, fontSize: 13, color: "#f0e6d3" }}>
                {p.display_name}{isReentrant && <span style={{ color: "#c45c3c", fontSize: 11 }}> (re-entry attempt)</span>}
              </span>
              <input type="number" min={1} max={participants.length} value={current?.place || ""}
                onChange={(e) => setPlace(p.id, e.target.value)}
                placeholder="place"
                style={{ width: 70, background: "#0a1020", border: "1px solid #253550", borderRadius: 6, padding: "5px 8px", color: "#f0e6d3", fontSize: 13, textAlign: "center" }} />
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <Btn small variant="ghost" onClick={clearResults}>Clear Results</Btn>
        <Btn small onClick={finishNow} disabled={!complete || busy}>{busy ? "Working..." : "Finish Challenge Now"}</Btn>
      </div>
      {!complete && <p style={{ color: "#706050", fontSize: 11, fontStyle: "italic", margin: "0 0 12px" }}>Every competitor needs a distinct place (1, 2, 3, ...) before this can finish.</p>}

      <PostToGroupMe gameId={gameId} icon="⚔️" label="Challenge Announcement"
        text={`⚔️ Challenge underway! ${participants.length} competing. 1st place wins immunity${round.finalFour ? " — this is the FINAL FOUR, everyone else is automatically nominated." : "."}`} />
    </Card>
  );
}
