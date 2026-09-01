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
export function resolveIdentities(players, { settings, round, isHost, revealed }) {
  const list = players || [];
  // `revealed` lets a caller override the reveal condition directly
  // (Traitors' own PlayPage passes its own finale-declared flag here,
  // since Traitors has no round-phase engine — round stays null forever
  // for it, so `round?.phase === PHASES.ENDED` could never fire) —
  // omitted, this falls back to Project B's own round-phase check.
  const isRevealed = revealed !== undefined ? revealed : round?.phase === PHASES.ENDED;
  const aliasActive = !!settings?.aliasEnabled && !isRevealed;

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

// The host-facing counterpart — used for the ROSTER PROP passed into
// host-side game components (ChallengeHost, ExileVoteHost, FatesHost,
// FinaleHost, HistoryTab, ChatHostPanel...), which mostly just render
// whatever `p.display_name` says without any alias-specific code of
// their own. Combining "Real (Alias)" directly into display_name here —
// rather than leaving it as a separate `.alias` field components would
// each need to remember to also render — is what makes "hosts see both,
// everywhere" actually hold everywhere, not just in the couple of spots
// that got hand-updated.
//
// NOT used for Admin's own player list/rename tool: that one edits
// display_name directly, and needs the real, uncombined value to edit —
// see components/AdminHost.jsx, which reads `players` directly instead
// of this.
export function resolveIdentitiesForHost(players, { settings, round }) {
  const list = players || [];
  const aliasActive = !!settings?.aliasEnabled;
  return list.map((p) => ({
    ...p,
    real_display_name: p.display_name,
    display_name: aliasActive && p.alias ? `${p.display_name} (${p.alias})` : p.display_name,
  }));
}

export function identityComplete(player, settings) {
  if (!player) return false;
  if (!player.color) return false;
  if (settings?.aliasEnabled && !player.alias) return false;
  return true;
}

// Traitors' own alias-onboarding check — deliberately separate from
// identityComplete above rather than reused: Traitors has no `color`
// concept at all (that's purely Project B's own onboarding step), so
// this only ever gates on alias, never color. See pages/play.jsx's
// Traitors branch for where this is actually consulted, and
// components/TraitorsAdminHost.jsx for the aliasEnabled toggle itself.
export function traitorsIdentityComplete(player, settings) {
  if (!player) return false;
  if (settings?.aliasEnabled && !player.alias) return false;
  return true;
}
