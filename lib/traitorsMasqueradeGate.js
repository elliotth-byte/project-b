import { supabase } from "./supabaseClient";
import { storageGet, storageSet, subscribeGameState } from "./gameStorage";

// ─── Traitors: Masquerade Pre-Elimination Gate ───
// The Week 0 mission — deliberately separate from the numbered
// schedule (see lib/traitorsSchedule.js's own MASQUERADE_PRE_ELIMINATION
// export), run once, before Traitors are ever selected, against
// whatever the FULL starting roster is (which can be more than 26 —
// this doesn't assume the numbered schedule's fixed 26 until AFTER
// this gate has actually run and cut the roster down).
//
// Reuses the existing Masquerade Houses mission (components/
// MasqueradeHost.jsx, components/MasqueradePlayer.jsx) completely
// as-is — no changes to that mechanic itself, including its own
// existing "first 3 houses resolved, game over" rule (maxResolved: 3
// in that component — NOT every house necessarily gets resolved
// before the mission ends, which is already how it worked before this
// gate existed and isn't something this changes). What this adds is
// the one new step that mission never needed before: once it's done,
// every player whose house ended up "eliminated" actually gets
// eliminated from the game itself (players.alive = false), using the
// exact same players table fields Roundtable and the Murder Vote
// already use for their own eliminations (see
// components/RoundtableHost.jsx / components/MurderVoteHost.jsx) —
// elimination_type: "masquerade" is what distinguishes this
// specifically in a player's own history from those other two.
export const KEY_PRE_ELIMINATION_STATUS = "traitors:pre-elimination-status";

export function subscribePreEliminationStatus(gameId, onChange) {
  return subscribeGameState(gameId, KEY_PRE_ELIMINATION_STATUS, onChange);
}

export async function getPreEliminationStatus(gameId) {
  return storageGet(gameId, KEY_PRE_ELIMINATION_STATUS);
}

// masqueradeState is the finished Masquerade Houses state (the same
// shape components/MasqueradeHost.jsx already reads/writes) — house
// membership is stored there as NAMES, not player ids (that mission
// was built before this gate existed and works off display names
// throughout), so allPlayers ({id, name}) is required here to resolve
// each eliminated house's members back to real player ids before
// writing to the players table, which only ever works by id.
//
// Idempotent — safe to call more than once (a host double-clicking, or
// a retry after a network hiccup) without eliminating anyone twice:
// re-checks each target player's CURRENT alive status before writing,
// and records this gate as applied so the host UI can stop offering
// the button at all once it's actually done.
export async function applyMasqueradeEliminations(gameId, masqueradeState, allPlayers) {
  const existing = await getPreEliminationStatus(gameId);
  if (existing?.applied) return { ok: true, alreadyApplied: true, eliminatedPlayerIds: existing.eliminatedPlayerIds };

  const eliminatedNames = (masqueradeState.houses || [])
    .filter((h) => h.status === "eliminated")
    .flatMap((h) => h.members);

  const eliminatedPlayerIds = [];
  for (const name of eliminatedNames) {
    const player = allPlayers.find((p) => p.name === name);
    if (!player) continue; // shouldn't happen, but never crash the whole gate over one unmatched name
    const { data: current } = await supabase.from("players").select("alive").eq("id", player.id).maybeSingle();
    if (current && current.alive !== false) {
      await supabase.from("players").update({ alive: false, elimination_type: "masquerade" }).eq("id", player.id);
    }
    eliminatedPlayerIds.push(player.id);
  }

  await storageSet(gameId, KEY_PRE_ELIMINATION_STATUS, {
    applied: true, appliedAt: Date.now(), eliminatedPlayerIds, eliminatedNames,
  });

  return { ok: true, alreadyApplied: false, eliminatedPlayerIds };
}
