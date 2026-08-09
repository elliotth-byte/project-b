import { PHASES } from "./gameState";

// ─── Player identity resolution ───
// The alias, once active, needs to override a player's name basically
// everywhere — MemoryWall tiles, leaderboards, host voter lists,
// confessionals, chat, history, all of it. Rather than editing every one
// of those individually, this is applied ONCE, wherever a `players`
// array first gets fetched (pages/play.jsx, components/HostPanels.jsx),
// and everything downstream just keeps reading `display_name` like it
// always has — it's already been swapped by the time any component sees
// it.
//
// isHost: true always keeps real names (a host needs to know who's
// actually who to run the season) — the alias is added alongside as
// `.alias` for reference, never substituted into `.display_name`, so
// nothing that keys off a host-side display_name (e.g.
// ParticipantPicker's manual-select, which stores raw name strings) can
// break because of this.
//
// Once round.phase reaches ENDED, aliases stop being substituted for
// EVERYONE, players included — that's the finale reveal: no separate
// dramatic moment, just real names becoming visible everywhere again
// from that point on, retroactively across the whole season's history
// too (anything rendered via a live players list, which is nearly
// everything — see the caveat in components/AdminHost.jsx's alias
// setting copy for the couple of spots that bake a name in at write time
// instead and won't retroactively flip).
export function resolveIdentities(players, { settings, round, isHost }) {
  const list = players || [];
  const aliasActive = !!settings?.aliasEnabled && round?.phase !== PHASES.ENDED;

  if (isHost || !aliasActive) {
    return list.map((p) => ({ ...p, real_display_name: p.display_name }));
  }

  return list.map((p) => ({
    ...p,
    real_display_name: p.display_name,
    // Falls back to the real name if this specific player hasn't
    // actually chosen an alias yet (mid-approval, or joined before the
    // toggle was turned on) — never show a blank identity.
    display_name: p.alias || p.display_name,
  }));
}

export function identityComplete(player, settings) {
  if (!player) return false;
  if (!player.color) return false;
  if (settings?.aliasEnabled && !player.alias) return false;
  return true;
}
