import { traitorStorageSet, traitorStorageUpdate, traitorStorageDelete } from "./traitorStorage";
import {
  CASE_VALUES, seededShuffle, pickCase, openCase, acceptDeal, declineDeal,
} from "./games/dealOrNoDealData";

// ─── Secret Deal or No Deal (Traitor factions only) ───
// An optional, host-toggled side game: one Traitor from each faction
// plays their own Deal or No Deal board. Secrecy rules, and how each is
// enforced:
//
// - The Faithful must not know it's happening. Nothing goes into
//   game_state (which every player can read), the mission registry, the
//   schedule, challenge history or Slack. Each faction's game is one row
//   in traitor_state, and sql/add-traitor-deal-or-no-deal.sql only lets a
//   living Traitor of THAT faction read it. Player clients only ever
//   query it when they already know they're a Traitor.
// - Factions must not learn who the other faction's player is. Each
//   faction's row holds only its own player's name, and the RLS refuses
//   the other faction's row outright. The one thing that crosses over is
//   the rival's final dollar amount, which the host copies into each row
//   when sharing the result (shareOutcome below) — never a name.
// - Only the chosen Traitor can play. The same SQL only lets the
//   player whose id is in the row update it.
//
// Game rules are the existing lib/games/dealOrNoDealData.js ones,
// reused as-is: its actions take a `db` adapter, so they're pointed at
// this faction's traitor_state row instead of a game_state key.

export const TRAITOR_FACTIONS = ["traitor-red", "traitor-black"];
export const dondFactionKey = (faction) => `dond:${faction}`;

function factionDb(faction) {
  return {
    update: (gameId, _ignoredKey, updater) =>
      traitorStorageUpdate(gameId, dondFactionKey(faction), (fresh) => (fresh && fresh.status === "active" ? updater(fresh) : null)),
  };
}

// Host only. `picks` is { "traitor-red": { id, name }, ... } — one entry
// per faction taking part.
export async function startTraitorDond(gameId, picks) {
  const factions = Object.keys(picks).filter((f) => picks[f]?.id);
  const startedAt = Date.now();
  const results = await Promise.all(factions.map((faction) => {
    const seed = (crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff) || 1;
    return traitorStorageSet(gameId, dondFactionKey(faction), {
      status: "active", faction, startedAt,
      playerId: picks[faction].id, playerName: picks[faction].name,
      // Whether there's a rival at all. Each side only ever sees "a rival",
      // never who it is.
      hasRival: factions.length > 1,
      caseValues: seededShuffle(CASE_VALUES, seed),
      myCase: null, openedIndices: [], roundIndex: 0, openedThisRound: 0,
      offer: null, dealtAt: null, done: false,
      outcome: null,
    });
  }));
  return results.every(Boolean);
}

export async function stopTraitorDond(gameId) {
  await Promise.all(TRAITOR_FACTIONS.map((f) => traitorStorageDelete(gameId, dondFactionKey(f))));
}

// Host only. Tells each side how they did against the other — the rival's
// amount only, no name.
export async function shareOutcome(gameId, games) {
  const playing = TRAITOR_FACTIONS.filter((f) => games[f]?.done && games[f]?.dealtAt);
  await Promise.all(playing.map((faction) => {
    const mine = games[faction].dealtAt.amount;
    const rival = playing.find((f) => f !== faction);
    const rivalAmount = rival ? games[rival].dealtAt.amount : null;
    const result = rivalAmount == null ? "solo" : mine > rivalAmount ? "won" : mine < rivalAmount ? "lost" : "tie";
    return traitorStorageUpdate(gameId, dondFactionKey(faction), (fresh) => {
      if (!fresh) return null;
      return { ...fresh, outcome: { result, rivalAmount, sharedAt: Date.now() } };
    });
  }));
}

// Player actions — only succeed for the chosen player (RLS).
export const traitorPickCase = (gameId, faction, caseIndex) => pickCase(gameId, 0, null, caseIndex, factionDb(faction));
export const traitorOpenCase = (gameId, faction, caseIndex) => openCase(gameId, 0, null, caseIndex, factionDb(faction));
export const traitorAcceptDeal = (gameId, faction) => acceptDeal(gameId, 0, null, factionDb(faction));
export const traitorDeclineDeal = (gameId, faction) => declineDeal(gameId, 0, null, factionDb(faction));

export function dondProgressText(g) {
  if (!g) return "";
  if (g.done && g.dealtAt) {
    const how = g.dealtAt.swapped == null ? "took the deal" : g.dealtAt.swapped ? "swapped cases" : "kept their case";
    return `Finished — ${how}`;
  }
  if (g.myCase == null) return "Picking a case";
  if (g.offer) return g.offer.isFinal ? "Final decision: keep or swap" : "Considering the banker's offer";
  return `Round ${g.roundIndex + 1} · ${g.openedIndices.length} of 24 cases opened`;
}
