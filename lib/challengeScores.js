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

const sessionKey = (round) => `pb:challenge-session:${round}`;

// A handful of mini-games run their OWN clock, independent of the host's
// overall challenge timer (Match 3's flat 3 minutes from the moment the
// player hits Start; Whack-a-Mole's flat 90 seconds; the "how long did
// this take you" games measuring elapsed time to a finish). That clock's
// start reference needs to survive the player's component remounting —
// switching tabs, the browser backgrounding, a flaky connection — rather
// than being recomputed as "right now" on every mount, which would quietly
// hand them a fresh full clock each time they came back. The first call
// for a given player+round wins and is persisted; every later call
// (including from a brand new mount) gets that same timestamp back.
export async function getOrStartSession(gameId, round, playerId) {
  const res = await storageUpdate(gameId, sessionKey(round), (fresh) => {
    const existing = fresh || {};
    if (existing[playerId]) return existing; // already started — keep it, don't reset the clock
    existing[playerId] = Date.now();
    return existing;
  });
  return res?.value?.[playerId] || Date.now();
}

// Read-only check — used by games with an explicit "Start" button (e.g.
// Match 3) that need to know, on mount, whether THIS player already has a
// clock running from an earlier session (so they can resume it instead of
// showing the Start button again), without accidentally starting a new
// clock themselves just by checking.
export async function peekSession(gameId, round, playerId) {
  const value = await storageGet(gameId, sessionKey(round));
  return value?.[playerId] || null;
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
      // Carried through for display purposes only (e.g. Spot the
      // Difference's "found" count) — not used for ranking, which is
      // always decided by `value` above.
      foundCount: s && !forfeited ? s.foundCount ?? null : null,
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

  return [...played, ...didNotPlay].map((r, i) => ({
    playerId: r.playerId, name: r.name, place: i + 1, forfeited: r.forfeited, value: r.value, foundCount: r.foundCount,
  }));
}

// A single, shared "how should this placement's score actually be
// displayed" formatter — used by the host's live leaderboard, the
// Challenge History section, and anywhere else a placement needs to show
// more than just a place number. Manual challenges have no numeric score
// at all (the host just enters finishing order), so this only applies to
// digital ones.
export function formatPlacementValue(placement, gameType, rankDirection) {
  if (!placement) return null;
  if (placement.forfeited) return "Forfeited";
  if (placement.foundCount != null) return `${placement.foundCount} found`;
  if (placement.value == null) return null;
  return rankDirection === "time-asc" ? `${(placement.value / 1000).toFixed(2)}s` : `${placement.value} pts`;
}
