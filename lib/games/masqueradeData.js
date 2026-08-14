import { storageSet, storageUpdate, subscribeGameState } from "../gameStorage";

// ─── Murder at the Masquerade ───
// Turn-based, not simultaneous like The Agora — one active player and
// one target per turn, everyone else spectating, matching the real
// mechanic: the active player secretly decides which of two glasses is
// poisoned, picks an opponent to target, and offers them ONE of the two
// (without saying which is which). The target picks the offered glass
// or the other one — whichever they pick, they drink; the active player
// is stuck with whatever's left. Two poison strikes eliminates a player.
// Last one standing (or best-standing when time runs out) wins.
//
// Since this is turn-based, a stalled player could otherwise block the
// whole game — see autoResolveTargeting/autoResolveResponse, which any
// connected client can call once a step's deadline has passed, same
// "any client can resolve it" pattern as the Plinko duel bracket.
//
// Scoring integrates with the standard pipeline the same way — see
// placementValue.

const TARGETING_TIMEOUT_MS = 30000;
const RESPONSE_TIMEOUT_MS = 20000;
const REVEAL_DISPLAY_MS = 4000;

const key = (round) => `pb:masquerade:${round}`;

export function subscribeMasquerade(gameId, round, onChange) {
  return subscribeGameState(gameId, key(round), onChange);
}

