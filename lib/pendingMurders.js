import { STORAGE_KEY_TRAITOR_ROLES } from "./traitorData";
import { recordElimination } from "./seasonPlacement";

// ─── Pending (not-yet-revealed) murders ───
// Applying a murder used to flip players.alive straight away, which put
// the victim on their "you have been murdered" screen (and dropped them
// from every roster) before the Afternoon Tea arrivals had gone out in
// Slack — spoiling the whole point of the tea reveal.
//
// Now a murder is first recorded only in the host-only Traitor Roles
// state (host_state, which no player can read) as a pending murder. The
// shared players row is left untouched, so to every player the victim
// still looks alive. Once the tea arrivals finish posting (live or
// scheduled), or the host hits "Reveal now", revealPendingMurders below
// flips players.alive for real.
//
// `client` is passed in rather than imported so this runs both in the
// host's browser and in the service-role cron (pages/api/cron/
// post-scheduled.js), the same way lib/seasonPlacement.js does.

export function pendingMurderNames(tr) {
  return new Set((tr?.pendingMurders || []).map((m) => m.name));
}

// Host-side view of the roster: pending victims are treated as already
// dead, so they drop out of tea arrivals, murder targets and placement
// counts — even though players still see them alive.
export function hidePendingVictims(players, tr) {
  const pending = pendingMurderNames(tr);
  if (pending.size === 0) return players;
  return players.map((p) => (pending.has(p.display_name) ? { ...p, alive: false, pendingMurder: true } : p));
}

// Moves every pending murder onto the shared players table. With
// `onlyIfDue`, does nothing unless a reveal time was set (by scheduling
// the tea posts) and has passed. Claims the pending list with an atomic
// version check first, so the host tab and the cron can't both reveal
// (and double-record placement for) the same murder.
export async function revealPendingMurders(client, gameId, { onlyIfDue = false } = {}) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const { data: row } = await client
      .from("host_state")
      .select("value, version")
      .eq("game_id", gameId)
      .eq("key", STORAGE_KEY_TRAITOR_ROLES)
      .maybeSingle();
    const tr = row?.value;
    const pending = tr?.pendingMurders || [];
    if (pending.length === 0) return { ok: true, revealed: [] };
    if (onlyIfDue) {
      if (!(tr.murderRevealAt && Date.now() >= tr.murderRevealAt)) return { ok: true, revealed: [] };
      // The clock passing isn't enough — scheduled posts only go out when
      // the cron runs. Wait until every tea post due by the reveal time
      // has actually been sent (or cancelled).
      const { data: unsent, error: unsentErr } = await client
        .from("scheduled_slack_posts")
        .select("id")
        .eq("game_id", gameId)
        .eq("cancelled", false)
        .is("posted_at", null)
        .lte("post_at", new Date(tr.murderRevealAt).toISOString())
        .limit(1);
      if (unsentErr || (unsent && unsent.length > 0)) return { ok: true, revealed: [] };
    }

    const next = {
      ...tr,
      pendingMurders: [],
      murderRevealAt: null,
      log: [
        { text: `🫖 Murder revealed to players: ${pending.map((m) => m.name).join(", ")}`, round: tr.round, time: new Date().toLocaleTimeString() },
        ...(tr.log || []),
      ],
    };
    const { data: updated, error } = await client
      .from("host_state")
      .update({ value: next, version: row.version + 1, updated_at: new Date().toISOString() })
      .eq("game_id", gameId)
      .eq("key", STORAGE_KEY_TRAITOR_ROLES)
      .eq("version", row.version)
      .select();
    if (error || !updated || updated.length === 0) continue;

    for (const m of pending) {
      const { error: upErr } = await client.from("players").update({ alive: false, elimination_type: m.elimType }).eq("id", m.id);
      if (upErr) console.error(`Failed to reveal murder of ${m.name}:`, upErr);
      if (m.recordPlacement) await recordElimination(client, gameId, m.id);
    }
    return { ok: true, revealed: pending };
  }
  return { ok: false, revealed: [] };
}
