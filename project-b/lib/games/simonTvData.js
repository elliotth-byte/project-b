import { storageSet, storageUpdate, subscribeGameState } from "../gameStorage";

// ─── Simon — Big Screen ───
// A genuinely different mechanic from the existing simon (see
// components/games/SimonPlayer.jsx) — that one gives every player
// their own independently-generated, independently-paced sequence on
// their own phone. This is one shared sequence, generated once and
// grown by the same +1-step-per-round rule, played back on the TV for
// everyone at once (components/bigscreen/SimonTvDisplay.jsx); every
// phone becomes a plain 4-pad input device (components/games/
// SimonTvPlayer.jsx) that only ever accepts taps while the shared
// state says it's time to input. Last player standing wins — this is
// why it's its own game type (simontv) rather than a mode flag on the
// original: the whole "everyone watches together, then everyone
// inputs at once" structure has no equivalent in the per-player
// version at all.
//
// A wrong tap eliminates that player IMMEDIATELY, not at the end of
// the round the way a round genuinely has to wait for everyone in
// Torched (lib/games/torchedData.js) — that's a deliberate difference,
// not an oversight: Torched's simultaneous rounds exist because
// nobody can see anyone else's pending shot before it resolves, so
// there's nothing to react to YET. Simon has no such secrecy — a wrong
// tap is just wrong, immediately, the same honest instant-fail feel
// the original single-player version already has, and there's no
// reason to make everyone wait for a round timer to confirm what's
// already true.
export const simonTvKey = (round) => `pb:simontv:${round}`;

export function subscribeSimonTv(gameId, round, onChange) {
  return subscribeGameState(gameId, simonTvKey(round), onChange);
}

// Same three constants as the original SimonPlayer.jsx uses for
// pacing — kept in exact sync on purpose so the TV plays back at the
// same speed/feel a player already associates with Simon.
export const SIMON_FLASH_MS = 400;
export const SIMON_GAP_MS = 200;
export const SIMON_MIN_STEP_MS = 220;

export function simonStepMs(sequenceLength) {
  const speedFactor = Math.max(0.4, 1 - (sequenceLength - 1) * 0.045);
  return Math.max(SIMON_MIN_STEP_MS, Math.round((SIMON_FLASH_MS + SIMON_GAP_MS) * speedFactor));
}

function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function initSimonTv(gameId, round, participants, seed, db) {
  const set = db?.set || storageSet;
  const rng = mulberry32(seed || Date.now());
  const playerProgress = {};
  participants.forEach((p) => { playerProgress[p.id] = { alive: true, step: 0, thisRoundStatus: "playing" }; });
  await set(gameId, simonTvKey(round), {
    sequence: [Math.floor(rng() * 4)],
    roundNum: 1,
    phase: "playback", // "playback" | "input"
    phaseStartedAt: Date.now(),
    playerProgress,
    eliminatedInRound: {}, // playerId -> roundNum, same tie-aware shape as torchedData.js's own
    winnerId: null,
    rngState: Math.floor(rng() * 1e9),
  });
}

// Called once, from the TV display, the moment its own local playback
// animation timer finishes — see components/bigscreen/SimonTvDisplay.jsx.
// A plain overwrite guarded by phase, not a race-sensitive CAS beyond
// that: only the TV ever calls this, so there's no concurrent-writer
// scenario to defend against the way there genuinely is for player
// taps below.
export async function beginInputPhase(gameId, round) {
  return storageUpdate(gameId, simonTvKey(round), (fresh) => {
    if (!fresh || fresh.phase !== "playback" || fresh.winnerId) return fresh;
    return { ...fresh, phase: "input", phaseStartedAt: Date.now() };
  });
}

export async function submitSimonTap(gameId, round, playerId, padIdx) {
  return storageUpdate(gameId, simonTvKey(round), (fresh) => {
    if (!fresh || fresh.phase !== "input" || fresh.winnerId) return fresh;
    const progress = fresh.playerProgress[playerId];
    if (!progress || !progress.alive || progress.thisRoundStatus !== "playing") return fresh; // not alive, or already resolved this round
    if (padIdx === fresh.sequence[progress.step]) {
      const nextStep = progress.step + 1;
      const finished = nextStep === fresh.sequence.length;
      return {
        ...fresh,
        playerProgress: { ...fresh.playerProgress, [playerId]: { ...progress, step: nextStep, thisRoundStatus: finished ? "correct" : "playing" } },
      };
    }
    return { ...fresh, playerProgress: { ...fresh.playerProgress, [playerId]: { ...progress, thisRoundStatus: "wrong" } } };
  });
}

