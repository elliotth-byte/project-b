import { storageUpdate, subscribeGameState } from "../gameStorage";

// ─── Scavenger Hunt ───
// A genuinely shared, competitive game — everyone draws from the SAME
// finite pool of items across 8 temples, racing each other for scarce
// copies of what they still need. Built server-persisted from the
// start (see lib/games/dealOrNoDealData.js's own header comment for
// exactly why that matters — that game had to be rebuilt from scratch
// after shipping client-only, this one starts where that one ended up).
//
// Confirmed directly with the season's host on every genuinely
// ambiguous point before building any of this:
//   - Each temple's items are assigned ONCE at the very start of the
//     challenge and only ever shrink — never restocked, never
//     reshuffled mid-game.
//   - A player who doesn't act before their round's own timer runs out
//     simply stays at their current temple with no item this round,
//     and gets another chance next round.
//   - The whole Battle ends the INSTANT a 3rd player returns to
//     Olympus with a complete set — it doesn't keep running for
//     everyone else afterward.
//
// One thing NOT explicitly asked, decided as a judgment call rather
// than left to pure chance: the total item pool guarantees EXACTLY N
// copies of each of the 8 offering types (N = player count) — 8 types
// × N copies = 8 temples × N items each, exactly filling every slot.
// The values are true random per-slot, but the TOTAL composition is
// balanced, so this game can never become literally unwinnable because
// one offering type happened to never get generated anywhere. Flagged
// clearly since a fully unconstrained per-slot random draw was the
// other reasonable reading of "a random assort."

export const TEMPLES = [
  "Temple of Zeus", "Temple of Athena", "Temple of Poseidon", "Temple of Apollo",
  "Temple of Artemis", "Temple of Hermes", "Temple of Demeter", "Temple of Hephaestus",
];

export const OFFERING_TYPES = [
  "Golden Fleece", "Ambrosia", "Laurel Wreath", "Olive Branch",
  "Sacred Chalice", "Bronze Tripod", "Myrrh Incense", "Honeycomb",
];

// Each round's own short timer, separate from the overall Battle
// timer — scaled to the challenge's own configured duration rather
// than a fixed constant, since a 5-minute Battle and a 20-minute one
// shouldn't hand out the same per-round window. Derived so that at
// least TARGET_ROUNDS rounds remain POSSIBLE even in the absolute
// worst case (every single round hitting its own timeout rather than
// resolving early because everyone chose) — not a guarantee the game
// actually needs that many, just a floor on how many it COULD have.
// Clamped at both ends: below MIN_ROUND_SEC there isn't real time to
// look at the board, decide, and click; above MAX_ROUND_SEC a single
// round starts dragging regardless of how much total time is
// available.
const TARGET_ROUNDS = 12;
const MIN_ROUND_SEC = 20;
const MAX_ROUND_SEC = 90;

export function computeRoundTimeoutMs(challengeDurationSec) {
  const totalSec = challengeDurationSec || 600;
  const perRoundSec = totalSec / TARGET_ROUNDS;
  return Math.max(MIN_ROUND_SEC, Math.min(MAX_ROUND_SEC, perRoundSec)) * 1000;
}

