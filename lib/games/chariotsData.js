import { storageSet, storageUpdate, subscribeGameState } from "../gameStorage";

// ─── Chariots of Conspire — Big Screen ───
// Three chariots, one seat each. Three random riders start seated;
// everyone else starts "outside." While a chariot procession is
// traveling, every outside player can hammer a Pull button to speed
// it toward its next stop — more outside players actively pulling
// makes stops come faster. When it reaches a stop, the procession
// pauses and outside players can search a field of bushes; 2 of them
// hide a magic rein. Finding one lets that player immediately kick a
// rider out of any chariot and take the seat themselves (the ejected
// rider re-joins the outside pool, eligible to pull/search/steal
// right back). This repeats until the Battle's own outer timer ends
// the challenge — whoever's actually seated at that moment are the
// three winners, and which of their chariots finished 1st/2nd/3rd is
// revealed at random on the TV as pure spectacle, not something
// anyone could see or influence during play (see placementOrder).
//
// Deliberately continuous, like lib/games/wagerTriviaTvData.js and
// lib/games/laurelThiefData.js before it — there's no win condition
// of its own, just as much back-and-forth seat-stealing as the
// Battle's timer allows. tickChariots only ever advances the
// travel/stop clock; it never ends the game itself (see roundEngine.js,
// which drives this the same "continuous" way it drives Wager Trivia
// and Acrophobia — a plain tick call guarded by gameType, no
// autoLockResolvedScores, because reportScore(final:true) firing off
// challenge.active going false, in ChariotsPlayer.jsx, is the entire
// scoring mechanism here).
const NUM_CHARIOTS = 3;
const NUM_BUSHES = 6;
const REIN_COUNT = 2;

// Tuned so that a ~4 minute Battle produces roughly 3 stops if nobody
// ever pulls, and roughly 10 stops if every outside player pulls
// continuously the whole time — see the two rate constants below.
// "Roughly" because real play is never perfectly idle or perfectly
// max-effort the whole way through; the constants just set the two
// ends of that range where the spec asked for them.
const STOP_THRESHOLD = 1000; // "distance" a procession must cover to reach its next stop
const BASE_RATE_PER_MS = STOP_THRESHOLD / 71000; // ~3 stops across ~213s of idle travel
const FULL_PULL_RATE_PER_MS = STOP_THRESHOLD / 15000; // ~10 stops across ~150s of maxed-out travel
const PULL_RATE_PER_MS = FULL_PULL_RATE_PER_MS - BASE_RATE_PER_MS;
// A click keeps counting as "pulling" for this long afterward, so a
// player mashing the button every second or so reads as continuously
// active rather than flickering in and out of the fraction below.
const PULL_ACTIVE_WINDOW_MS = 1800;
// Clamp on how much wall-clock time a single tick can apply at once —
// guards against one huge jump (a tab backgrounded for a while, a
// slow housekeeping poll) instantly resolving several stops at once.
const MAX_TICK_DT_MS = 4000;

export const STOP_DURATION_MS = 9000;
export { NUM_CHARIOTS, NUM_BUSHES, STOP_THRESHOLD };

