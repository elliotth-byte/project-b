import { useState, useEffect } from "react";
import { Btn, Card, Badge, DurationInput } from "./ui";
import { storageSet, storageUpdate, subscribeGameState } from "../lib/gameStorage";
import { KEY_CHALLENGE, KEY_ROUND } from "../lib/gameState";
import { placementsComplete } from "../lib/challengeLogic";
import { GAME_REGISTRY, gameConfigWithDefaults } from "../lib/challengeGames";
import { subscribeScores, scoresToPlacements, resetPlayerAttempt } from "../lib/challengeScores";
import { subscribeReentry, getReentry } from "../lib/reentryData";
import { REENTRY_STATUS } from "../lib/reentryLogic";
import { formatDurationHours } from "../lib/fatesLogic";
import { DEFAULT_PARTICIPATION, computeParticipants } from "../lib/challengeParticipants";
import { initPlinkoBracket, subscribePlinkoBracket } from "../lib/games/plinkoBracketData";
import { initPit } from "../lib/games/pitData";
import { initMasquerade } from "../lib/games/masqueradeData";
import { initCloseToTwenty } from "../lib/games/closeToTwentyData";
import { initTorched } from "../lib/games/torchedData";
import { initChains } from "../lib/games/chainsData";
import ParticipantPicker from "./ParticipantPicker";
import CopyMessage from "./CopyMessage";
import { requestAdvance } from "../lib/advanceNow";