function seededRandom(seed) {
  let s = seed || 1;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

function nextActiveIndex(order, eliminated, fromIndex) {
  for (let step = 1; step <= order.length; step++) {
    const idx = (fromIndex + step) % order.length;
    if (!eliminated.includes(order[idx])) return idx;
  }
  return fromIndex; // shouldn't happen — means everyone's eliminated
}

function survivorCount(order, eliminated) {
  return order.filter((id) => !eliminated.includes(id)).length;
}

// participants: [{id,name}]. Called once from ChallengeHost.jsx's
// startChallenge, same as the other live multiplayer games.
export async function initMasquerade(gameId, round, participants, seed) {
  const rand = seededRandom(seed || 1);
  if (participants.length < 2) return; // degenerate case, handled client-side

  const order = [...participants].map((p) => p.id).sort(() => rand() - 0.5);
  const strikes = {};
  order.forEach((id) => (strikes[id] = 0));
  const startIndex = Math.floor(rand() * order.length);

  await storageSet(gameId, key(round), {
    order,
    strikes,
    eliminated: [],
    activeIndex: startIndex,
    turn: {
      phase: "targeting",
      activePlayerId: order[startIndex],
      targetId: null,
      offerIsPoison: null,
      comment: null,
      deadline: Date.now() + TARGETING_TIMEOUT_MS,
    },
    finalized: false,
  });
}

// The active player picks who to target and which glass to offer them
// (true = offering the poisoned one, hoping they take it; false =
// offering the safe one, hoping the target gets suspicious and picks
// the OTHER glass instead — which would then be poison). comment is
// optional flavor text shown to the target, not required.
export async function submitTargetChoice(gameId, round, activePlayerId, targetId, offerIsPoison, comment) {
  return storageUpdate(gameId, key(round), (fresh) => {
    if (!fresh || fresh.finalized) return fresh;
    const turn = fresh.turn;
    if (!turn || turn.phase !== "targeting" || turn.activePlayerId !== activePlayerId) return fresh;
    if (targetId === activePlayerId || fresh.eliminated.includes(targetId) || !fresh.order.includes(targetId)) return fresh;

    return {
      ...fresh,
      turn: {
        ...turn, targetId, offerIsPoison: !!offerIsPoison, comment: (comment || "").slice(0, 140) || null,
        phase: "responding", deadline: Date.now() + RESPONSE_TIMEOUT_MS,
      },
    };
  });
}

function resolveTurn(fresh, tookOffered) {
  const turn = fresh.turn;
  const targetDrinksPoison = tookOffered ? turn.offerIsPoison : !turn.offerIsPoison;
  const activeDrinksPoison = !targetDrinksPoison;

  const strikes = { ...fresh.strikes };
  if (targetDrinksPoison) strikes[turn.targetId] = (strikes[turn.targetId] || 0) + 1;
  if (activeDrinksPoison) strikes[turn.activePlayerId] = (strikes[turn.activePlayerId] || 0) + 1;

  let eliminated = fresh.eliminated;
  [turn.targetId, turn.activePlayerId].forEach((pid) => {
    if (strikes[pid] >= 2 && !eliminated.includes(pid)) eliminated = [...eliminated, pid];
  });

  const stillIn = survivorCount(fresh.order, eliminated);

  return {
    ...fresh,
    strikes,
    eliminated,
    turn: {
      ...turn, phase: "revealed",
      targetDrankPoison: targetDrinksPoison, activeDrankPoison: activeDrinksPoison,
      revealUntil: Date.now() + REVEAL_DISPLAY_MS,
    },
    finalized: stillIn <= 1,
  };
}

export async function submitResponse(gameId, round, targetId, tookOffered) {
  return storageUpdate(gameId, key(round), (fresh) => {
    if (!fresh || fresh.finalized) return fresh;
    const turn = fresh.turn;
    if (!turn || turn.phase !== "responding" || turn.targetId !== targetId) return fresh;
    return resolveTurn(fresh, tookOffered);
  });
}

// Any client calls this once revealUntil has passed — sets up the next
// player's targeting phase, or leaves the game finalized if only one
// survivor remains.
export async function advanceAfterReveal(gameId, round) {
  return storageUpdate(gameId, key(round), (fresh) => {
    if (!fresh || fresh.finalized) return fresh;
    const turn = fresh.turn;
    if (!turn || turn.phase !== "revealed" || Date.now() < turn.revealUntil) return fresh;

    const nextIndex = nextActiveIndex(fresh.order, fresh.eliminated, fresh.activeIndex);
    return {
      ...fresh,
      activeIndex: nextIndex,
      turn: {
        phase: "targeting", activePlayerId: fresh.order[nextIndex],
        targetId: null, offerIsPoison: null, comment: null,
        deadline: Date.now() + TARGETING_TIMEOUT_MS,
      },
    };
  });
}

// Auto-resolution for a stalled turn — any connected client calls these;
// both are no-ops unless the relevant deadline has actually passed, so
// calling them speculatively/redundantly from many clients is safe.
export async function autoResolveTargeting(gameId, round) {
  return storageUpdate(gameId, key(round), (fresh) => {
    if (!fresh || fresh.finalized) return fresh;
    const turn = fresh.turn;
    if (!turn || turn.phase !== "targeting" || Date.now() < turn.deadline) return fresh;

    const options = fresh.order.filter((id) => id !== turn.activePlayerId && !fresh.eliminated.includes(id));
    if (options.length === 0) return fresh;
    const targetId = options[Math.floor(Math.random() * options.length)];
    const offerIsPoison = Math.random() < 0.5;

    return {
      ...fresh,
      turn: { ...turn, targetId, offerIsPoison, comment: null, phase: "responding", deadline: Date.now() + RESPONSE_TIMEOUT_MS },
    };
  });
}

export async function autoResolveResponse(gameId, round) {
  return storageUpdate(gameId, key(round), (fresh) => {
    if (!fresh || fresh.finalized) return fresh;
    const turn = fresh.turn;
    if (!turn || turn.phase !== "responding" || Date.now() < turn.deadline) return fresh;
    return resolveTurn(fresh, true); // default: take the glass that was actually offered
  });
}

// Same "single number encodes the whole ranking" trick as the Plinko
// bracket — eliminated players occupy a low tier ordered by how early
// they were knocked out, survivors always outrank them and are ordered
// by strikes (fewer is better). Works whether the game ends naturally
// (one survivor left) or gets cut off by the challenge's own time limit.
export function placementValue(state, playerId) {
  const elimIdx = state.eliminated.indexOf(playerId);
  if (elimIdx !== -1) return elimIdx;
  return 10000 - (state.strikes[playerId] || 0) * 10;
}