function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffledIds(ids, rng) {
  const arr = ids.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function generateBushes(rng) {
  const idx = Array.from({ length: NUM_BUSHES }, (_, i) => i);
  const shuffled = shuffledIds(idx, rng);
  const reinSet = new Set(shuffled.slice(0, REIN_COUNT));
  return Array.from({ length: NUM_BUSHES }, (_, i) => ({ hasRein: reinSet.has(i), searchedBy: null }));
}

export const chariotsKey = (round) => `pb:chariots:${round}`;

export function subscribeChariots(gameId, round, onChange) {
  return subscribeGameState(gameId, chariotsKey(round), onChange);
}

// Every player not currently occupying a seat — derived, never stored,
// so a steal can never leave it stale.
export function getOutsideIds(state) {
  if (!state) return [];
  const seated = new Set(state.seats || []);
  return (state.participantIds || []).filter((id) => !seated.has(id));
}

export async function initChariots(gameId, round, participants, seed, db) {
  const set = db?.set || storageSet;
  const rng = mulberry32(seed || Date.now());
  const ids = participants.map((p) => p.id);
  const numChariots = Math.min(NUM_CHARIOTS, ids.length);
  const seats = shuffledIds(ids, rng).slice(0, numChariots);
  const now = Date.now();
  // A second, independent draw from the same rng stream — kept apart
  // from rngState (which keeps evolving every stop, for fresh bush
  // layouts) so the 1st/2nd/3rd reveal permutation is fixed for the
  // whole battle and reproducible by any client from state alone,
  // without ever being computed (or shown) before the reveal itself.
  const placementSeed = Math.floor(rng() * 1e9);
  await set(gameId, chariotsKey(round), {
    participantIds: ids,
    seats,
    phase: "traveling", // "traveling" | "stopped"
    phaseStartedAt: now,
    lastTickAt: now,
    progress: 0,
    stopCount: 0,
    pullClicks: {}, // outside playerId -> last pull timestamp
    bushes: null,
    pendingSteals: {}, // outside playerId -> true, once they've found an unused rein
    lastSteal: null, // { playerId, ejectedId, chariotIndex, at } — brief announcement only
    placementSeed,
    rngState: Math.floor(rng() * 1e9),
  });
}

export async function submitPull(gameId, round, playerId) {
  return storageUpdate(gameId, chariotsKey(round), (fresh) => {
    if (!fresh || fresh.phase !== "traveling") return fresh;
    if ((fresh.seats || []).includes(playerId)) return fresh; // riders don't pull
    return { ...fresh, pullClicks: { ...fresh.pullClicks, [playerId]: Date.now() } };
  });
}

export async function searchBush(gameId, round, playerId, bushIndex) {
  return storageUpdate(gameId, chariotsKey(round), (fresh) => {
    if (!fresh || fresh.phase !== "stopped" || !fresh.bushes) return fresh;
    if ((fresh.seats || []).includes(playerId)) return fresh; // riders don't search
    if (fresh.pendingSteals[playerId]) return fresh; // resolve your current rein first
    const bush = fresh.bushes[bushIndex];
    if (!bush || bush.searchedBy) return fresh;
    const bushes = fresh.bushes.slice();
    bushes[bushIndex] = { ...bush, searchedBy: playerId };
    const next = { ...fresh, bushes };
    if (bush.hasRein) next.pendingSteals = { ...fresh.pendingSteals, [playerId]: true };
    return next;
  });
}

export async function stealSeat(gameId, round, playerId, chariotIndex) {
  return storageUpdate(gameId, chariotsKey(round), (fresh) => {
    if (!fresh || !fresh.pendingSteals[playerId]) return fresh;
    if (chariotIndex < 0 || chariotIndex >= fresh.seats.length) return fresh;
    const ejectedId = fresh.seats[chariotIndex];
    const seats = fresh.seats.slice();
    seats[chariotIndex] = playerId;
    const pendingSteals = { ...fresh.pendingSteals };
    delete pendingSteals[playerId];
    return { ...fresh, seats, pendingSteals, lastSteal: { playerId, ejectedId, chariotIndex, at: Date.now() } };
  });
}

// The actual phase-transition logic, kept as a pure function of
// (fresh, now) — same reasoning as wagerTriviaTransition's own header
// comment in lib/games/wagerTriviaTvData.js: exercisable directly by a
// standalone test script with zero mocking. tickChariots below is
// just this wrapped in the standard storageUpdate CAS.
export function chariotsTransition(fresh, now) {
  if (!fresh) return fresh;

  if (fresh.phase === "traveling") {
    const dt = Math.min(now - fresh.lastTickAt, MAX_TICK_DT_MS);
    if (dt <= 0) return fresh;
    const outsideIds = getOutsideIds(fresh);
    const activeCount = outsideIds.filter(
      (id) => fresh.pullClicks[id] && now - fresh.pullClicks[id] <= PULL_ACTIVE_WINDOW_MS
    ).length;
    const fraction = outsideIds.length > 0 ? activeCount / outsideIds.length : 0;
    const rate = BASE_RATE_PER_MS + fraction * PULL_RATE_PER_MS;
    const progress = fresh.progress + dt * rate;

    if (progress < STOP_THRESHOLD) {
      return { ...fresh, progress, lastTickAt: now };
    }

    const rng = mulberry32(fresh.rngState);
    const bushes = generateBushes(rng);
    return {
      ...fresh,
      phase: "stopped",
      phaseStartedAt: now,
      lastTickAt: now,
      progress: 0,
      stopCount: fresh.stopCount + 1,
      bushes,
      pendingSteals: {},
      rngState: Math.floor(rng() * 1e9),
    };
  }

  if (fresh.phase === "stopped") {
    if (now - fresh.phaseStartedAt < STOP_DURATION_MS) return fresh;
    // Any rein found but never spent this stop is simply wasted — a
    // real consequence of dawdling on the choice, not a bug to work
    // around with a longer grace window.
    return {
      ...fresh,
      phase: "traveling",
      phaseStartedAt: now,
      lastTickAt: now,
      pullClicks: {},
      pendingSteals: {},
      bushes: null,
    };
  }

  return fresh;
}

export async function tickChariots(gameId, round, db) {
  const update = db?.update || storageUpdate;
  const now = Date.now();
  return update(gameId, chariotsKey(round), (fresh) => chariotsTransition(fresh, now));
}

// A fixed permutation of chariot index -> finishing order, derived
// once from placementSeed (set at init, never touched again — see
// initChariots's own comment on why it's kept separate from
// rngState). order[0] is the chariot index that finishes 1st, etc.
// Pure function of state alone, so the TV's end-of-battle reveal and
// every phone's own final reportScore call always agree on it without
// needing any extra round-trip or server-side finalize step.
export function placementOrder(state) {
  const numChariots = (state.seats || []).length;
  const rng = mulberry32(state.placementSeed || 1);
  return shuffledIds(Array.from({ length: numChariots }, (_, i) => i), rng);
}

// Deliberately hidden-until-the-end, like the reveal itself: while
// riding, a player IS on track to place, but which placement (and how
// many points that's worth) only resolves once the battle ends and
// placementOrder actually gets consulted for real, on the TV, live.
// Not currently seated in a chariot at all is a flat 0 — the same
// "no elimination, just a running score for as long as the Battle's
// timer allows" shape as lib/games/wagerTriviaTvData.js's own
// placementValue.
export function placementValue(state, playerId) {
  const chariotIndex = (state.seats || []).indexOf(playerId);
  if (chariotIndex === -1) return 0;
  const order = placementOrder(state);
  const rank = order.indexOf(chariotIndex); // 0 = 1st place
  return Math.max(100, 300 - rank * 100);
}
