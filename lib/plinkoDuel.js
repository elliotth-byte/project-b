import { storageGet, storageUpdate, subscribeGameState } from "./gameStorage";
import { reportScore } from "./challengeScores";

// ─── Plinko duels ───
// Big Brother-style bracket: two random players face off, the higher
// score stays in and picks who challenges them next, repeat until
// everyone's played. Final placement is reverse elimination order — the
// undefeated survivor is 1st, whoever they beat in the LAST duel is 2nd,
// down to whoever lost the very FIRST duel in last place. That maps
// cleanly onto the same score-desc ranking every other challenge already
// uses: each player's synthetic "score" is just how many people they
// outlasted, so scoresToPlacements needs no changes at all for this.
//
// State lives in its own game_state key (not KEY_CHALLENGE itself) since
// it's meaningfully more structured than every other game's — see
// bracketKey below.
const bracketKey = (round) => `pb:plinko-duel:${round}`;

export function subscribeBracket(gameId, round, onChange) {
  return subscribeGameState(gameId, bracketKey(round), onChange);
}

export async function getBracket(gameId, round) {
  return storageGet(gameId, bracketKey(round));
}

// Called once, by whichever participant's client notices the challenge
// has started but no bracket exists yet (see PlinkoPlayer.jsx) — safe to
// attempt from multiple clients at once. Uses storageUpdate rather than
// a plain storageSet specifically because set() is a blind upsert with
// no concurrency check (see lib/dbAdapter.js) — two clients racing to
// initialize at once could otherwise have the second one silently
// clobber the first's already-in-progress bracket with a fresh, DIFFERENT
// random pairing. storageUpdate's version-checked read-modify-write means
// only the first actually creates it; everyone else's attempt is a no-op
// that just returns the real, already-initialized bracket instead.
export async function initBracketIfMissing(gameId, round, participantIds) {
  const shuffled = [...participantIds].sort(() => Math.random() - 0.5);
  const [a, b, ...rest] = shuffled;
  const initial = {
    duel: a && b ? { aId: a, bId: b, aValue: null, bValue: null, aLockedAt: null, bLockedAt: null } : null,
    waiting: rest,
    eliminatedOrder: [], // earliest-eliminated first
    champion: a && b ? null : a || null, // a lone participant just wins outright
    pendingChoice: null,
    totalPlayers: participantIds.length,
  };
  const res = await storageUpdate(gameId, bracketKey(round), (fresh) => (fresh ? fresh : initial));
  return res.ok ? res.value : await getBracket(gameId, round);
}

export async function reportDuelShot(gameId, round, playerId, value) {
  return storageUpdate(gameId, bracketKey(round), (fresh) => {
    if (!fresh?.duel) return fresh;
    const d = { ...fresh.duel };
    if (d.aId === playerId) { d.aValue = value; d.aLockedAt = Date.now(); }
    else if (d.bId === playerId) { d.bValue = value; d.bLockedAt = Date.now(); }
    return { ...fresh, duel: d };
  });
}

// Safe to call redundantly, from any participant's client (dueling or
// still waiting) — a no-op unless the current duel is genuinely both-
// done-and-unresolved. Whoever's client happens to notice first is the
// one that actually moves the bracket forward, same "any open tab can
// nudge things along" pattern the rest of async play already relies on.
export async function resolveDuelIfReady(gameId, round) {
  const res = await storageUpdate(gameId, bracketKey(round), (fresh) => {
    const d = fresh?.duel;
    if (!d || d.aValue == null || d.bValue == null || fresh.pendingChoice) return fresh;
    const aWins = d.aValue !== d.bValue ? d.aValue > d.bValue : d.aLockedAt <= d.bLockedAt; // tie -> whoever locked in first
    const winnerId = aWins ? d.aId : d.bId;
    const loserId = aWins ? d.bId : d.aId;
    const eliminatedOrder = [...fresh.eliminatedOrder, loserId];
    if (fresh.waiting.length === 0) {
      return { ...fresh, duel: null, eliminatedOrder, champion: winnerId };
    }
    return { ...fresh, duel: null, eliminatedOrder, pendingChoice: winnerId };
  });
  return res;
}

// The winner picks who challenges them next — see PlinkoPlayer.jsx's
// "choose your opponent" state. Defaults to a random pick after a short
// window if they don't choose (see CHOOSE_TIMEOUT_MS there), so one
// player stalling can't stall the whole bracket.
export async function chooseNextOpponent(gameId, round, winnerId, opponentId) {
  return storageUpdate(gameId, bracketKey(round), (fresh) => {
    if (fresh?.pendingChoice !== winnerId) return fresh;
    if (!fresh.waiting.includes(opponentId)) return fresh;
    const waiting = fresh.waiting.filter((id) => id !== opponentId);
    return {
      ...fresh, waiting, pendingChoice: null,
      duel: { aId: winnerId, bId: opponentId, aValue: null, bValue: null, aLockedAt: null, bLockedAt: null },
    };
  });
}

// Every participant's own client calls this once they see (via the
// bracket subscription) that THEY specifically have been eliminated or
// crowned champion — reportScore's own lock-once guard (see
// lib/challengeScores.js) makes this safe even if several clients
// somehow tried to report the same player's outcome.
export async function reportOutcomeIfMine(gameId, round, playerId, playerName, bracket) {
  if (!bracket) return;
  if (bracket.champion === playerId) {
    await reportScore(gameId, round, playerId, playerName, bracket.totalPlayers, { final: true, duelPlacement: 1 });
    return;
  }
  const idx = bracket.eliminatedOrder.indexOf(playerId);
  if (idx === -1) return;
  const value = idx + 1; // earliest eliminated = lowest value = last place
  await reportScore(gameId, round, playerId, playerName, value, { final: true, duelPlacement: bracket.totalPlayers - value + 1 });
}
