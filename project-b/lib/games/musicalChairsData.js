import { storageSet, storageUpdate, subscribeGameState } from "../gameStorage";

// storageUpdate resolves to dbAdapter.js's own actual return shape —
// { ok, value, aborted? } — never the raw next state directly. Every
// mutation function below that needs to hand its caller the resulting
// state (so `state = await someMutation(...)` gets the state itself,
// not a wrapper object) goes through this instead of calling
// storageUpdate directly.
async function updateState(gameId, key, updater) {
  const result = await storageUpdate(gameId, key, updater);
  return result?.value ?? null;
}


// ─── Musical Chairs ───
// n participants, n-1 rounds — one chair removed (one player
// eliminated) per round, exactly like the real game, ending with a
// single winner. Each round has two phases:
//   "music"  — nobody can do anything yet; how long this lasts is
//              deliberately unpredictable (see computeMusicDurationsMs
//              below), same as real musical chairs never telegraphing
//              when the music's about to stop.
//   "seats"  — chairs (always remainingCount - 1 of them) become
//              claimable at once. First successful claim on each chair
//              wins it — decided by whichever claim's write actually
//              reaches the database first, the only fair arbiter
//              available across devices with different clocks. Stays
//              open for this game's own computed seatWindowMs even once
//              some chairs are taken, specifically so a player whose
//              device was a little slower to receive/render the "seats
//              are open" broadcast (or who's just checking in
//              periodically on an async, hours-long challenge) isn't
//              structurally locked out — see computeSeatWindowMs below.
//
// Whoever's left without a chair when the round resolves (every chair
// filled, or the window ran out) is eliminated. If more than one player
// ends up chairless — someone simply never clicked anything at all,
// not just lost a fair race — only ONE of them is actually eliminated
// this round, same as only one chair is ever removed in the real game;
// see resolveRound for exactly how that's chosen.

export const musicalChairsKey = (round) => `pb:musicalchairs:${round}`;
const key = musicalChairsKey;

export function subscribeMusicalChairs(gameId, round, onChange) {
  return subscribeGameState(gameId, key(round), onChange);
}

const MIN_PARTICIPANTS = 2;

// The actual "did you react in time" window, once chairs are open — now
// DYNAMIC rather than a flat constant, because this app's challenges
// range from a live few-minutes battle everyone's actively watching to
// an async one running 14+ hours where players check in occasionally
// throughout the day. A flat 5s window is a reasonable ask for the
// first case and an absurd one for the second — someone who opens the
// app 20 minutes after chairs opened, in an async season, isn't
// "slow," they're just living their life between check-ins, same as
// every other async-friendly mechanic in this app already assumes.
// Sized as a fraction of this game's own average per-round time (see
// computeSeatWindowMs below), clamped so it's never so short it's
// unfair to a normal round-trip of network+render latency, and never
// so long a single round can eat the whole rest of a short battle.
const MIN_SEAT_WINDOW_MS = 5000; // 5s — the live/fast-challenge floor from the original design
const MAX_SEAT_WINDOW_MS = 30 * 60 * 1000; // 30 minutes — generous for an async check-in, but not "leave it open for hours"
const SEAT_WINDOW_FRACTION = 0.25; // how much of one round's average time goes to reacting vs. to the (unpredictable) music phase

const MIN_MUSIC_MS = 3000;

