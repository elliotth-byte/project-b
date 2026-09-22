import { storageSet, subscribeGameState } from "./gameStorage";

// ─── Traitors' own "the season is over" marker ───
// Parallel to Project B's KEY_FINALE ("pb:finale", lib/gameState.js),
// read by the same public_season_history/public_season_roster SQL
// functions (see sql/add-season-placement.sql) — both keys store
// `winnerId` at the top level so "did I win" reads identically either
// way once the right key's picked by game_type. Unlike Project B's
// finale, there's no jury vote behind this — Traitors never had one,
// and building one is well outside what this is for. A host just picks
// the winner directly (see TraitorsAdminHost.jsx's "Declare Winner"
// card); everyone else still alive+approved at that moment is recorded
// as a non-winning finalist.
export const KEY_TRAITORS_FINALE = "traitors:finale";

export async function declareWinner(gameId, winner, finalists) {
  return storageSet(gameId, KEY_TRAITORS_FINALE, {
    winnerId: winner.id,
    winnerName: winner.display_name,
    finalistIds: finalists.map((f) => f.id),
    finalistNames: finalists.map((f) => f.display_name),
    declaredAt: Date.now(),
  });
}

export function subscribeTraitorsFinale(gameId, onChange) {
  return subscribeGameState(gameId, KEY_TRAITORS_FINALE, onChange);
}
