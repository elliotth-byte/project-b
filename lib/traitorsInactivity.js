import { isShielded, nextStrikeState, isStrikeDecayRound, decayedStrikeCount } from "./inactivity";
import { recordElimination } from "./seasonPlacement";

// ─── Traitors' own inactivity-strike pass ───
// Parallel to Project B's applyInactivityStrike/checkInstantInactivityRemoval/
// applyStrikeDecayIfDue (lib/roundEngine.js) — reuses the same PURE strike-
// math helpers from lib/inactivity.js and the same recordElimination call,
// but deliberately narrower: Project B checks votes + challenge participation
// + messages, with a separate "missed all three" instant-removal leg.
// Traitors has 11 separate mini-games with no uniform "did they play"
// signal, so this only checks: did this player cast a Roundtable vote this
// round, or (only relevant when chat is enabled too) send at least one group
// chat message since the round started. No instant-removal leg — just the
// same 3-strikes-and-out path, toggled on per season via
// settings.inactivityEnabled (see lib/gameState.js) rather than Project B's
// always-on behavior. Round 1 is exempt, same reasoning as Project B's own
// system (a brand new player's first round).
export async function applyTraitorsRoundInactivity(supabase, gameId, { round, alivePlayers, voterNames, chatSenderIds }) {
  if (round < 2) return [];
  const struck = [];
  for (const p of alivePlayers) {
    const voted = voterNames.has(p.display_name);
    const messaged = !!chatSenderIds?.has(p.id);
    if (voted || messaged) continue;

    // Fresh read, not the `alivePlayers` snapshot passed in — a shield
    // or a strike from elsewhere could have landed since that was
    // fetched, same reasoning as Project B's own applyInactivityStrike.
    const { data: row } = await supabase.from("players").select("inactivity_strikes, inactivity_shielded, alive").eq("id", p.id).maybeSingle();
    if (!row || !row.alive || isShielded(row)) continue;

    const { newStrikes, removed } = nextStrikeState(row.inactivity_strikes);
    const patch = { inactivity_strikes: newStrikes };
    if (removed) {
      patch.alive = false;
      patch.elimination_type = "removed_inactivity";
    }
    const { error } = await supabase.from("players").update(patch).eq("id", p.id);
    if (error) { console.error("Traitors inactivity strike failed:", error); continue; }
    if (removed) await recordElimination(supabase, gameId, p.id);
    struck.push({ id: p.id, name: p.display_name, newStrikes, removed });
  }
  return struck;
}

// Strike decay — round 3, 6, 9, ..., same cadence/intent as Project B's
// own applyStrikeDecayIfDue, just keyed to Roundtable's own round counter
// instead of Project B's round-phase engine.
export async function decayTraitorsStrikesIfDue(supabase, gameId, newRoundNumber) {
  if (!isStrikeDecayRound(newRoundNumber)) return;
  const { data: strikedPlayers, error } = await supabase.from("players").select("id, inactivity_strikes").eq("game_id", gameId).gt("inactivity_strikes", 0);
  if (error || !strikedPlayers || strikedPlayers.length === 0) return;
  for (const p of strikedPlayers) {
    const { error: updateError } = await supabase.from("players").update({ inactivity_strikes: decayedStrikeCount(p.inactivity_strikes) }).eq("id", p.id);
    if (updateError) console.error("Traitors strike decay write failed for player", p.id, updateError);
  }
}