function seededRandom(seed) {
  let s = seed || 1;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

// One window, computed ONCE for the whole game (not per-round) — unlike
// the music phase, there's no value in making the REACTION window
// itself unpredictable; the suspense is supposed to be "when does the
// music stop," not "how long do I have once it does."
export function computeSeatWindowMs(challengeDurationSec, totalRounds) {
  if (totalRounds <= 0) return MIN_SEAT_WINDOW_MS;
  const totalMs = (challengeDurationSec || 360) * 1000;
  const avgRoundMs = totalMs / totalRounds;
  return Math.round(Math.max(MIN_SEAT_WINDOW_MS, Math.min(MAX_SEAT_WINDOW_MS, avgRoundMs * SEAT_WINDOW_FRACTION)));
}

// One randomized music-phase length per round, sized off the season's
// configured challenge duration so a shorter/longer battle setting
// actually produces a shorter/longer game here too, not a fixed
// experience regardless of settings. Deliberately NOT a flat
// totalBudget/totalRounds split — real musical chairs is unnerving
// specifically because you can't predict the next stop from the last
// one, so each round's length is independently randomized around that
// average (0.6x-1.4x). The upper clamp is relative (2x the average),
// not a fixed constant — a fixed absolute ceiling here would silently
// throw away almost an entire 14-hour challenge's worth of budget down
// to a few seconds per round the moment the average got large, which
// is exactly backwards from what a long async challenge needs; only
// the floor (MIN_MUSIC_MS) is an absolute constant, since a music phase
// shorter than that is just unfair regardless of how long the overall
// challenge is. The actual sum across all rounds will therefore drift
// somewhat from the configured duration — that's accepted, not a bug:
// see the challenge-level timeout fallback in
// lib/roundEngine.js's autoFinalizeMusicalChairsOnTimeout for what
// happens on the rare deal where a heavy run of long rounds actually
// exhausts the outer timer before the bracket finishes on its own.
export function computeMusicDurationsMs(challengeDurationSec, totalRounds, seatWindowMs, seed) {
  if (totalRounds <= 0) return [];
  const totalMs = (challengeDurationSec || 360) * 1000;
  const seatBudgetMs = totalRounds * seatWindowMs;
  const musicBudgetMs = Math.max(totalRounds * MIN_MUSIC_MS, totalMs - seatBudgetMs);
  const avgMs = musicBudgetMs / totalRounds;
  const rand = seededRandom(seed);
  const durations = [];
  for (let i = 0; i < totalRounds; i++) {
    const jittered = avgMs * (0.6 + rand() * 0.8); // 0.6x .. 1.4x of average
    durations.push(Math.round(Math.max(MIN_MUSIC_MS, Math.min(avgMs * 2, jittered))));
  }
  return durations;
}

// db: optional override — see lib/games/plinkoBracketData.js's
// initPlinkoBracket for why.
export async function initMusicalChairs(gameId, round, participants, now, challengeDurationSec, db) {
  const set = db?.set || storageSet;
  if (participants.length < MIN_PARTICIPANTS) return; // degenerate case, handled client-side

  const participantIds = participants.map((p) => p.id);
  const totalRounds = participantIds.length - 1;
  const seatWindowMs = computeSeatWindowMs(challengeDurationSec, totalRounds);
  const musicDurationsMs = computeMusicDurationsMs(challengeDurationSec, totalRounds, seatWindowMs, now);

  await set(gameId, key(round), {
    participantIds,
    totalRounds,
    musicDurationsMs,
    seatWindowMs,
    gamePhase: "playing", // "playing" | "revealed"
    roundIndex: 0,
    roundPhase: "music", // "music" | "seats" — only meaningful while gamePhase is "playing"
    remainingPlayerIds: participantIds,
    eliminatedOrder: [], // playerId, in the order eliminated — first entry is the worst finish
    roundStartedAt: now,
    musicEndsAt: now + musicDurationsMs[0],
    seatsEndsAt: null,
    chairCount: null,
    claims: {}, // playerId -> { chairIndex, claimedAt } — this round only, reset every round
    winnerId: null,
    timedOut: false,
    results: null, // playerId -> { placement, points } — see resolveRound / finalizeOnTimeout
  });
}

function openSeatsIfDue(fresh) {
  if (!fresh || fresh.gamePhase !== "playing" || fresh.roundPhase !== "music") return fresh;
  if (Date.now() < fresh.musicEndsAt) return fresh;
  const now = Date.now();
  return {
    ...fresh,
    roundPhase: "seats",
    chairCount: fresh.remainingPlayerIds.length - 1,
    seatsEndsAt: now + fresh.seatWindowMs,
    claims: {},
  };
}

// Called on an interval by every player's own client AND, as a safety
// net for when nobody's tab happens to be active at the exact instant
// (a phone screen locking between rounds, etc. — same reasoning
// Torched/Masquerade's own turn timeouts already accept in this app),
// by lib/roundEngine.js's poll. Safe to call redundantly from many
// places at once: it's a no-op unless the fresh state actually says
// time's up.
export async function advanceMusicalChairsIfDue(gameId, round) {
  return updateState(gameId, key(round), (fresh) => {
    if (!fresh || fresh.gamePhase !== "playing") return fresh;
    if (fresh.roundPhase === "music") return openSeatsIfDue(fresh);
    if (fresh.roundPhase === "seats") {
      if (Date.now() < fresh.seatsEndsAt) return fresh;
      return resolveRound(fresh, fresh.claims);
    }
    return fresh;
  });
}

// Resolves the current round given a final claims map (playerId ->
// {chairIndex, claimedAt}) — shared by the natural "time's up" path
// above and claimChair's own "every chair just filled, no reason to
// make everyone wait out the rest of the window" early-resolve path
// below. Pure function of its inputs so it produces the identical
// result no matter which client's browser happens to be the one that
// executes it (see lib/dbAdapter.js's optimistic-concurrency retry
// loop — the actual DB write is what's authoritative, not who
// computed it).
function resolveRound(fresh, claims) {
  const seatedIds = Object.keys(claims);
  const chairless = fresh.remainingPlayerIds.filter((id) => !seatedIds.includes(id));

  let eliminatedId;
  if (chairless.length <= 1) {
    eliminatedId = chairless[0] ?? fresh.remainingPlayerIds[fresh.remainingPlayerIds.length - 1];
  } else {
    // More than one player never got a chair — happens when someone
    // simply never clicked anything at all, not just lost a fair race.
    // Only one chair is ever actually removed per round, so only one
    // of them is eliminated: whoever's own claim attempt (if they made
    // one at all) was latest ranks worst; a total no-show ranks as
    // worse than any real attempt (Infinity). If MULTIPLE players
    // never attempted at all, there's no real-world signal left to
    // separate them — broken by a deterministic pick seeded from this
    // exact round's own state, so every client watching converges on
    // the identical answer without a second round-trip to agree on it.
    const worstTime = Math.max(...chairless.map((id) => claims[id]?.claimedAt ?? Infinity));
    const tiedForWorst = chairless.filter((id) => (claims[id]?.claimedAt ?? Infinity) === worstTime);
    if (tiedForWorst.length === 1) {
      eliminatedId = tiedForWorst[0];
    } else {
      const seed = fresh.roundIndex * 7919 + fresh.remainingPlayerIds.length * 104729 + tiedForWorst.length;
      const rand = seededRandom(seed);
      eliminatedId = tiedForWorst[Math.floor(rand() * tiedForWorst.length)];
    }
  }

  const eliminatedOrder = [...fresh.eliminatedOrder, eliminatedId];
  const nextRemaining = fresh.remainingPlayerIds.filter((id) => id !== eliminatedId);

  if (nextRemaining.length <= 1) {
    const winnerId = nextRemaining[0] ?? null;
    const ranking = winnerId ? [...eliminatedOrder, winnerId] : eliminatedOrder; // worst..best
    const results = {};
    ranking.forEach((id, i) => { results[id] = { points: i + 1, placement: ranking.length - i }; });
    return {
      ...fresh, gamePhase: "revealed", eliminatedOrder, remainingPlayerIds: nextRemaining,
      winnerId, results, roundPhase: null, claims: {},
    };
  }

  const nextRoundIndex = fresh.roundIndex + 1;
  const now = Date.now();
  return {
    ...fresh,
    eliminatedOrder,
    remainingPlayerIds: nextRemaining,
    roundIndex: nextRoundIndex,
    roundPhase: "music",
    roundStartedAt: now,
    musicEndsAt: now + fresh.musicDurationsMs[nextRoundIndex],
    seatsEndsAt: null,
    chairCount: null,
    claims: {},
  };
}

// A single chair-claim attempt. Silently rejected (no-op, same
// convention as every other invalid submission in this app's
// multiplayer games) if: seats aren't open, this player's already
// eliminated or already holds a chair this round, the chair index is
// out of range, or someone else's claim already landed on that exact
// chair first — "first" meaning whichever claim's database write
// actually commits first, which is the only fair arbiter available
// when different players' devices have different clocks.
export async function claimChair(gameId, round, playerId, chairIndex) {
  return updateState(gameId, key(round), (fresh) => {
    if (!fresh || fresh.gamePhase !== "playing" || fresh.roundPhase !== "seats") return fresh;
    if (!fresh.remainingPlayerIds.includes(playerId)) return fresh;
    if (fresh.claims[playerId]) return fresh;
    if (chairIndex < 0 || chairIndex >= fresh.chairCount) return fresh;
    if (Object.values(fresh.claims).some((c) => c.chairIndex === chairIndex)) return fresh;

    const nextClaims = { ...fresh.claims, [playerId]: { chairIndex, claimedAt: Date.now() } };
    // Every chair's spoken for — the outcome's already decided, so
    // resolve right now rather than making everyone sit through
    // whatever's left of the window doing nothing.
    if (Object.keys(nextClaims).length >= fresh.chairCount) {
      return resolveRound(fresh, nextClaims);
    }
    return { ...fresh, claims: nextClaims };
  });
}

// Challenge-level safety net (see lib/roundEngine.js's
// autoFinalizeMusicalChairsOnTimeout) — the season's own configured
// challenge duration ran out before the bracket reduced itself to a
// single winner on its own (an unlucky run of long, randomized music
// phases; see computeMusicDurationsMs's own comment on why the total
// isn't guaranteed to fit exactly). Same shape as
// lib/games/scavengerHuntData.js's own timeout fallback: whoever's
// still standing didn't lose, so they're not ranked below anyone who
// was already eliminated — but the game genuinely can't say which of
// them would have won, so they're tied for the best remaining
// placement rather than arbitrarily ordered.
export function finalizeOnTimeout(fresh) {
  if (!fresh || fresh.gamePhase !== "playing") return fresh;
  const ranking = fresh.eliminatedOrder; // worst..best, NOT including whoever's left
  const results = {};
  ranking.forEach((id, i) => { results[id] = { points: i + 1, placement: ranking.length + fresh.remainingPlayerIds.length - i }; });
  const survivorPoints = ranking.length + 1;
  const survivorPlacement = fresh.remainingPlayerIds.length; // tied for 1st among themselves
  fresh.remainingPlayerIds.forEach((id) => { results[id] = { points: survivorPoints, placement: survivorPlacement }; });
  return { ...fresh, gamePhase: "revealed", timedOut: true, results, roundPhase: null };
}

export function placementValue(state, playerId) {
  if (state.gamePhase !== "revealed") return 0;
  return state.results?.[playerId]?.points || 0;
}
