import { storageGet, storageUpdate } from "./gameStorage";

export const STORAGE_KEY_PANDORA = "traitors:pandora-box";

export const PANDORA_TIMER_PRESETS = [
  { label: "5 minutes", minutes: 5 },
  { label: "10 minutes", minutes: 10 },
  { label: "15 minutes", minutes: 15 },
  { label: "30 minutes", minutes: 30 },
  { label: "1 hour", minutes: 60 },
];

// Snapshots the eligible-player list at start time (same approach every
// other challenge in this project uses for its `players` list) so
// eligibility can't silently drift mid-window if the host edits the roster.
export function computePandoraEligible(mode, alivePlayers, allPlayers, selectedNames) {
  if (mode === "all") return allPlayers.map((p) => p.name);
  if (mode === "selected") return (selectedNames || []).slice();
  return alivePlayers.map((p) => p.name); // "alive" (default)
}

export function pandoraStatusMeta(status) {
  switch (status) {
    case "active": return { label: "Active", color: "#7a9a5c" };
    case "opened": return { label: "Opened", color: "#c9a84c" };
    case "expired": return { label: "Expired", color: "#c45c3c" };
    case "closed": return { label: "Closed Early", color: "#c45c3c" };
    default: return { label: "Inactive", color: "#706050" };
  }
}

// Player-side click flow — unchanged logic from the original. Re-checks
// shared state immediately before writing, then writes through an atomic
// update, so of many players clicking at once, only the very first one
// actually lands; everyone else's click is rejected against the freshest
// data instead of racing on stale local state.
export async function openPandoraBox(gameId, player) {
  const fresh = await storageGet(gameId, STORAGE_KEY_PANDORA);
  if (!fresh || fresh.status !== "active") return { ok: false, reason: "not_active" };
  if (fresh.paused) return { ok: false, reason: "paused" };
  if (Date.now() > fresh.expiresAt) {
    await storageUpdate(gameId, STORAGE_KEY_PANDORA, (d) => {
      if (!d || d.status !== "active") return null;
      return { ...d, status: "expired", active: false };
    });
    return { ok: false, reason: "expired" };
  }
  if (fresh.openedBy) return { ok: false, reason: "already_opened" };
  if (fresh.eligibleNames && !fresh.eligibleNames.includes(player.name)) return { ok: false, reason: "not_eligible" };

  const res = await storageUpdate(gameId, STORAGE_KEY_PANDORA, (d) => {
    if (!d || d.status !== "active" || d.openedBy || d.paused) return null; // someone beat us to it
    if (Date.now() > d.expiresAt) return null;
    return {
      ...d,
      status: "opened",
      active: false,
      openedBy: { playerId: player.id, playerName: player.name, openedAt: Date.now() },
    };
  });
  if (!res.ok) {
    // Either aborted (already opened/expired underneath us) or a genuine
    // storage failure. Re-read to report the true reason to the player.
    const latest = await storageGet(gameId, STORAGE_KEY_PANDORA);
    if (latest?.openedBy) return { ok: false, reason: "already_opened" };
    if (latest && Date.now() > latest.expiresAt) return { ok: false, reason: "expired" };
    return { ok: false, reason: "failed" };
  }
  return { ok: true, value: res.value };
}
