import { storageSet, storageUpdate, subscribeGameState } from "../gameStorage";
import { generateRound } from "./eyesInTheSystemData";

// ─── Eyes in the System — Big Screen ───
// See lib/games/eyesInTheSystemData.js for the shared round-generation
// engine this reuses directly (same zones, same guaranteed-unique
// answer) — this file is only the genuinely different structure
// around it: two players face off at a time, first correct answer
// wins the match, the loser is eliminated outright, and the WINNER
// picks the next two players to face off from whoever's left. That
// repeats until exactly one player remains.
//
// Unlike every other Big Screen battle in this app, the puzzle itself
// is shown on BOTH the TV and each face-off participant's own phone
// (see components/games/EyesInTheSystemTvPlayer.jsx's own comment) —
// a deliberate difference: this is a head-to-head speed contest
// between two specific people, and forcing them to glance up at a
// shared screen mid-race would just be an unfair, arbitrary
// reaction-time penalty that has nothing to do with actually spotting
// the right zone.
export const eyesTvKey = (round) => `pb:eyesinthesystemtv:${round}`;

export function subscribeEyesTv(gameId, round, onChange) {
  return subscribeGameState(gameId, eyesTvKey(round), onChange);
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

function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function initEyesInTheSystemTv(gameId, round, participants, seed, db) {
  const set = db?.set || storageSet;
  const rng = mulberry32(seed || Date.now());
  // No previous winner to pick a matchup yet — the very first face-off
  // is randomly drawn, same as any bracket needs a starting seed.
  const order = shuffle(participants.map((p) => p.id), rng);
  const [playerAId, playerBId] = order;
  await set(gameId, eyesTvKey(round), {
    remainingPlayerIds: order,
    matchNumber: 1,
    currentMatch: { playerAId, playerBId, round: generateRound(rng), answers: {}, startedAt: Date.now() },
    pendingChoice: null,
    eliminatedInRound: {},
    matchLog: [],
    winnerId: null,
    rngState: Math.floor(rng() * 1e9),
  });
}

// Either face-off participant submits their pick — first CORRECT
// answer wins the match immediately (an incorrect answer just marks
// that this player has now answered, so the match can still resolve
// once both have gone, but doesn't cost them anything beyond not
// having won this exchange — see resolveMatchIfDecided for what
// actually happens once both have answered).
export async function submitEyesTvAnswer(gameId, round, playerId, chosenZone) {
  return storageUpdate(gameId, eyesTvKey(round), (fresh) => {
    if (!fresh || fresh.winnerId) return fresh;
    const match = fresh.currentMatch;
    if (!match || (playerId !== match.playerAId && playerId !== match.playerBId)) return fresh;
    if (match.answers[playerId]) return fresh; // already answered this match
    const correct = match.round.correctZone === chosenZone;
    return { ...fresh, currentMatch: { ...match, answers: { ...match.answers, [playerId]: { zone: chosenZone, correct, at: Date.now() } } } };
  });
}

// Resolves the current match the instant it CAN be resolved — either
// someone's answered correctly (immediate win, doesn't wait for the
// other player at all), or both have now answered and neither got it
// right (a genuine rematch: same two players, a freshly generated
// round, tried again — nobody advances on a round neither of them
// actually solved). Called from both the TV's own poll and mirrored
// server-side, same belt-and-suspenders pattern as every other shared
// timed battle here.
export async function resolveEyesTvMatch(gameId, round, db) {
  const update = db?.update || storageUpdate;
  return update(gameId, eyesTvKey(round), (fresh) => {
    if (!fresh || fresh.winnerId || fresh.pendingChoice) return fresh;
    const match = fresh.currentMatch;
    if (!match) return fresh;
    const aAns = match.answers[match.playerAId];
    const bAns = match.answers[match.playerBId];

    let winnerId = null;
    if (aAns?.correct) winnerId = match.playerAId;
    else if (bAns?.correct) winnerId = match.playerBId;
    else if (aAns && bAns) {
      // Both answered, both wrong — rematch with a fresh round rather
      // than picking an arbitrary "winner" out of two wrong guesses.
      const rng = mulberry32(fresh.rngState);
      return {
        ...fresh,
        currentMatch: { ...match, round: generateRound(rng), answers: {}, startedAt: Date.now() },
        rngState: Math.floor(rng() * 1e9),
      };
    } else {
      return fresh; // still waiting on at least one of the two to answer at all
    }

    const loserId = winnerId === match.playerAId ? match.playerBId : match.playerAId;
    const remaining = fresh.remainingPlayerIds.filter((id) => id !== loserId);
    const nextEliminated = { ...fresh.eliminatedInRound, [loserId]: fresh.matchNumber };
    const matchLogEntry = { matchNumber: fresh.matchNumber, playerAId: match.playerAId, playerBId: match.playerBId, winnerId, loserId };

    if (remaining.length <= 1) {
      return {
        ...fresh,
        remainingPlayerIds: remaining,
        eliminatedInRound: nextEliminated,
        matchLog: [...fresh.matchLog, matchLogEntry],
        currentMatch: null,
        winnerId: remaining[0] || winnerId,
      };
    }

    // Exactly one player besides the winner remains — no real choice
    // to make (there's only one possible next opponent), so the next
    // match starts automatically rather than making the winner click
    // through a picker with a single, forced option.
    if (remaining.length === 2) {
      const rng = mulberry32(fresh.rngState);
      const [nextA, nextB] = remaining;
      return {
        ...fresh,
        remainingPlayerIds: remaining,
        eliminatedInRound: nextEliminated,
        matchLog: [...fresh.matchLog, matchLogEntry],
        matchNumber: fresh.matchNumber + 1,
        currentMatch: { playerAId: nextA, playerBId: nextB, round: generateRound(rng), answers: {}, startedAt: Date.now() },
        pendingChoice: null,
        rngState: Math.floor(rng() * 1e9),
      };
    }

    return {
      ...fresh,
      remainingPlayerIds: remaining,
      eliminatedInRound: nextEliminated,
      matchLog: [...fresh.matchLog, matchLogEntry],
      currentMatch: null,
      pendingChoice: { winnerId },
    };
  });
}

// The winner picks exactly two players (excluding themselves) from
// whoever's left — a genuinely open choice with real stakes (this is
// the winner's actual prize: control over who faces whom next), not
// something the game should ever pick for them.
export async function chooseNextMatch(gameId, round, winnerId, opponentAId, opponentBId) {
  return storageUpdate(gameId, eyesTvKey(round), (fresh) => {
    if (!fresh || fresh.winnerId || !fresh.pendingChoice || fresh.pendingChoice.winnerId !== winnerId) return fresh;
    if (fresh.currentMatch) return fresh; // a match already got set up (e.g. a concurrent request) — don't double-create one
    const validIds = new Set(fresh.remainingPlayerIds);
    if (opponentAId === opponentBId || !validIds.has(opponentAId) || !validIds.has(opponentBId)) return fresh;
    if (opponentAId === winnerId || opponentBId === winnerId) return fresh; // the winner sits this one out — see this file's own header comment
    const rng = mulberry32(fresh.rngState);
    return {
      ...fresh,
      matchNumber: fresh.matchNumber + 1,
      currentMatch: { playerAId: opponentAId, playerBId: opponentBId, round: generateRound(rng), answers: {}, startedAt: Date.now() },
      pendingChoice: null,
      rngState: Math.floor(rng() * 1e9),
    };
  });
}

// Tie-aware in the same sense every other Big Screen elimination game
// here is (see lib/games/torchedData.js's own placementValue comment)
// even though two players can never actually tie for the SAME match
// number in a strict 1-on-1 bracket — kept in the same shape purely
// for consistency with the rest of this app's scoring pipeline, and in
// case a future variant of this format ever did allow simultaneous
// matches.
export function placementValue(state, playerId) {
  if (state.winnerId === playerId) return 100000;
  const elimMatch = state.eliminatedInRound?.[playerId];
  if (elimMatch != null) return 1000 + elimMatch;
  if (state.remainingPlayerIds?.includes(playerId)) return 1000 + state.matchNumber;
  return 0;
}
