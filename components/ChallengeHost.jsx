import { useState, useEffect } from "react";
import { Btn, Card, Badge } from "./ui";
import { storageSet, storageUpdate, subscribeGameState } from "../lib/gameStorage";
import { KEY_CHALLENGE, KEY_ROUND } from "../lib/gameState";
import { placementsComplete } from "../lib/challengeLogic";
import { GAME_REGISTRY, gameConfigWithDefaults } from "../lib/challengeGames";
import { subscribeScores, scoresToPlacements } from "../lib/challengeScores";
import { subscribeReentry, markCompeting } from "../lib/reentryData";
import { REENTRY_STATUS } from "../lib/reentryLogic";
import { DEFAULT_PARTICIPATION, computeParticipants } from "../lib/challengeParticipants";
import ParticipantPicker from "./ParticipantPicker";
import PostToGroupMe from "./PostToGroupMe";
import { requestAdvance } from "../lib/advanceNow";

// ─── Challenge: Host Control ───
// Setup (pick a game + who's competing + duration) -> either the host
// manually enters results ("Manual / In-Person" mode) or, for any of the
// 10 built-in mini-games, players play on their own screens and the
// round engine (lib/roundEngine.js) derives placements from their scores
// automatically once the timer's up.
export default function ChallengeHost({ gameId, players, round, settings }) {
  const [challenge, setChallenge] = useState(null);
  const [scores, setScores] = useState({});
  const [reentry, setReentry] = useState([]);
  const [config, setConfig] = useState(DEFAULT_PARTICIPATION);
  const [gameType, setGameType] = useState("manual");
  const [durationMin, setDurationMin] = useState(Math.round((settings?.challengeDurationSec || 900) / 60));
  const [mazeSize, setMazeSize] = useState(GAME_REGISTRY.maze2d.config.size);
  const [selectedReentrants, setSelectedReentrants] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeGameState(gameId, KEY_CHALLENGE, setChallenge);
    return unsubscribe;
  }, [gameId, round?.round]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!round?.round) return;
    const unsubscribe = subscribeScores(gameId, round.round, setScores);
    return unsubscribe;
  }, [gameId, round?.round]);

  useEffect(() => {
    const unsubscribe = subscribeReentry(gameId, setReentry);
    return unsubscribe;
  }, [gameId]);

  const approvedAlive = players.filter((p) => p.approved && p.alive);
  const allApproved = players.filter((p) => p.approved);
  const alivePicker = approvedAlive.map((p) => ({ id: p.id, name: p.display_name }));
  const allPicker = allApproved.map((p) => ({ id: p.id, name: p.display_name }));

  const requesters = reentry.filter((r) => r.status === REENTRY_STATUS.PENDING && r.wantsToCompete === round?.round);

  const pickGameType = (type) => {
    setGameType(type);
    setDurationMin(Math.round(GAME_REGISTRY[type].defaultDurationSec / 60));
  };

  const startChallenge = async () => {
    setBusy(true);
    const { participants } = computeParticipants(config, { alive: alivePicker, allPlayers: allPicker });
    let participantIds = participants.map((p) => p.id);
    const reentryAttemptIds = [...selectedReentrants];
    for (const id of reentryAttemptIds) {
      await markCompeting(gameId, id);
      if (!participantIds.includes(id)) participantIds = [...participantIds, id];
    }
    const now = Date.now();
    const endsAt = settings?.infiniteTime ? null : now + durationMin * 60 * 1000;
    const configOverrides = gameType === "maze2d" ? { size: mazeSize } : undefined;
    await storageSet(gameId, KEY_CHALLENGE, {
      round: round.round, active: true, startedAt: now, endsAt,
      participantIds, reentryAttemptIds, placements: [], finalized: false,
      gameType, gameConfig: gameConfigWithDefaults(gameType, configOverrides),
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
    return <Card><p style={{ color: "#6b4f99", fontStyle: "italic" }}>Not in the Challenge phase right now.</p></Card>;
  }

  const participants = challenge?.participantIds
    ? players.filter((p) => challenge.participantIds.includes(p.id))
    : [];
  const isDigital = challenge?.gameType && challenge.gameType !== "manual";
  const complete = challenge
    ? (isDigital ? true : placementsComplete(challenge.placements, participants.length))
    : false;

  if (!challenge?.active) {
    return (
      <Card>
        <h3 style={{ color: "#f5f0ff", margin: "0 0 8px", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>⚔️ Challenge — Setup</h3>
        <p style={{ color: "#a68fd6", fontSize: 12, margin: "0 0 12px", fontStyle: "italic" }}>
          Pick a challenge. Digital ones play out live on each player's own screen and score themselves; Manual / In-Person just tracks who's competing and how long they have while you run the challenge yourselves.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 6, marginBottom: 10 }}>
          {Object.entries(GAME_REGISTRY).map(([key, g]) => (
            <button key={key} onClick={() => pickGameType(key)} style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
              padding: "10px 8px", borderRadius: 8, cursor: "pointer",
              background: gameType === key ? "rgba(255,45,149,0.15)" : "#0d0618",
              border: `1px solid ${gameType === key ? "#ff2d95" : "#3d1f5c"}`,
              color: gameType === key ? "#ff2d95" : "#a68fd6",
            }}>
              <span style={{ fontSize: 20 }}>{g.icon}</span>
              <span style={{ fontSize: 11, fontWeight: 600, textAlign: "center" }}>{g.label}</span>
            </button>
          ))}
        </div>
        <p style={{ fontSize: 11.5, color: "#6b4f99", margin: "0 0 14px", fontStyle: "italic" }}>{GAME_REGISTRY[gameType].blurb}</p>

        {gameType === "maze2d" && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: "#a68fd6" }}>Maze size:</label>
            <input type="number" min={5} max={31} step={2} value={mazeSize}
              onChange={(e) => setMazeSize(Math.max(5, Math.min(31, Number(e.target.value) || 11)))}
              style={{ width: 70, background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 6, padding: "6px 10px", color: "#f5f0ff", fontSize: 13 }} />
            <span style={{ fontSize: 12, color: "#a68fd6" }}>cells (odd numbers work best)</span>
          </div>
        )}

        <ParticipantPicker alive={alivePicker} allPlayers={allPicker} value={config} onChange={setConfig} />

        {requesters.length > 0 && (
          <div style={{ background: "#0d0618", borderRadius: 8, padding: 10, marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
              Exiled players requesting re-entry this round
            </div>
            <p style={{ fontSize: 11, color: "#6b4f99", margin: "0 0 8px", fontStyle: "italic" }}>
              Each exiled player gets exactly one re-entry attempt, ever. Any number of them can try in the SAME challenge — but only whoever actually finishes 1st overall returns (and makes this round a double elimination); everyone else who tried and didn't get 1st uses up their one shot for good.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {requesters.map((r) => {
                const selected = selectedReentrants.includes(r.playerId);
                return (
                  <button key={r.playerId} onClick={() => setSelectedReentrants((prev) => selected ? prev.filter((id) => id !== r.playerId) : [...prev, r.playerId])} style={{
                    fontSize: 11, padding: "4px 10px", borderRadius: 12, cursor: "pointer",
                    background: selected ? "rgba(255,56,96,0.15)" : "transparent",
                    border: `1px solid ${selected ? "#ff3860" : "#3d1f5c"}`,
                    color: selected ? "#ff3860" : "#a68fd6",
                  }}>{selected ? "✓ " : ""}{r.name}</button>
                );
              })}
            </div>
          </div>
        )}

        {settings?.infiniteTime ? (
          <p style={{ color: "#ff2d95", fontSize: 12, margin: "0 0 12px" }}>∞ Infinite time is on — this challenge runs until you end it. (Change this in Admin → Round Lengths.)</p>
        ) : (
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: "#a68fd6" }}>Duration:</label>
            <input type="number" min={1} value={durationMin} onChange={(e) => setDurationMin(Number(e.target.value) || 1)}
              style={{ width: 70, background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 6, padding: "6px 10px", color: "#f5f0ff", fontSize: 13 }} />
            <span style={{ fontSize: 12, color: "#a68fd6" }}>minutes</span>
          </div>
        )}

        <Btn onClick={startChallenge} disabled={busy}>{busy ? "Starting..." : "Start Challenge"}</Btn>
      </Card>
    );
  }

  const registryEntry = GAME_REGISTRY[challenge.gameType || "manual"];
  const rankDirection = registryEntry?.rank === "time-asc" ? "time-asc" : "score-desc";
  const liveRanking = isDigital
    ? scoresToPlacements(scores, participants.map((p) => ({ playerId: p.id, name: p.display_name })), rankDirection)
    : [];

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ color: "#f5f0ff", margin: 0, fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>
          {registryEntry?.icon} {registryEntry?.label} — In Progress
        </h3>
        {challenge.reentryAttemptIds?.length > 0 && <Badge color="#ff3860">{challenge.reentryAttemptIds.length} re-entry attempt{challenge.reentryAttemptIds.length > 1 ? "s" : ""} in progress</Badge>}
      </div>
      <p style={{ color: "#6b4f99", fontSize: 12, margin: "0 0 12px", fontStyle: "italic" }}>
        1st place wins immunity{round.finalFour ? " — everyone else is automatically nominated (Final Four)." : "; the top 3 each get to make a nomination at the Fates Ceremony."}
      </p>

      {isDigital ? (
        <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>Live leaderboard</div>
          {liveRanking.map((r) => {
            const s = scores[r.playerId];
            const isReentrant = challenge.reentryAttemptIds?.includes(r.playerId);
            return (
              <div key={r.playerId} style={{ display: "flex", gap: 8, alignItems: "center", background: "#0d0618", borderRadius: 6, padding: "6px 10px" }}>
                <Badge color={r.place === 1 ? "#ff2d95" : "#a68fd6"}>#{r.place}</Badge>
                <span style={{ flex: 1, fontSize: 13, color: "#f5f0ff" }}>
                  {r.name}{isReentrant && <span style={{ color: "#ff3860", fontSize: 11 }}> (re-entry attempt)</span>}
                </span>
                <span style={{ fontSize: 12, color: s?.forfeited ? "#ff3860" : "#a68fd6" }}>
                  {s?.forfeited
                    ? "🏳️ Forfeited"
                    : s
                      ? (s.foundCount != null
                          ? `${s.foundCount}/${challenge.gameConfig?.differences || 5} found`
                          : rankDirection === "time-asc" ? `${(s.value / 1000).toFixed(2)}s` : s.value)
                      : "playing..."}
                  {s?.locked && !s?.forfeited ? " ✓" : ""}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
          {participants.map((p) => {
            const current = (challenge.placements || []).find((pl) => pl.playerId === p.id);
            const isReentrant = challenge.reentryAttemptIds?.includes(p.id);
            const isForfeited = challenge.forfeitedIds?.includes(p.id);
            return (
              <div key={p.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ flex: 1, fontSize: 13, color: "#f5f0ff" }}>
                  {p.display_name}{isReentrant && <span style={{ color: "#ff3860", fontSize: 11 }}> (re-entry attempt)</span>}
                  {isForfeited && <span style={{ color: "#ff3860", fontSize: 11 }}> (forfeited)</span>}
                </span>
                <input type="number" min={1} max={participants.length} value={current?.place || ""}
                  onChange={(e) => setPlace(p.id, e.target.value)}
                  placeholder="place"
                  style={{ width: 70, background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 6, padding: "5px 8px", color: "#f5f0ff", fontSize: 13, textAlign: "center" }} />
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {!isDigital && <Btn small variant="ghost" onClick={clearResults}>Clear Results</Btn>}
        <Btn small onClick={finishNow} disabled={!complete || busy}>{busy ? "Working..." : "Finish Challenge Now"}</Btn>
      </div>
      {!isDigital && !complete && <p style={{ color: "#6b4f99", fontSize: 11, fontStyle: "italic", margin: "0 0 12px" }}>Every competitor needs a distinct place (1, 2, 3, ...) before this can finish.</p>}

      <PostToGroupMe gameId={gameId} icon={registryEntry?.icon || "⚔️"} label="Challenge Announcement"
        text={`${registryEntry?.icon || "⚔️"} ${registryEntry?.label} underway! ${participants.length} competing. 1st place wins immunity${round.finalFour ? " — this is the FINAL FOUR, everyone else is automatically nominated." : "."}`} />
    </Card>
  );
}
