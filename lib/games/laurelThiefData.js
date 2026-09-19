import { storageSet, storageUpdate, subscribeGameState } from "../gameStorage";

// ─── Laurel Thief ───
// Everyone starts with 10 laurels — the Greek victory wreath, stolen
// straight from an opponent with a tap. Same mechanic in both modes
// (normal and Big Screen); the only real difference between them is
// pacing and where the live picture (everyone's current count, who's
// stealing from whom) actually shows — see cooldownMsFor's own
// comment for pacing, and components/games/LaurelThiefPlayer.jsx /
// components/bigscreen/LaurelThiefTvDisplay.jsx for the two display
// splits. One shared engine, not two separate ones, since unlike Eyes
// in the System (a genuinely different mechanic between its two
// modes) this game IS the same thing either way.
//
// Zero-sum by construction — every steal just moves one laurel from
// one player to another, the total across all participants never
// changes — so this never naturally resolves to a single winner
// before the clock runs out the way a pure elimination format would.
// A player hitting 0 laurels IS eliminated (can't steal or be stolen
// from anymore — see stealLaurel's own guards), but the challenge
// itself always runs its full length regardless of how many players
// that happens to; final standing is whoever's holding the most
// laurels when time's up, not "last one with any left."
const STARTING_LAURELS = 10;
export const BIG_SCREEN_DURATION_SEC = 120; // 2 minutes
const BIG_SCREEN_COOLDOWN_MS = 5000; // 5 seconds

// Normal mode scales its own steal cooldown to its own (usually much
// longer) battle duration, relative to Big Screen's 2-minute baseline
// — not a fixed 5 seconds regardless of length. The point is keeping
// the same RELATIVE pacing (roughly the same number of steal
// opportunities per player across the whole battle) rather than
// either making a 5-minute normal battle seem sluggish (fixed 5s
// cooldown, way more total steals than intended) or Big Screen's own
// 2-minute clock feel rushed by comparison.
export function cooldownMsFor(challengeDurationSec, isBigScreen) {
  if (isBigScreen) return BIG_SCREEN_COOLDOWN_MS;
  const ratio = (challengeDurationSec || BIG_SCREEN_DURATION_SEC) / BIG_SCREEN_DURATION_SEC;
  return Math.round(BIG_SCREEN_COOLDOWN_MS * ratio);
}

const key = (round) => `pb:laurelthief:${round}`;

export function subscribeLaurelThief(gameId, round, onChange) {
  return subscribeGameState(gameId, key(round), onChange);
}

export async function initLaurelThief(gameId, round, participants, now, db) {
  const set = db?.set || storageSet;
  const laurels = {};
  participants.forEach((p) => { laurels[p.id] = STARTING_LAURELS; });
  await set(gameId, key(round), {
    laurels, cooldownUntil: {}, eliminatedOrder: [],
    recentSteals: [], // [{ stealerId, victimId, at }, ...] — the "who's stealing from whom" feed, capped, most recent last
  });
}

// One tap, one laurel — validated exactly the way every other timed
// shared-state battle here validates a player action: read fresh,
// check every precondition, write atomically. Both the stealer AND the
// victim must currently have at least one laurel (an eliminated player
// — 0 laurels — has nothing left to give and no reason left to steal
// with), and the stealer's own cooldown must have actually expired.
export async function stealLaurel(gameId, round, stealerId, victimId, cooldownMs) {
  return storageUpdate(gameId, key(round), (fresh) => {
    if (!fresh || stealerId === victimId) return fresh;
    const now = Date.now();
    if (now < (fresh.cooldownUntil[stealerId] || 0)) return fresh;
    const stealerLaurels = fresh.laurels[stealerId] || 0;
    const victimLaurels = fresh.laurels[victimId] || 0;
    if (stealerLaurels <= 0 || victimLaurels <= 0) return fresh;

    const nextLaurels = { ...fresh.laurels, [stealerId]: stealerLaurels + 1, [victimId]: victimLaurels - 1 };
    const nextEliminated = nextLaurels[victimId] === 0 ? [...fresh.eliminatedOrder, victimId] : fresh.eliminatedOrder;

    return {
      ...fresh,
      laurels: nextLaurels,
      cooldownUntil: { ...fresh.cooldownUntil, [stealerId]: now + cooldownMs },
      eliminatedOrder: nextEliminated,
      recentSteals: [...fresh.recentSteals.slice(-19), { stealerId, victimId, at: now }],
    };
  });
}

// Any survivor (>=1 laurel) always outranks any eliminated player (0
// laurels) — the *1000 headroom is provably enough since
// eliminatedOrder.indexOf's max possible value is participantCount-2,
// nowhere near 1000 for any realistic season size, the same "no extra
// offset needed" reasoning lib/games/torchedData.js's own
// placementValue comment uses. Among survivors, more laurels is
// straightforwardly better. Among eliminated players (all tied at 0
// laurels, nothing to separate them on raw count alone), whoever
// lasted longer (a later index in eliminatedOrder) ranks higher.
export function placementValue(state, playerId) {
  const laurels = state.laurels?.[playerId] || 0;
  if (laurels > 0) return laurels * 1000;
  return state.eliminatedOrder.indexOf(playerId);
}

export { STARTING_LAURELS };
