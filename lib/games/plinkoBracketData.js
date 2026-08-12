import { storageSet, storageUpdate, subscribeGameState } from "../gameStorage";

// ─── Plinko Duel Bracket ───
// Big Brother-style duels: the first two players (randomly paired) face
// off; the winner stays in and picks their next opponent from whoever
// hasn't played yet; repeat until one player's beaten everyone. That
// player is 1st place, whoever they beat in the final duel is 2nd,
// whoever was eliminated just before that is 3rd, and so on back to
// whoever lost the very first duel, who places last.
//
// The clever part (see resolveDuel below) is that this whole bracket
// integrates with the EXISTING challenge-scoring pipeline
// (lib/challengeScores.js's reportScore/scoresToPlacements,
// lib/roundEngine.js's isPhaseFullyDone) completely unchanged: each
// player's final "score" for this challenge is just a number that
// encodes exactly where they finished in the elimination order — 1 for
// whoever lost first, up through N for the undefeated champion — so the
// standard "rank everyone by score, descending" logic already in place
// produces precisely the bracket ranking above, with zero special-casing
// anywhere else in the app.

const bracketKey = (round) => `pb:plinko-bracket:${round}`;

export function subscribePlinkoBracket(gameId, round, onChange) {
  return subscribeGameState(gameId, bracketKey(round), onChange);
}

function seededRandom(seed) {
  let s = seed || 1;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

// participants: [{ id, name }]. Called once, when the host starts a
// Plinko challenge — see ChallengeHost.jsx's startChallenge.
export async function initPlinkoBracket(gameId, round, participants, seed) {
  const rand = seededRandom(seed || 1);
  const shuffled = [...participants].sort(() => rand() - 0.5);
  const total = shuffled.length;

  if (total < 2) {
    // Degenerate case (a challenge with 0 or 1 competitors) — nothing to
    // duel. Just leave the bracket absent; PlinkoPlayer.jsx falls back to
    // treating a lone participant as an immediate, uncontested champion.
    return;
  }

  await storageSet(gameId, bracketKey(round), {
    totalPlayers: total,
    pool: shuffled.slice(2).map((p) => p.id), // everyone not in the first duel
    current: [shuffled[0].id, shuffled[1].id],
    champion: null, // nobody's won a duel yet
    eliminationCount: 0,
    duelScores: {}, // this duel's Plinko results, reset each new pairing
    finalized: false,
  });
}

// The value reported for this challenge via reportScore — see the
// top-of-file comment for why this single number is enough for the
// standard scoring pipeline to reproduce the bracket ranking exactly.
export function placementValueFor(bracket, playerId) {
  if (bracket.champion === playerId && bracket.pool.length === 0) return bracket.totalPlayers;
  return null; // not yet resolved for this player
}

// Called by whichever client's screen happens to notice both duelists
// now have a score in duelScores — safe to call redundantly from
// multiple clients at once; storageUpdate's compare-and-swap semantics
// plus the `if already resolved, no-op` guard below make it idempotent.
export async function resolveDuelIfReady(gameId, round) {
  return storageUpdate(gameId, bracketKey(round), (fresh) => {
    if (!fresh || !fresh.current || fresh.finalized) return fresh;
    const [a, b] = fresh.current;
    const scoreA = fresh.duelScores[a], scoreB = fresh.duelScores[b];
    if (scoreA == null || scoreB == null) return fresh; // still waiting on one of them

    const winnerId = scoreA >= scoreB ? a : b;
    const loserId = scoreA >= scoreB ? b : a;
    const eliminationCount = fresh.eliminationCount + 1;

    return {
      ...fresh,
      champion: winnerId,
      current: null, // between duels — champion needs to pick next, or the bracket's over
      duelScores: {},
      eliminationCount,
      // loserId's actual reportScore call happens client-side (see
      // PlinkoPlayer.jsx) once it sees itself named here — this is just
      // the shared record of what happened.
      lastLoserId: loserId,
      lastLoserValue: eliminationCount, // 1st-out gets 1, 2nd-out gets 2, etc.
    };
  });
}

// Called by the reigning champion once they've picked who's next (or
// there's nobody left, meaning the bracket is over).
export async function pickNextChallenger(gameId, round, challengerId) {
  return storageUpdate(gameId, bracketKey(round), (fresh) => {
    if (!fresh || fresh.current || fresh.finalized) return fresh; // already mid-duel, or done
    if (!fresh.pool.includes(challengerId)) return fresh;
    return {
      ...fresh,
      pool: fresh.pool.filter((id) => id !== challengerId),
      current: [fresh.champion, challengerId],
      duelScores: {},
    };
  });
}

export async function markBracketFinalized(gameId, round) {
  return storageUpdate(gameId, bracketKey(round), (fresh) => (fresh ? { ...fresh, finalized: true } : fresh));
}