const MAZE_TYPES = ["maze2d", "mazeinvisible", "mazetrivia", "labyrinth"]; // all four share the same host-configurable size control

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
  const [durationSec, setDurationSec] = useState(settings?.challengeDurationSec || 900);
  const [mazeSize, setMazeSize] = useState(GAME_REGISTRY.maze2d.config.size);
  const [busy, setBusy] = useState(false);
  const [plinkoBracket, setPlinkoBracket] = useState(null);
  const [resettingId, setResettingId] = useState(null);

  const resetAttempt = async (playerId, playerName) => {
    if (!confirm(`Reset ${playerName}'s attempt at this challenge? Their score and any in-progress clock are cleared — they get a completely fresh run next time they open this challenge. Takes effect the next time their screen reloads, not necessarily instantly if they're mid-game right now.`)) return;
    setResettingId(playerId);
    const res = await resetPlayerAttempt(gameId, round.round, playerId);
    setResettingId(null);
    if (!res.ok) alert("Couldn't reset that attempt — try again.");
  };

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
    if (!round?.round) return;
    const unsubscribe = subscribePlinkoBracket(gameId, round.round, setPlinkoBracket);
    return unsubscribe;
  }, [gameId, round?.round]);

  useEffect(() => {
    const unsubscribe = subscribeReentry(gameId, setReentry);
    return unsubscribe;
  }, [gameId]);

  const approvedAlive = players.filter((p) => p.approved && p.alive);
  // A player barred from THIS round's Battle (see lib/roundEngine.js's
  // autoNominateTimedOutNominators — the consequence for any of the
  // three Fates nominators missing their own nomination within the
  // ceremony's configured time limit) is excluded from the participant pool
  // entirely, same as if they'd never been alive-and-approved in the
  // first place. battle_ban_round naturally stops applying after this
  // round passes — a later round's number will never match it again.
  const eligibleForBattle = approvedAlive.filter((p) => p.battle_ban_round !== round?.round);
  const battleBannedPlayers = approvedAlive.filter((p) => p.battle_ban_round === round?.round);
  const alivePicker = eligibleForBattle.map((p) => ({ id: p.id, name: p.display_name }));

  // Every exiled player still eligible (hasn't used their one shot yet)
  // gets to opt in or out of THIS specific challenge, deliberately, from
  // their own screen — see components/ChallengePlayer.jsx and
  // lib/reentryData.js's setReentryDecision. Nothing for the host to pick
  // here; this is just who's currently eligible to decide.
  const pendingReentrants = reentry.filter((r) => r.status === REENTRY_STATUS.PENDING);

  const pickGameType = (type) => {
    setGameType(type);
    setDurationSec(GAME_REGISTRY[type].defaultDurationSec);
    if (MAZE_TYPES.includes(type)) setMazeSize(GAME_REGISTRY[type].config.size);
  };

  const startChallenge = async () => {
    setBusy(true);
    const { participants } = computeParticipants(config, { alive: alivePicker });
    const participantIds = participants.map((p) => p.id);
    // Read fresh rather than trusting the subscribed `reentry` state above —
    // right after an Exile Vote resolves, a host clicking Start Challenge
    // quickly could otherwise snapshot a beat-behind list and permanently
    // lock a just-exiled player out of opting into this specific
    // challenge. Snapshotted (not recomputed later) so someone exiled
    // mid-challenge doesn't suddenly become eligible to opt into a
    // challenge that's already running.
    const freshReentry = await getReentry(gameId);
    const reentryEligibleIds = freshReentry.filter((r) => r.status === REENTRY_STATUS.PENDING).map((r) => r.playerId);
    const now = Date.now();
    // Masquerade, Torched, and Chains all always run to their natural
    // conclusion (last player standing for the first two; everyone
    // locked in for Chains — see lib/games/masqueradeData.js,
    // lib/games/torchedData.js, lib/games/chainsData.js) rather than
    // being cut off by a fixed duration partway through, regardless of
    // the season's infiniteTime setting — a turn-based elimination game
    // or a lock-in-gated reveal forced to stop mid-way (possibly even
    // before it's really begun) has no clean resolution the way a
    // scored game does.
    const endsAt = (settings?.infiniteTime || gameType === "masquerade" || gameType === "torched" || gameType === "chains") ? null : now + durationSec * 1000;
    const configOverrides = MAZE_TYPES.includes(gameType) ? { size: mazeSize } : undefined;
    await storageSet(gameId, KEY_CHALLENGE, {
      round: round.round, active: true, startedAt: now, endsAt,
      participantIds, reentryEligibleIds, reentryDecisions: {}, reentryAttemptIds: [], placements: [], finalized: false,
      gameType, gameConfig: gameConfigWithDefaults(gameType, configOverrides),
    });
    if (gameType === "plinko") {
      await initPlinkoBracket(gameId, round.round, participants, now);
    }
    if (gameType === "pit") {
      await initPit(gameId, round.round, participants, now);
    }
    if (gameType === "masquerade") {
      await initMasquerade(gameId, round.round, participants, now);
    }
    if (gameType === "closeto20") {
      await initCloseToTwenty(gameId, round.round, participants, now);
    }
    if (gameType === "torched") {
      await initTorched(gameId, round.round, participants, now);
    }
    if (gameType === "chains") {
      await initChains(gameId, round.round, participants);
    }
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
    if (isDigital && (inProgressParticipants.length > 0 || notStartedParticipants.length > 0)) {
      const stillGoing = [...inProgressParticipants, ...notStartedParticipants].map((p) => p.display_name);
      const verb = stillGoing.length > 1 ? "haven't" : "hasn't";
      if (!confirm(`${stillGoing.join(", ")} ${verb} finished yet — ending now ranks them last. Continue?`)) return;
    }
    setBusy(true);
    const result = await requestAdvance(gameId, true);
    setBusy(false);
    if (result.error) alert("Couldn't finish the challenge: " + result.error);
  };

  if (round?.phase !== "challenge") {
    return <Card><p style={{ color: "#6b4f99", fontStyle: "italic" }}>Not in the Battle phase right now.</p></Card>;
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
        <h3 style={{ color: "#f5f0ff", margin: "0 0 8px", fontSize: 15, fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}>⚔️ Battle — Setup</h3>
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

        {MAZE_TYPES.includes(gameType) && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: "#a68fd6" }}>Maze size:</label>
            <input type="number" min={5} max={31} step={2} value={mazeSize}
              onChange={(e) => setMazeSize(Math.max(5, Math.min(31, Number(e.target.value) || 11)))}
              style={{ width: 70, background: "#0d0618", border: "1px solid #3d1f5c", borderRadius: 6, padding: "6px 10px", color: "#f5f0ff", fontSize: 13 }} />
            <span style={{ fontSize: 12, color: "#a68fd6" }}>cells (odd numbers work best)</span>
          </div>
        )}

        <ParticipantPicker alive={alivePicker} value={config} onChange={setConfig} />

        {battleBannedPlayers.length > 0 && (
          <div style={{ background: "rgba(255,56,96,0.08)", border: "1px solid rgba(255,56,96,0.3)", borderRadius: 8, padding: 10, marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: "#ff3860", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
              🚫 Barred from this battle
            </div>
            <p style={{ fontSize: 11, color: "#a68fd6", margin: 0, fontStyle: "italic" }}>
              {battleBannedPlayers.map((p) => p.display_name).join(", ")} — missed their {settings?.fatesDurationSec ? formatDurationHours(settings.fatesDurationSec) : "Fates"} nomination window last round, so the game auto-nominated on their behalf and barred them from competing this round as the consequence.
            </p>
          </div>
        )}

        {pendingReentrants.length > 0 && (
          <div style={{ background: "#0d0618", borderRadius: 8, padding: 10, marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
              Exiled players eligible to opt in
            </div>
            <p style={{ fontSize: 11, color: "#6b4f99", margin: "0 0 8px", fontStyle: "italic" }}>
              Each gets exactly one re-entry attempt, ever. Once this challenge starts, they'll each choose — deliberately, from
              their own screen — whether to compete in THIS one. Not deciding by the time everyone else finishes counts as sitting
              it out (costs them nothing); opting in and not finishing 1st uses up their one shot for good.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {pendingReentrants.map((r) => (
                <span key={r.playerId} style={{
                  fontSize: 11, padding: "4px 10px", borderRadius: 12,
                  background: "rgba(255,56,96,0.12)", border: "1px solid #ff3860", color: "#ff3860",
                }}>{r.name}</span>
              ))}
            </div>
          </div>
        )}

        {settings?.infiniteTime ? (
          <p style={{ color: "#ff2d95", fontSize: 12, margin: "0 0 12px" }}>∞ Infinite time is on — this battle runs until you end it. (Change this in Admin → Round Lengths.)</p>
        ) : gameType === "masquerade" ? (
          <p style={{ color: "#ff2d95", fontSize: 12, margin: "0 0 12px" }}>∞ Murder at the Masquerade always runs until there's a last player standing — no duration to set.</p>
        ) : gameType === "torched" ? (
          <p style={{ color: "#ff2d95", fontSize: 12, margin: "0 0 12px" }}>∞ Torched always runs until there's a last marker standing — no duration to set.</p>
        ) : gameType === "chains" ? (
          <p style={{ color: "#ff2d95", fontSize: 12, margin: "0 0 12px" }}>∞ Chains always runs until every player has locked in — no duration to set.</p>
        ) : (
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
            <label style={{ fontSize: 12, color: "#a68fd6" }}>Duration:</label>
            <DurationInput valueSec={durationSec} onChange={setDurationSec} />
          </div>
        )}

        <Btn onClick={startChallenge} disabled={busy}>{busy ? "Starting..." : "Start Battle"}</Btn>
      </Card>
    );
  }

  const registryEntry = GAME_REGISTRY[challenge.gameType || "manual"];
  const rankDirection = registryEntry?.rank === "time-asc" ? "time-asc" : "score-desc";

  // The leaderboard only ever ranks players who have actually FINISHED
  // (a locked, non-forfeited score) — someone who hasn't played yet, or
  // is still mid-game, never gets a placement number or a "#1" badge.
  // Ranking everyone the instant the challenge starts (as if a no-show
  // were simply "last place") is correct for the FINAL result once the
  // timer's genuinely up — see scoresToPlacements — but showing that
  // same logic live, while people (including anyone attempting
  // re-entry) are still actively playing, makes an in-progress challenge
  // look like a decided one. That's misleading and risks the host
  // ending it early on a false impression that it's already over.
  const finishedParticipants = participants.filter((p) => scores[p.id]?.locked && !scores[p.id]?.forfeited);
  const forfeitedParticipants = participants.filter((p) => scores[p.id]?.forfeited);
  const inProgressParticipants = participants.filter((p) => scores[p.id] && !scores[p.id].locked);
  const notStartedParticipants = participants.filter((p) => !scores[p.id]);

  const finishedRanking = isDigital
    ? scoresToPlacements(scores, finishedParticipants.map((p) => ({ playerId: p.id, name: p.display_name })), rankDirection)
    : [];

  const scoreLabel = (s) => {
    if (!s) return null;
    if (s.foundCount != null) return `${s.foundCount}/${challenge.gameConfig?.differences || 5} found`;
    return rankDirection === "time-asc" ? `${(s.value / 1000).toFixed(2)}s` : s.value;
  };

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

      {(() => {
        // Union of the challenge's original snapshot and anyone
        // currently PENDING — covers a player who opted in despite not
        // being captured in the snapshot (see lib/reentryData.js's
        // setReentryDecision, which no longer requires snapshot
        // membership), so the host's list here can't miss someone who's
        // actually deciding or has decided.
        const liveEligibleIds = new Set([
          ...(challenge.reentryEligibleIds || []),
          ...reentry.filter((r) => r.status === REENTRY_STATUS.PENDING || challenge.reentryDecisions?.[r.playerId]).map((r) => r.playerId),
        ]);
        if (liveEligibleIds.size === 0) return null;
        return (
          <div style={{ background: "#0d0618", borderRadius: 8, padding: 10, marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
              🔥 Re-entry — deciding whether to compete
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {[...liveEligibleIds].map((id) => {
                const name = players.find((p) => p.id === id)?.display_name || "?";
                const decision = challenge.reentryDecisions?.[id];
                const color = decision === "in" ? "#ff3860" : decision === "out" ? "#6b4f99" : "#a68fd6";
                const label = decision === "in" ? `${name} — opted in` : decision === "out" ? `${name} — sitting out` : `${name} — deciding...`;
                return (
                  <span key={id} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 12, border: `1px solid ${color}`, color, opacity: decision === "out" ? 0.7 : 1 }}>
                    {label}
                  </span>
                );
              })}
            </div>
          </div>
        );
      })()}

      {challenge?.gameType === "plinko" && challenge.active && plinkoBracket && (
        <div style={{ background: "#0d0618", borderRadius: 8, padding: 10, marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
            🔴 Duel Bracket — {plinkoBracket.eliminationCount} eliminated, {plinkoBracket.pool.length} waiting
          </div>
          <p style={{ fontSize: 12, color: "#f5f0ff", margin: 0 }}>
            {plinkoBracket.current
              ? `Dueling now: ${players.find((p) => p.id === plinkoBracket.current[0])?.display_name || "?"} vs ${players.find((p) => p.id === plinkoBracket.current[1])?.display_name || "?"}`
              : plinkoBracket.champion
                ? `${players.find((p) => p.id === plinkoBracket.champion)?.display_name || "?"} is picking their next challenger...`
                : "Setting up..."}
          </p>
        </div>
      )}

      {isDigital ? (
        <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
          {finishedRanking.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                Finished ({finishedRanking.length}/{participants.length})
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                {finishedRanking.map((r) => {
                  const isReentrant = challenge.reentryAttemptIds?.includes(r.playerId);
                  return (
                    <div key={r.playerId} style={{ display: "flex", gap: 8, alignItems: "center", background: "#0d0618", borderRadius: 6, padding: "6px 10px" }}>
                      <Badge color={r.place === 1 ? "#ff2d95" : "#a68fd6"}>#{r.place}</Badge>
                      <span style={{ flex: 1, fontSize: 13, color: "#f5f0ff" }}>
                        {r.name}{isReentrant && <span style={{ color: "#ff3860", fontSize: 11 }}> (re-entry attempt)</span>}
                      </span>
                      <span style={{ fontSize: 12, color: "#a68fd6" }}>{scoreLabel(scores[r.playerId])} ✓</span>
                      <button
                        onClick={() => resetAttempt(r.playerId, r.name)}
                        disabled={resettingId === r.playerId}
                        style={{ background: "none", border: "1px solid #3d1f5c", borderRadius: 6, color: "#a68fd6", fontSize: 10, padding: "3px 8px", cursor: "pointer" }}
                      >
                        {resettingId === r.playerId ? "..." : "↺ Reset"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {(inProgressParticipants.length > 0 || notStartedParticipants.length > 0 || forfeitedParticipants.length > 0) && (
            <div>
              <div style={{ fontSize: 11, color: "#a68fd6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                Still playing — not ranked yet
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                {inProgressParticipants.map((p) => {
                  const isReentrant = challenge.reentryAttemptIds?.includes(p.id);
                  return (
                    <div key={p.id} style={{ display: "flex", gap: 8, alignItems: "center", background: "#0d0618", borderRadius: 6, padding: "6px 10px", opacity: 0.85 }}>
                      <span style={{ flex: 1, fontSize: 13, color: "#f5f0ff" }}>
                        {p.display_name}{isReentrant && <span style={{ color: "#ff3860", fontSize: 11 }}> (re-entry attempt)</span>}
                      </span>
                      <span style={{ fontSize: 12, color: "#a68fd6" }}>{scoreLabel(scores[p.id])} — playing...</span>
                      <button
                        onClick={() => resetAttempt(p.id, p.display_name)}
                        disabled={resettingId === p.id}
                        style={{ background: "none", border: "1px solid #3d1f5c", borderRadius: 6, color: "#a68fd6", fontSize: 10, padding: "3px 8px", cursor: "pointer" }}
                      >
                        {resettingId === p.id ? "..." : "↺ Reset"}
                      </button>
                    </div>
                  );
                })}
                {notStartedParticipants.map((p) => {
                  const isReentrant = challenge.reentryAttemptIds?.includes(p.id);
                  return (
                    <div key={p.id} style={{ display: "flex", gap: 8, alignItems: "center", background: "#0d0618", borderRadius: 6, padding: "6px 10px", opacity: 0.6 }}>
                      <span style={{ flex: 1, fontSize: 13, color: "#f5f0ff" }}>
                        {p.display_name}{isReentrant && <span style={{ color: "#ff3860", fontSize: 11 }}> (re-entry attempt)</span>}
                      </span>
                      <span style={{ fontSize: 12, color: "#6b4f99", fontStyle: "italic" }}>hasn't started</span>
                    </div>
                  );
                })}
                {forfeitedParticipants.map((p) => {
                  const isReentrant = challenge.reentryAttemptIds?.includes(p.id);
                  return (
                    <div key={p.id} style={{ display: "flex", gap: 8, alignItems: "center", background: "#0d0618", borderRadius: 6, padding: "6px 10px", opacity: 0.7 }}>
                      <span style={{ flex: 1, fontSize: 13, color: "#f5f0ff" }}>
                        {p.display_name}{isReentrant && <span style={{ color: "#ff3860", fontSize: 11 }}> (re-entry attempt)</span>}
                      </span>
                      <span style={{ fontSize: 12, color: "#ff3860" }}>🏳️ Forfeited</span>
                      <button
                        onClick={() => resetAttempt(p.id, p.display_name)}
                        disabled={resettingId === p.id}
                        style={{ background: "none", border: "1px solid #3d1f5c", borderRadius: 6, color: "#a68fd6", fontSize: 10, padding: "3px 8px", cursor: "pointer" }}
                      >
                        {resettingId === p.id ? "..." : "↺ Reset"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
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
        <Btn small onClick={finishNow} disabled={!complete || busy}>{busy ? "Working..." : "Finish Battle Now"}</Btn>
      </div>
      {!isDigital && !complete && <p style={{ color: "#6b4f99", fontSize: 11, fontStyle: "italic", margin: "0 0 12px" }}>Every competitor needs a distinct place (1, 2, 3, ...) before this can finish.</p>}

      <CopyMessage icon={registryEntry?.icon || "⚔️"} label="Battle Announcement"
        text={`From Achilles to Odysseus, legends are forged on the battlefield. Today, you go to battle. Will you become a legend in your own right?\n\n${registryEntry?.icon || "⚔️"} ${registryEntry?.label} underway! ${participants.length} competing. 1st place wins immunity${round.finalFour ? " — this is the FINAL FOUR, everyone else is automatically nominated." : "."}`} />
    </Card>
  );
}