function seededShuffle(values, seed) {
  let s = seed || 1;
  const rand = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const arr = [...values];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Exactly N copies of each of the 8 types (8N total), shuffled and
// dealt N-per-temple — see this file's own header comment for why this
// is guaranteed-balanced rather than fully unconstrained.
export function buildTemples(playerCount, seed) {
  const n = Math.max(1, playerCount);
  const allItems = [];
  OFFERING_TYPES.forEach((type) => { for (let i = 0; i < n; i++) allItems.push(type); });
  const shuffled = seededShuffle(allItems, seed);
  return TEMPLES.map((name, templeIdx) => ({
    name,
    items: shuffled.slice(templeIdx * n, (templeIdx + 1) * n).map((type, itemIdx) => ({
      id: `${templeIdx}-${itemIdx}`, type, takenBy: null,
    })),
  }));
}

export const scavengerKey = (round) => `pb:scavenger:${round}`;

export async function initScavengerHunt(gameId, round, participants, seed, db) {
  const update = db?.update || storageUpdate;
  const players = {};
  (participants || []).forEach((p) => {
    players[p.id] = { currentLocation: null, nextLocation: null, inventory: [], takenThisRound: false, finishedRound: null };
  });
  const initial = {
    temples: buildTemples((participants || []).length, seed || 1),
    players,
    roundIndex: 1,
    roundStartedAt: Date.now(),
    finishedOrder: [], // first 3 playerIds to complete a full set and reach Olympus, in order
    gameOver: false,
  };
  const res = await update(gameId, scavengerKey(round), (fresh) => (fresh ? fresh : initial));
  return res?.value || initial;
}

// Round 1 only — every other round's "next location" IS this round's
// destination, chosen during the PREVIOUS round via chooseNextLocation.
// Same one-shot-lock pattern as everything else here: once set, later
// calls are silent no-ops.
export async function chooseFirstTemple(gameId, round, playerId, templeIndex, db) {
  const update = db?.update || storageUpdate;
  const res = await update(gameId, scavengerKey(round), (fresh) => {
    if (!fresh) return fresh;
    const p = fresh.players[playerId];
    if (!p || p.currentLocation != null) return fresh;
    return { ...fresh, players: { ...fresh.players, [playerId]: { ...p, currentLocation: templeIndex } } };
  });
  return res?.value || null;
}

// Claims one item slot at the player's CURRENT temple — atomic against
// every other player racing for the same slot, since this whole
// function body is the storageUpdate callback: whichever call actually
// wins the underlying compare-and-swap is the one whose read of
// `takenBy: null` was still true at write time. Once per round per
// player (takenThisRound), and permanent forever once claimed —
// confirmed directly: "gone for that round and future rounds."
export async function takeItem(gameId, round, playerId, itemId, db) {
  const update = db?.update || storageUpdate;
  const res = await update(gameId, scavengerKey(round), (fresh) => {
    if (!fresh || fresh.gameOver) return fresh;
    const p = fresh.players[playerId];
    if (!p || p.finishedRound != null || p.takenThisRound || p.currentLocation == null || p.currentLocation === "olympus") return fresh;

    const temple = fresh.temples[p.currentLocation];
    const itemIdx = temple.items.findIndex((it) => it.id === itemId);
    if (itemIdx === -1 || temple.items[itemIdx].takenBy) return fresh; // already claimed by someone else, or doesn't exist

    const newTemples = [...fresh.temples];
    const newItems = [...temple.items];
    newItems[itemIdx] = { ...newItems[itemIdx], takenBy: playerId };
    newTemples[p.currentLocation] = { ...temple, items: newItems };

    return {
      ...fresh, temples: newTemples,
      players: { ...fresh.players, [playerId]: { ...p, inventory: [...p.inventory, newItems[itemIdx].type], takenThisRound: true } },
    };
  });
  return res?.value || null;
}

// The other half of a player's turn — where to go once the NEXT round
// begins. "olympus" is only a valid destination once they hold at
// least one of all 8 types — enforced here, not just suggested by the
// UI, same defense-in-depth reasoning as everywhere else in this app.
export async function chooseNextLocation(gameId, round, playerId, destination, db) {
  const update = db?.update || storageUpdate;
  const res = await update(gameId, scavengerKey(round), (fresh) => {
    if (!fresh || fresh.gameOver) return fresh;
    const p = fresh.players[playerId];
    if (!p || p.finishedRound != null || p.nextLocation != null || p.currentLocation == null) return fresh;
    if (destination === "olympus" && new Set(p.inventory).size < OFFERING_TYPES.length) return fresh;
    return { ...fresh, players: { ...fresh.players, [playerId]: { ...p, nextLocation: destination } } };
  });
  return res?.value || null;
}

// Whether every still-active (not yet finished) player has locked in a
// next-location choice for the CURRENT round — the caller uses this
// alongside its own round-timer check to decide when to actually call
// advanceScavengerRound.
export function everyoneReadyToAdvance(state) {
  if (!state) return false;
  return Object.values(state.players).every((p) => p.finishedRound != null || p.nextLocation != null);
}

// Moves every active player to wherever they chose (or leaves them
// exactly where they were if they never chose — confirmed directly:
// "they stay at their current temple... and must choose again next
// round"), resets each player's per-round action flags, and detects
// anyone who just arrived at Olympus — which, since chooseNextLocation
// already guarantees "olympus" was only ever choosable with a complete
// set, means arriving there IS finishing, nothing further to check.
// Ends the whole game the instant a 3rd player finishes.
export async function advanceScavengerRound(gameId, round, db) {
  const update = db?.update || storageUpdate;
  const res = await update(gameId, scavengerKey(round), (fresh) => {
    if (!fresh || fresh.gameOver) return fresh;

    const nextPlayers = {};
    const newlyFinished = [];
    for (const [pid, p] of Object.entries(fresh.players)) {
      if (p.finishedRound != null) { nextPlayers[pid] = p; continue; }
      const dest = p.nextLocation != null ? p.nextLocation : p.currentLocation;
      const finishedNow = dest === "olympus";
      nextPlayers[pid] = {
        ...p, currentLocation: dest, nextLocation: null, takenThisRound: false,
        finishedRound: finishedNow ? fresh.roundIndex : null,
      };
      if (finishedNow) newlyFinished.push(pid);
    }

    const finishedOrder = [...fresh.finishedOrder, ...newlyFinished].slice(0, 3);
    const gameOver = finishedOrder.length >= 3;

    return {
      ...fresh, players: nextPlayers, roundIndex: fresh.roundIndex + 1, roundStartedAt: Date.now(),
      finishedOrder, gameOver,
    };
  });
  return res?.value || null;
}

// Scoring — finishers rank by finish order (earlier finish = better,
// tiebroken by whoever locked in first within the SAME finishing
// round); everyone else ranks by how many DISTINCT offering types
// they'd collected when the game ended, tiebroken by total items held
// (a deliberate consolation for someone who grabbed extras purely to
// deny a rival, even though it didn't help their own set).
export function placementValue(state, playerId) {
  const p = state.players[playerId];
  if (!p) return 0;
  const finishIdx = state.finishedOrder.indexOf(playerId);
  if (finishIdx !== -1) return 1000000 - finishIdx; // finishers always outrank non-finishers, earlier finish ranks higher
  const distinctTypes = new Set(p.inventory).size;
  return distinctTypes * 1000 + p.inventory.length;
}

export function subscribeScavengerHunt(gameId, round, onChange) {
  return subscribeGameState(gameId, scavengerKey(round), onChange);
}
