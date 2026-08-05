import { storageGet, storageUpdate, subscribeGameState } from "./gameStorage";

const scoresKey = (round) => `pb:challenge-scores:${round}`;

export function subscribeScores(gameId, round, onChange) {
  return subscribeGameState(gameId, scoresKey(round), (v) => onChange(v || {}));
}

export async function getScores(gameId, round) {
  return (await storageGet(gameId, scoresKey(round))) || {};
}

// Every mini-game calls this — repeatedly, with final=false, while play is
// live (so the host's leaderboard and a timeout-triggered auto-advance
// both see current progress), then once more with final=true the moment
// the player naturally finishes (solved it, ran out of lives, etc). Once
// a score is final it's locked — further calls (e.g. a stray re-render)
// can't overwrite it.
export async function reportScore(gameId, round, playerId, playerName, value, opts = {}) {
  const { final = false, ...meta } = opts;
  return storageUpdate(gameId, scoresKey(round), (fresh) => {
    const existing = fresh || {};
    if (existing[playerId]?.locked) return existing;
    existing[playerId] = { playerName, value, finishedAt: Date.now(), locked: final, ...meta };
    return existing;
  });
}

// A player can forfeit mid-challenge (see ChallengePlayer's Forfeit
// button) — this locks in a "didn't finish" score for them the same way
// a natural finish would, so the round can't stall waiting on someone
// who's opted out. Forfeiting after an already-locked (finished) score
// is a no-op, same guard as reportScore uses.
export async function forfeitChallenge(gameId, round, playerId, playerName) {
  return storageUpdate(gameId, scoresKey(round), (fresh) => {
    const existing = fresh || {};
    if (existing[playerId]?.locked) return existing;
    existing[playerId] = { playerName, value: null, finishedAt: Date.now(), locked: true, forfeited: true };
    return existing;
  });
}

// participants: [{ playerId, name }]. Returns [{ playerId, name, place, forfeited }]
// covering EVERY participant, including anyone who never reported a
// score at all (ranked last, in join order) — this is what guarantees a
// mini-game challenge always has complete placements the moment its
// timer runs out, with no "waiting on the host" stall. A forfeited
// player is treated the same as a no-show for ranking purposes (last
// place), just tagged so the UI can label it distinctly.
export function scoresToPlacements(scores, participants, rankDirection) {
  const rows = (participants || []).map((p) => {
    const s = scores?.[p.playerId];
    const forfeited = !!s?.forfeited;
    return {
      playerId: p.playerId,
      name: p.name,
      value: s && !forfeited ? s.value : null,
      finishedAt: s ? s.finishedAt : Infinity,
      played: !!s && !forfeited,
      forfeited,
    };
  });

  const played = rows.filter((r) => r.played);
  const didNotPlay = rows.filter((r) => !r.played);

  played.sort((a, b) => {
    if (a.value !== b.value) {
      return rankDirection === "time-asc" ? a.value - b.value : b.value - a.value;
    }
    return a.finishedAt - b.finishedAt; // tie -> whoever locked in first wins
  });

  return [...played, ...didNotPlay].map((r, i) => ({ playerId: r.playerId, name: r.name, place: i + 1, forfeited: r.forfeited }));
}