// Same target-turns-into-a-window approach as every other timed
// shared-state battle in this app (see lib/games/torchedData.js's own
// matching constants and comment) — chosen so a normal-length battle
// still gives a genuinely tappable window per round even as the
// sequence gets long and each round's own window would otherwise keep
// shrinking without a floor.
const SIMON_TARGET_ROUNDS_ESTIMATE = 20;
const SIMON_MIN_INPUT_SEC = 8;
const SIMON_MAX_INPUT_SEC = 30;

export function simonInputWindowMs(challengeDurationSec) {
  const totalSec = challengeDurationSec || 300;
  return Math.max(SIMON_MIN_INPUT_SEC, Math.min(SIMON_MAX_INPUT_SEC, totalSec / SIMON_TARGET_ROUNDS_ESTIMATE)) * 1000;
}

// The actual round resolution — called from the TV display's own poll
// (and mirrored server-side in lib/roundEngine.js's housekeeping, same
// belt-and-suspenders pattern as every other shared timed game here)
// once either everyone still alive has resolved this round (correct or
// wrong) or the round's own input window has run out. Ties for the
// win are handled honestly: if the last two-or-more players standing
// both go wrong in the exact same round, there's no real winner, only
// a shared final elimination round — same "same round means the same
// score" reasoning lib/games/torchedData.js's own placementValue
// documents for its own simultaneous eliminations.
export async function resolveSimonRound(gameId, round, settings, db) {
  const update = db?.update || storageUpdate;
  return update(gameId, simonTvKey(round), (fresh) => {
    if (!fresh || fresh.phase !== "input" || fresh.winnerId) return fresh;

    const aliveIds = Object.entries(fresh.playerProgress).filter(([, p]) => p.alive).map(([id]) => id);
    const everyoneResolved = aliveIds.length > 0 && aliveIds.every((id) => fresh.playerProgress[id].thisRoundStatus !== "playing");
    const timedOut = fresh.phaseStartedAt != null && Date.now() - fresh.phaseStartedAt >= simonInputWindowMs(settings?.challengeDurationSec);
    if (!everyoneResolved && !timedOut) return fresh;

    const nextProgress = { ...fresh.playerProgress };
    const nextEliminated = { ...fresh.eliminatedInRound };
    aliveIds.forEach((id) => {
      const status = fresh.playerProgress[id].thisRoundStatus;
      if (status === "wrong" || status === "playing") { // "playing" here means they simply never finished before the window closed
        nextProgress[id] = { ...nextProgress[id], alive: false };
        nextEliminated[id] = fresh.roundNum;
      }
    });

    const survivors = Object.entries(nextProgress).filter(([, p]) => p.alive).map(([id]) => id);
    if (survivors.length <= 1) {
      return {
        ...fresh,
        playerProgress: nextProgress,
        eliminatedInRound: nextEliminated,
        winnerId: survivors.length === 1 ? survivors[0] : null,
      };
    }

    const rng = mulberry32(fresh.rngState);
    const grownSequence = [...fresh.sequence, Math.floor(rng() * 4)];
    survivors.forEach((id) => { nextProgress[id] = { alive: true, step: 0, thisRoundStatus: "playing" }; });

    return {
      ...fresh,
      sequence: grownSequence,
      roundNum: fresh.roundNum + 1,
      phase: "playback",
      phaseStartedAt: Date.now(),
      playerProgress: nextProgress,
      eliminatedInRound: nextEliminated,
      rngState: Math.floor(rng() * 1e9),
    };
  });
}

// Same reasoning as lib/games/torchedData.js's own placementValue —
// see that function's comment for why a still-alive player's score
// (1000 + roundNum) is provably always higher than any past
// elimination's (1000 + an earlier roundNum), with no extra offset
// needed, and why same-round eliminations correctly tie rather than
// being arbitrarily ordered against each other.
export function placementValue(state, playerId) {
  if (state.winnerId === playerId) return 100000;
  const elimRound = state.eliminatedInRound?.[playerId];
  if (elimRound != null) return 1000 + elimRound;
  if (state.playerProgress?.[playerId]?.alive) return 1000 + state.roundNum;
  return 0;
}
