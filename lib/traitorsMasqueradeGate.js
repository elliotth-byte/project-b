import { supabase } from "./supabaseClient";
import { storageGet, storageSet, storageUpdate, subscribeGameState } from "./gameStorage";

// ─── Traitors: Masquerade Pre-Elimination Gate ───
// The Week 0 mission — deliberately separate from the numbered
// schedule (see lib/traitorsSchedule.js's own MASQUERADE_PRE_ELIMINATION
// export), run once, before Traitors are ever selected, against
// whatever the FULL starting roster is (which can be more than 26 —
// this doesn't assume the numbered schedule's fixed 26 until AFTER
// this gate has actually run and cut the roster down).
//
// Reuses the existing Masquerade Houses mission (components/
// MasqueradeHost.jsx, components/MasqueradePlayer.jsx) as-is — the host
// picks house size, house count, and how many houses must be eliminated
// (`loseTarget`); every house not eliminated by the time that target is
// hit is automatically safe. What this file adds is the two steps that
// mission never needed before: once it's done, one name among all the
// eliminated houses' members is spared by the Roulette of Mercy (see
// spinMasqueradeRoulette below), and then every OTHER player whose house
// ended up "eliminated" actually gets eliminated from the game itself
// (players.alive = false), using the exact same players table fields
// Roundtable and the Murder Vote already use for their own eliminations
// (see components/RoundtableHost.jsx / components/MurderVoteHost.jsx) —
// elimination_type: "masquerade" is what distinguishes this
// specifically in a player's own history from those other two.
export const KEY_PRE_ELIMINATION_STATUS = "traitors:pre-elimination-status";

export function subscribePreEliminationStatus(gameId, onChange) {
  return subscribeGameState(gameId, KEY_PRE_ELIMINATION_STATUS, onChange);
}

export async function getPreEliminationStatus(gameId) {
  return storageGet(gameId, KEY_PRE_ELIMINATION_STATUS);
}

// ─── Roulette of Mercy ───
// Every member of every house that ended up "eliminated" is about to be
// cut from the game — except one. Once the mission's done, the host spins
// a wheel bearing all of those names; whoever it lands on is spared and
// still joins the main cast, same as anyone who was never eliminated at
// all. The pick itself happens here (not in the UI) and is persisted
// before any animation plays, so it's a single, CAS-guarded random draw
// shared by every viewer — not something each browser could roll
// separately — and a host re-clicking "Spin" (double click, refresh)
// can't re-roll and pick someone else.
export const KEY_MASQUERADE_ROULETTE = "traitors:masquerade-roulette";

export function subscribeMasqueradeRoulette(gameId, onChange) {
  return subscribeGameState(gameId, KEY_MASQUERADE_ROULETTE, onChange);
}

export async function getMasqueradeRoulette(gameId) {
  return storageGet(gameId, KEY_MASQUERADE_ROULETTE);
}

export async function spinMasqueradeRoulette(gameId, masqueradeState) {
  const eliminatedNames = [...(masqueradeState.houses || [])
    .filter((h) => h.status === "eliminated")
    .flatMap((h) => h.members)]
    .sort();

  const res = await storageUpdate(gameId, KEY_MASQUERADE_ROULETTE, (fresh) => {
    if (fresh?.savedName) return null; // already spun — don't re-roll
    const savedName = eliminatedNames[Math.floor(Math.random() * eliminatedNames.length)];
    return { names: eliminatedNames, savedName, spunAt: Date.now() };
  });

  return { ok: true, alreadySpun: !res.ok, names: res.value?.names || eliminatedNames, savedName: res.value?.savedName || null };
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
export async function applyMasqueradeEliminations(gameId, masqueradeState, allPlayers, savedName = null) {
  const existing = await getPreEliminationStatus(gameId);
  if (existing?.applied) return { ok: true, alreadyApplied: true, eliminatedPlayerIds: existing.eliminatedPlayerIds };

  const eliminatedNames = (masqueradeState.houses || [])
    .filter((h) => h.status === "eliminated")
    .flatMap((h) => h.members)
    .filter((name) => name !== savedName);

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
    applied: true, appliedAt: Date.now(), eliminatedPlayerIds, eliminatedNames, savedName: savedName || null,
  });

  return { ok: true, alreadyApplied: false, eliminatedPlayerIds };
}
