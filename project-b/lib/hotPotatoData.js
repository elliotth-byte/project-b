import { storageUpdate } from "./gameStorage";

export const STORAGE_KEY_HOT_POTATO = "traitors:hot-potato";

// Unchanged from the original — formats milliseconds as m:ss
export function fmtTime(ms) {
  if (ms <= 0) return "0:00";
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// Mutates `fresh` in place. When a potato's timer runs out, its holder is
// eliminated. If more survivors remain than the target winner count, the
// potato is immediately reassigned — fresh random 15-60 min timer, new
// random holder among the survivors — instead of just disappearing. Once
// survivors drop to the target count, the game ends right there and any
// remaining potatoes stop mattering. Returns true if anything changed.
export function processPotatoes(fresh) {
  let changed = false;
  const now = Date.now();
  const numWinners = fresh.numWinners || 1;

  fresh.potatoes.forEach((pot) => {
    if (pot.exploded || !pot.holder || now < pot.expiresAt) return;
    if (!fresh.eliminated.includes(pot.holder)) fresh.eliminated.push(pot.holder);
    changed = true;

    const remaining = fresh.players.filter((p) => !fresh.eliminated.includes(p.name)).map((p) => p.name);
    if (remaining.length <= numWinners) {
      pot.exploded = true;
      pot.holder = null;
      return;
    }

    // Reassign to a random survivor, preferring someone not already
    // holding a different active potato (so one person isn't juggling both).
    const otherHolders = fresh.potatoes.filter((p2) => p2.id !== pot.id && !p2.exploded && p2.holder).map((p2) => p2.holder);
    const candidates = remaining.filter((n) => !otherHolders.includes(n));
    const pool = candidates.length ? candidates : remaining;
    const newHolder = pool[Math.floor(Math.random() * pool.length)];
    const dur = (15 + Math.floor(Math.random() * 46)) * 60 * 1000;
    pot.holder = newHolder;
    pot.startedAt = now;
    pot.durationMs = dur;
    pot.expiresAt = now + dur;
    pot.timesReassigned = (pot.timesReassigned || 0) + 1;
  });

  const remaining = fresh.players.filter((p) => !fresh.eliminated.includes(p.name));
  if (remaining.length <= numWinners && !fresh.winner) {
    fresh.winner = remaining.map((p) => p.name);
    fresh.active = false;
    changed = true;
  }
  return changed;
}

// ─── What's different from the original here ───
// The original had every open host/player tab run its own setInterval that
// read storage, checked for expired timers, and wrote back directly — a
// plain read-then-write with no protection against two tabs doing this at
// the same instant. This version does the same "someone's open tab has to
// be the one to notice the timer ran out" thing (there's no serverless
// cron running this project, so that limitation carries over from the
// original) but the actual read-check-write now goes through storageUpdate,
// which uses a real atomic compare-and-swap — so if two tabs both notice an
// expired potato in the same second, only one write actually lands and the
// other safely no-ops instead of the two clobbering each other.
export async function tickHotPotato(gameId) {
  return storageUpdate(gameId, STORAGE_KEY_HOT_POTATO, (fresh) => {
    if (!fresh || !fresh.active || fresh.paused) return null;
    const changed = processPotatoes(fresh);
    return changed ? fresh : null;
  });
}
